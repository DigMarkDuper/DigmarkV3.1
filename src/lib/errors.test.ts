import { describe, expect, it, vi } from "vitest";
import { ApiError, ErrorCodes, okJson, toErrorResponse } from "./errors";

describe("ApiError", () => {
  it("maps codes to correct HTTP status", () => {
    expect(new ApiError(ErrorCodes.AUTH_FAILED, "x").status).toBe(401);
    expect(new ApiError(ErrorCodes.FORBIDDEN, "x").status).toBe(403);
    expect(new ApiError(ErrorCodes.VALIDATION_FAILED, "x").status).toBe(400);
    expect(new ApiError(ErrorCodes.NOT_FOUND, "x").status).toBe(404);
    expect(new ApiError(ErrorCodes.ADAPTER_FAILED, "x").status).toBe(502);
    expect(new ApiError(ErrorCodes.INTERNAL, "x").status).toBe(500);
  });
});

describe("toErrorResponse", () => {
  it("returns the consistent {error:{code,message,status}} shape", async () => {
    const res = toErrorResponse(new ApiError(ErrorCodes.NOT_FOUND, "Unknown table 'x'."));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "Unknown table 'x'.", status: 404 } });
  });

  it("hides internal detail for unexpected errors (generic 500, no leak)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse(new Error("secret private key leaked!"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("Unexpected server error.");
    expect(text).not.toContain("secret private key");
    spy.mockRestore();
  });

  it("never leaks ApiError.detail to the client", async () => {
    const res = toErrorResponse(
      new ApiError(ErrorCodes.ADAPTER_FAILED, "Sheet operation failed.", { code: "X", message: "internal" }),
    );
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("internal");
  });
});

describe("okJson", () => {
  it("returns JSON with default 200", async () => {
    const res = okJson({ ok: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});