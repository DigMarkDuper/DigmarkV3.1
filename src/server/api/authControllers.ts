/**
 * Auth API controllers (login / logout / me). Framework-free: take a resolved
 * session (or credentials), return a plain Response. Route handlers are thin.
 */

import {
  authenticate,
  clearCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  serializeCookie,
  isLocalhostRequest,
} from "@/lib/auth";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { record, type AuditLog } from "@/lib/audit";
import type { Role, Session } from "@/lib/auth";

/**
 * POST /api/auth/login — public. Validates credentials, issues a signed httpOnly
 * session cookie (Secure unless localhost), records a login audit entry.
 *
 * `request` only needs `.url` (for Secure-cookie detection). `auditLog` is
 * injectable for tests.
 */
export async function loginController(
  request: { url?: string },
  body: unknown,
  auditLog: AuditLog,
  env: Record<string, string | undefined> = process.env,
): Promise<Response> {
  try {
    const b = body as { username?: unknown; password?: unknown } | null | undefined;
    if (!b || typeof b.username !== "string" || typeof b.password !== "string") {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "username and password are required.");
    }
    const authed = authenticate(b.username, b.password, env);
    if (!authed) {
      record(auditLog, {
        actor: b.username || "anonymous",
        operation: "login",
        success: false,
        summary: "Login failed (invalid credentials).",
      });
      throw apiError(ErrorCodes.AUTH_FAILED, "Invalid username or password.");
    }
    const { token, session } = authed;
    const secure = !isLocalhostRequest(request);
    const cookie = serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAgeMs: SESSION_TTL_MS,
    });
    record(auditLog, {
      actor: session.identity,
      operation: "login",
      success: true,
      summary: `Login succeeded as ${session.role}.`,
    });
    return Response.json(
      { ok: true, identity: session.identity, role: session.role },
      { status: 200, headers: { "Set-Cookie": cookie } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/auth/logout — any authenticated user. Clears the session cookie.
 */
export async function logoutController(
  _request: { url?: string },
  session: Session | null,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    if (session) {
      record(auditLog, {
        actor: session.identity,
        operation: "logout",
        success: true,
        summary: "Logged out.",
      });
    }
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Set-Cookie": clearCookie(SESSION_COOKIE) } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * GET /api/auth/me — any authenticated user. Returns current identity + role.
 */
export async function meController(session: Session | null): Promise<Response> {
  try {
    if (!session) {
      throw apiError(ErrorCodes.AUTH_FAILED, "Authentication required.");
    }
    return Response.json(
      { ok: true, identity: session.identity, role: session.role },
      { status: 200 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

export type { Role };