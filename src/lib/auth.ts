/**
 * Server-side authentication (Phase C, Option B: identity + signed session).
 *
 * Mechanism:
 *  - Credentials come from an env-defined users map (AUTH_USERS) — see
 *    parseUsers below. No user credentials are committed to the repo; the map
 *    lives in the gitignored `.env.local`.
 *  - On successful login we issue a self-contained, server-signed session token
 *    carried in an httpOnly, SameSite=Lax cookie (Secure when not localhost).
 *  - The token = base64url(payload) + "." + base64url(HMAC-SHA256(payload)).
 *    payload = { sub: identity, role, iat, exp }. Verified + expiry-checked on
 *    every read. Nothing sensitive is stored client-side.
 *  - AUTH_SECRET is required and must be >= 16 chars. Never exposed to browser.
 *  - Passwords are compared in constant time (timingSafeEqual on SHA-256
 *    digests) to avoid leaking password length/timing.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { apiError, ErrorCodes } from "./errors";

export type Role = "viewer" | "editor";

/** Validated, current session derived from a cookie token. */
export interface Session {
  /** Identity (username). */
  identity: string;
  role: Role;
  /** Epoch ms issued. */
  iat: number;
  /** Epoch ms expiry. */
  exp: number;
}

/** Minimum AUTH_SECRET length (bytes) we accept. */
export const MIN_SECRET_LENGTH = 16;
/** Session lifetime: 8 hours. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Cookie name. */
export const SESSION_COOKIE = "dm_session";

/** Minimal cookie-reader surface (NextRequest.cookies satisfies this). */
export interface CookieJar {
  get(name: string): { value?: string } | string | null | undefined;
}
/** Minimal request surface used for auth (NextRequest satisfies this). */
export interface RequestLite {
  cookies?: CookieJar;
  url?: string;
}

/** A configured internal user account. */
export interface UserAccount {
  username: string;
  password: string;
  role: Role;
}

/**
 * Parse the AUTH_USERS env map: "username:password:role,user2:pass2:role2".
 * role is optional and defaults to 'viewer'. Any malformed segment (missing
 * username or password) is skipped.
 */
export function parseUsers(env: Record<string, string | undefined> = process.env): UserAccount[] {
  const raw = env.AUTH_USERS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const [username, password, roleRaw] = part.split(":").map((x) => x.trim());
      const role: Role = roleRaw === "editor" ? "editor" : "viewer";
      return { username, password: password ?? "", role };
    })
    .filter((u) => Boolean(u.username) && Boolean(u.password));
}

/** Read AUTH_SECRET; null when missing/too short (config error). */
export function authSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.AUTH_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return s;
}

// --- Token signing / verification -----------------------------------------

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
function hmacToken(secret: string, payload: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}
function sha256hex(v: string): Buffer {
  return createHash("sha256").update(v, "utf8").digest();
}

/** Constant-time password comparison over SHA-256 digests (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const da = sha256hex(a);
  const db = sha256hex(b);
  return da.length === db.length && timingSafeEqual(da, db);
}

function signPayload(secret: string, payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${hmacToken(secret, body)}`;
}

/** Build a signed session token for an authenticated identity. */
export function createSessionToken(
  identity: string,
  role: Role,
  secret: string,
  now: number = Date.now(),
  ttlMs: number = SESSION_TTL_MS,
): { token: string; session: Session } {
  const session: Session = { identity, role, iat: now, exp: now + ttlMs };
  return { token: signPayload(secret, session as unknown as Record<string, unknown>), session };
}

/**
 * Verify + parse a session token. Returns null for any invalid/tampered/
 * expired token (or when AUTH_SECRET is unconfigured).
 */
export function verifySessionToken(token: string | undefined | null, secret: string | null): Session | null {
  if (!token || !secret) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot < 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) {
    return null;
  }
  const expected = Buffer.from(hmacToken(secret, payload), "base64url");
  const provided = Buffer.from(sig, "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null; // tampered signature
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const d = data as Record<string, unknown>;
  if (typeof d.exp !== "number" || Date.now() > d.exp) {
    return null; // expired
  }
  if (typeof d.identity !== "string" || (d.role !== "viewer" && d.role !== "editor")) {
    return null;
  }
  return {
    identity: d.identity,
    role: d.role,
    iat: typeof d.iat === "number" ? d.iat : 0,
    exp: d.exp,
  };
}

// --- Request-level helpers -------------------------------------------------

/**
 * Read + verify the session from a request cookie. Returns null when no valid
 * session (missing/tampered/expired). Never throws for a bad token.
 */
export function getSession(request: RequestLite | null | undefined, env: Record<string, string | undefined> = process.env): Session | null {
  if (!request?.cookies) {
    return null;
  }
  const cookie = request.cookies.get(SESSION_COOKIE);
  const value = typeof cookie === "string" ? cookie : cookie?.value;
  return verifySessionToken(value, authSecret(env));
}

/** Authenticate credentials against the users map (constant-time compare). */
export function authenticate(
  identity: string,
  password: string,
  env: Record<string, string | undefined> = process.env,
): { token: string; session: Session } | null {
  const users = parseUsers(env);
  const user = users.find((u) => u.username === identity);
  if (!user) {
    return null;
  }
  if (!safeEqual(password, user.password)) {
    return null;
  }
  const secret = authSecret(env);
  if (!secret) {
    throw apiError(ErrorCodes.INTERNAL, "Authentication is not configured (AUTH_SECRET is missing or too short).");
  }
  return createSessionToken(identity, user.role, secret);
}

// --- Authorization ---------------------------------------------------------

const RANK: Record<Role, number> = { viewer: 1, editor: 2 };

/** Require any valid session; throw 401 AUTH_FAILED otherwise. */
export function requireAuth(session: Session | null | undefined): Session {
  if (!session) {
    throw apiError(ErrorCodes.AUTH_FAILED, "Authentication required.");
  }
  return session;
}

/**
 * Require a session with at least `role` privilege. editor satisfies viewer;
 * viewer does NOT satisfy editor. Distinguishes 403 (insufficient role) from
 * 401 (no/invalid session).
 */
export function requireRole(session: Session | null | undefined, role: Role): Session {
  const s = requireAuth(session);
  if (RANK[s.role] < RANK[role]) {
    throw apiError(ErrorCodes.FORBIDDEN, `This operation requires the '${role}' role.`);
  }
  return s;
}

// --- Cookie serialization --------------------------------------------------

export interface CookieOptions {
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
  maxAgeMs?: number;
  expires?: Date;
  path?: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAgeMs !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAgeMs / 1000)}`);
  }
  if (opts.expires) {
    parts.push(`Expires=${opts.expires.toUTCString()}`);
  }
  if (opts.path) {
    parts.push(`Path=${opts.path}`);
  }
  if (opts.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (opts.sameSite) {
    parts.push(`SameSite=${opts.sameSite}`);
  }
  if (opts.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Expired-cookie Set-Cookie value used on logout. */
export function clearCookie(name: string): string {
  return serializeCookie(name, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

/** True when the request host is localhost/loopback (secure cookie off). */
export function isLocalhostRequest(request: RequestLite): boolean {
  try {
    const hostname = new URL(request.url ?? "http://localhost").hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true; // unparseable URL -> assume local/dev
  }
}