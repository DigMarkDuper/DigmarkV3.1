import { describe, expect, it } from "vitest";
import { decodeApiError } from "@/lib/api-client";

/** Build a minimal Response-like object standing in for the fetch response. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("decodeApiError", () => {
  it("maps a standard {error:{...}} body to the contract shape", async () => {
    const failure = await decodeApiError(
      fakeResponse(401, { error: { code: "AUTH_FAILED", message: "Authentication required.", status: 401 } }),
    );
    expect(failure).toEqual({ code: "AUTH_FAILED", message: "Authentication required.", status: 401 });
  });

  it("falls back to a generic INTERNAL failure for non-JSON errors", async () => {
    const res = { status: 500, json: async () => {
      throw new Error("not json");
    } } as unknown as Response;
    const failure = await decodeApiError(res);
    expect(failure.code).toBe("INTERNAL");
    expect(failure.status).toBe(500);
  });

  it("falls back to INTERNAL when the body lacks the error envelope", async () => {
    const failure = await decodeApiError(fakeResponse(502, { ok: false }));
    expect(failure).toEqual({ code: "INTERNAL", message: "Unexpected server error.", status: 502 });
  });
});