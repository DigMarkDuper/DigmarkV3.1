import { describe, expect, it } from "vitest";
import { MODULES } from "@/config/constants";
import {
  formatCount,
  formatPercent,
  formatRoas,
  formatRupiah,
} from "@/components/ui-common";

describe("ui-common display helpers (V3 parity)", () => {
  it("formatCount groups with dots and rounds", () => {
    expect(formatCount(1234567)).toBe("1.234.567");
    expect(formatCount(12.4)).toBe("12");
  });

  it("formatPercent shows one decimal or an em-dash without a base", () => {
    expect(formatPercent(50.0, true)).toBe("50.0%");
    expect(formatPercent(12.345, true)).toBe("12.3%");
    expect(formatPercent(1, false)).toBe("—");
  });

  it("formatRoas shows one-decimal x or an em-dash without spend", () => {
    expect(formatRoas(4.25, true)).toBe("4.3x");
    expect(formatRoas(4.2, false)).toBe("—");
  });

  it("formatRupiah prefixes Rp with dot grouping", () => {
    expect(formatRupiah(12995000)).toBe("Rp 12.995.000");
  });
});

describe("MODULES registry (single source of truth)", () => {
  it("exposes exactly the 8 workspaces in V3 order", () => {
    expect(MODULES.map((m) => m.url)).toEqual([
      "sosmed", "insight", "website", "wa-admin", "crm", "dm", "ads", "interview",
    ]);
    expect(MODULES.length).toBe(8);
  });

  it("each module has icon, title, desc and url", () => {
    for (const m of MODULES) {
      expect(typeof m.icon).toBe("string");
      expect(typeof m.title).toBe("string");
      expect(typeof m.desc).toBe("string");
      expect(typeof m.url).toBe("string");
    }
  });
});