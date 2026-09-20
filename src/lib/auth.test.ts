import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import {
  authenticate,
  authSecret,
  clearCookie,
  createSessionToken,
  getSession,
  isLocalhostRequest,
  parseUsers,
  requireAuth,
  requireRole,
  safeEqual,
  serializeCookie,
  verifySessionToken,
  type Session,
} from "./auth";

const SECRET = "0123456789abcdef0123456789abcdef";
const ENV = { AUTH_SECRET: SECRET, AUTH_USERS: "alice:pw:viewer,bob:pw2:editor,ed:no-role" };

describe("parseUsers", () => {
  it("parses username:password:role triples, defaulting role to viewer", () => {
    const users = parseUsers(ENV);
    const alice = users.find((u) => u.username === "alice");
    const bob = users.find((u) => u.username === "bob");
    const noRole = users.find((u) => u.username === "ed");
    expect(alice?.role).toBe("viewer");
    expect(bob?.role).toBe("editor");
    expect(noRole?.role).toBe("viewer"); // missing role -> viewer
  });
  it("returns [] when AUTH_USERS is unset", () => {
    expect(parseUsers({})).toEqual([]);
  });
});

describe("authSecret", () => {
  it("returns the secret when >= 16 chars", () => {
    expect(authSecret({ AUTH_SECRET: SECRET })).toBe(SECRET);
  });
  it("returns null when missing or too short", () => {
    expect(authSecret({})).toBeNull();
    expect(authSecret({ AUTH_SECRET: "short" })).toBeNull();
  });
});

describe("safeEqual (constant-time password compare)", () => {
  it("matches equal strings", () => {
    expect(safeEqual("pw", "pw")).toBe(true);
  });
  it("rejects unequal strings regardless of length", () => {
    expect(safeEqual("pw", "wrong")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("session token sign/verify", () => {
  it("round-trips a signed session", () => {
    const { token, session } = createSessionToken("alice", "viewer", SECRET);
    const parsed = verifySessionToken(token, SECRET);
    expect(parsed).toEqual(session);
  });
  it("rejects a tampered payload (signature mismatch)", () => {
    const { token } = createSessionToken("alice", "viewer", SECRET);
    const [payload, sig] = token.split(".");
    const tampered = `${payload}x.${sig}`;
    expect(verifySessionToken(tampered, SECRET)).toBeNull();
  });
  it("rejects a wrong-secret signature", () => {
    const { token } = createSessionToken("alice", "viewer", SECRET);
    expect(verifySessionToken(token, "ffffffffffffffffffffffffffffffff")).toBeNull();
  });
  it("rejects an expired token", () => {
    const { token } = createSessionToken("alice", "viewer", SECRET, Date.now() - 5000, 1000);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });
  it("rejects a missing/empty token", () => {
    expect(verifySessionToken(null, SECRET)).toBeNull();
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
  });
});

describe("getSession (request cookie parsing)", () => {
  it("returns the session when a valid cookie is present", () => {
    const { token, session } = createSessionToken("bob", "editor", SECRET);
    const request = { cookies: { get: (n: string) => (n === "dm_session" ? { value: token } : undefined) } };
    const s = getSession(request as never, ENV);
    expect(s?.identity).toBe("bob");
    expect(s?.role).toBe("editor");
    expect(s?.exp).toBe(session.exp);
  });
  it("returns null when no cookie", () => {
    expect(getSession({ cookies: { get: () => undefined } } as never, ENV)).toBeNull();
  });
  it("returns null when cookie is tampered", () => {
    const { token } = createSessionToken("bob", "editor", SECRET);
    const bad = token + "x";
    const request = { cookies: { get: () => ({ value: bad }) } };
    expect(getSession(request as never, ENV)).toBeNull();
  });
  it("returns null when AUTH_SECRET unconfigured", () => {
    const { token } = createSessionToken("bob", "editor", SECRET);
    const request = { cookies: { get: () => ({ value: token }) } };
    expect(getSession(request as never, {})).toBeNull();
  });
});

describe("authenticate + login flow", () => {
  it("authenticates valid credentials and returns a session", () => {
    const authed = authenticate("bob", "pw2", ENV);
    expect(authed?.session.identity).toBe("bob");
    expect(authed?.session.role).toBe("editor");
    expect(typeof authed?.token).toBe("string");
  });
  it("rejects wrong password and unknown user", () => {
    expect(authenticate("bob", "wrong", ENV)).toBeNull();
    expect(authenticate("unknown", "pw2", ENV)).toBeNull();
  });
});

describe("requireAuth / requireRole", () => {
  function session(role: "viewer" | "editor"): Session {
    return { identity: "u", role, iat: 0, exp: 0 };
  }
  it("requireAuth throws 401 when no session", () => {
    expect(() => requireAuth(null)).toThrow(ApiError);
  });
  it("viewer can read (requireRole viewer ok), cannot edit", () => {
    expect(requireRole(session("viewer"), "viewer").role).toBe("viewer");
    expect(() => requireRole(session("viewer"), "editor")).toThrow();
  });
  it("editor satisfies both viewer and editor requirements", () => {
    expect(requireRole(session("editor"), "editor").role).toBe("editor");
    expect(requireRole(session("editor"), "viewer").role).toBe("editor");
  });
});

describe("cookie helpers / host detection", () => {
  it("serializeCookie emits secure/httpOnly/sameSite flags", () => {
    const c = serializeCookie("dm_session", "tok", { httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAgeMs: 1000 });
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=lax");
    expect(c).toContain("Secure");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=1");
  });
  it("clearCookie expires the cookie", () => {
    const c = clearCookie("dm_session");
    expect(c).toContain("dm_session=");
    expect(c).toContain("Expires=Thu, 01 Jan 1970");
  });
  it("isLocalhostRequest is true for localhost and false for a public host", () => {
    expect(isLocalhostRequest({ url: "http://localhost:3000" })).toBe(true);
    expect(isLocalhostRequest({ url: "http://127.0.0.1:3000" })).toBe(true);
    expect(isLocalhostRequest({ url: "https://digmark.example.com" })).toBe(false);
  });
});