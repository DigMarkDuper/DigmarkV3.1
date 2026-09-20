import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  buildImportBody,
  isErrorBody,
  validateClientFiles,
  validateFileMeta,
  InsightConnectError,
} from "@/workspaces/insightUpload";

describe("insightUpload — client-side file gate", () => {
  it("accepts .csv and .xlsx (case-insensitive)", () => {
    expect(validateFileMeta("views.CSV", 100)).toBeNull();
    expect(validateFileMeta("Overview.xlsx", 100)).toBeNull();
  });

  it("rejects unsupported extensions", () => {
    expect(validateFileMeta("x.txt", 100)).toContain("tidak valid");
    expect(validateFileMeta("x.tsv", 100)).toContain("tidak valid");
    expect(validateFileMeta("x.pdf", 100)).toContain("tidak valid");
  });

  it("rejects files over 10 MB", () => {
    expect(validateFileMeta("big.csv", MAX_FILE_BYTES + 1)).toContain("tidak valid");
    expect(validateFileMeta("ok.csv", MAX_FILE_BYTES)).toBeNull();
  });

  it("keeps the valid files and reports only the rejected ones", () => {
    const { valid, rejected } = validateClientFiles([
      { name: "a.csv", size: 10 },
      { name: "b.txt", size: 10 },
      { name: "c.xlsx", size: 10 },
      { name: "d.csv", size: MAX_FILE_BYTES + 1 },
    ]);
    expect(valid.map((f) => f.name)).toEqual(["a.csv", "c.xlsx"]);
    expect(rejected.length).toBe(2);
    expect(rejected[0]).toContain("b.txt");
    expect(rejected[1]).toContain("d.csv");
  });

  it("is empty-safe", () => {
    expect(validateClientFiles([])).toEqual({ valid: [], rejected: [] });
  });
});

describe("insightUpload — payload build (mode contract)", () => {
  it("builds a preview body with mode new and no platform by default", () => {
    const body = buildImportBody([{ name: "a.csv", contentB64: "QQ==" }], {
      confirm: false,
      mode: "new",
    });
    expect(body).toEqual({
      files: [{ name: "a.csv", contentB64: "QQ==" }],
      confirm: false,
      mode: "new",
    });
    expect(body).not.toHaveProperty("platform");
  });

  it("includes platform only when a manual value is given", () => {
    const body = buildImportBody([{ name: "a.csv", contentB64: "QQ==" }], {
      platform: "TikTok",
      confirm: true,
      mode: "all",
    });
    expect(body.platform).toBe("TikTok");
    expect(body.confirm).toBe(true);
    expect(body.mode).toBe("all");
  });

  it("omits an empty platform (import stays gated until a choice is made)", () => {
    const body = buildImportBody([{ name: "a.csv", contentB64: "QQ==" }], {
      platform: "",
      confirm: true,
      mode: "new",
    });
    expect(body).not.toHaveProperty("platform");
  });
});

describe("insightUpload — response / error decode", () => {
  it("recognizes an ApiError body shape", () => {
    expect(isErrorBody({ error: { code: "VALIDATION_FAILED", message: "x" } })).toBe(true);
    expect(isErrorBody({ ok: false, blockReasons: ["a"] })).toBe(false);
    expect(isErrorBody(null)).toBe(false);
    expect(isErrorBody("nope")).toBe(false);
  });

  it("connectivity error carries user-safe Indonesian copy", () => {
    const e = new InsightConnectError();
    expect(e.message).toContain("Tidak bisa terhubung ke server");
  });
});