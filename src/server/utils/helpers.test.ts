import { describe, expect, it } from "vitest";
import {
  cleanIdr,
  cleanText,
  isClosingStatus,
  normalizePhone,
  resolveWaStatusCol,
} from "./helpers";

// Parity assertions taken VERBATIM from scripts/smoke_test.py (Phase 1).
describe("helpers parity (utils/helpers.py -> helpers.ts)", () => {
  it("normalizePhone('0813-000') -> '62813000'", () => {
    expect(normalizePhone("0813-000")).toBe("62813000");
  });
  it("normalizePhone('628130.0') -> '628130'", () => {
    expect(normalizePhone("628130.0")).toBe("628130");
  });
  it("normalizePhone('') -> ''", () => {
    expect(normalizePhone("")).toBe("");
  });
  it("cleanIdr('Rp 1.000.000,00') -> 1000000.0", () => {
    expect(cleanIdr("Rp 1.000.000,00")).toBe(1000000);
  });
  it("cleanIdr('') -> 0.0", () => {
    expect(cleanIdr("")).toBe(0);
  });
  it("cleanText(None) -> '-'", () => {
    expect(cleanText(null)).toBe("-");
  });
  it("cleanText(undefined) -> '-' (None analog)", () => {
    expect(cleanText(undefined)).toBe("-");
  });
});

// Canonical WA closing helpers (DIGMARK refactor — shared source of truth).
describe("resolveWaStatusCol (single status-column resolver)", () => {
  const WA = [
    { "Mekari Tag (Status Terakhir)": "x", "Follow Up": "y", "Status": "Closing" },
  ];

  it("picks the LAST column whose lowercase name contains 'status'", () => {
    expect(resolveWaStatusCol(WA)).toBe("Status");
    expect(
      resolveWaStatusCol([{ Status: "a", "Status Lanjutan": "b" }]),
    ).toBe("Status Lanjutan");
  });

  it("ignores Mekari columns and returns undefined when none match", () => {
    expect(resolveWaStatusCol([{ "Mekari Status": "x", Nama: "y" }])).toBeUndefined();
    expect(resolveWaStatusCol([{ Nama: "x" }])).toBeUndefined();
    expect(resolveWaStatusCol([])).toBeUndefined();
  });

  it("is case-insensitive on the header name", () => {
    expect(resolveWaStatusCol([{ status: "closing" }])).toBe("status");
  });
});

describe("isClosingStatus (exact 'closing', no substring)", () => {
  it("counts exact 'closing' with trim + case-insensitivity", () => {
    expect(isClosingStatus("closing")).toBe(true);
    expect(isClosingStatus("  Closing  ")).toBe(true);
    expect(isClosingStatus("CLOSING")).toBe(true);
  });

  it("does NOT count substring-like values", () => {
    expect(isClosingStatus("closed")).toBe(false);
    expect(isClosingStatus("closing process")).toBe(false);
    expect(isClosingStatus("closed - registered")).toBe(false);
    expect(isClosingStatus("Not Closing")).toBe(false);
    expect(isClosingStatus("")).toBe(false);
    expect(isClosingStatus(null)).toBe(false);
    expect(isClosingStatus(undefined)).toBe(false);
  });
});