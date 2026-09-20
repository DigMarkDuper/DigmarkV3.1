/**
 * Central error contract for the Digmark V3.1 API (Phase C).
 *
 * Every API failure is returned as a single consistent JSON shape:
 *   { error: { code, message, status } }
 *
 * Standardised machine codes + HTTP status mapping:
 *   AUTH_FAILED(401)  -> no/invalid/expired session
 *   FORBIDDEN(403)    -> authenticated but role insufficient
 *   VALIDATION_FAILED(400) -> malformed/unsupported input
 *   NOT_FOUND(404)    -> unknown table key / absent resource
 *   ADAPTER_FAILED(502)    -> underlying storage (Sheets) failure
 *   INTERNAL(500)     -> unexpected server error
 *
 * Security: the client NEVER sees credentials, private keys, raw internal
 * secrets, or stack traces. Unexpected server errors log their detail
 * server-side and return only a generic message.
 */

export const ErrorCodes = {
  AUTH_FAILED: "AUTH_FAILED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  ADAPTER_FAILED: "ADAPTER_FAILED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const HTTP_STATUS: Record<ErrorCode, number> = {
  AUTH_FAILED: 401,
  FORBIDDEN: 403,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  ADAPTER_FAILED: 502,
  INTERNAL: 500,
};

/** A typed, serialisable API error. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Internal diagnostic detail — logged server-side, NEVER returned to the client. */
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.detail = detail;
  }
}

/** Convenience constructor. */
export function apiError(code: ErrorCode, message: string, detail?: unknown): ApiError {
  return new ApiError(code, message, detail);
}

/**
 * Convert any thrown value into a consistent error `Response`.
 * Unexpected errors (not ApiError) become a generic 500; their detail is
 * logged server-side only.
 */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    // Adapter failures: log the underlying detail server-side, return generic.
    if (err.code === ErrorCodes.ADAPTER_FAILED && err.detail !== undefined) {
      console.error(`[api][ADAPTER_FAILED] ${err.message}`, err.detail);
    }
    return Response.json(
      { error: { code: err.code, message: err.message, status: err.status } },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api][INTERNAL] Unexpected server error:", message);
  return Response.json(
    {
      error: { code: ErrorCodes.INTERNAL, message: "Unexpected server error.", status: 500 },
    },
    { status: 500 },
  );
}

/** JSON success response with the default 200 status (or override). */
export function okJson<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}