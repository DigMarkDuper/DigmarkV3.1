import { describe, expect, it } from "vitest";
import { columnsFor, TAB_SCHEMAS, TAB_ORDER } from "./schema";
import { GoogleSheetsSourcePlaceholder, type SheetSource } from "./source";

// Column counts are asserted from DATA_CONTRACT.md §2 (verified headers).
describe("adapter schema parity (DATA_CONTRACT §2)", () => {
  it("covers all 11 app keys from SHEETS", () => {
    expect(TAB_ORDER).toEqual([
      "sosmed", "website", "insight", "wa_admin", "crm", "dm_sosmed",
      "ads_tiktok", "ads_meta", "mekari", "interview", "content_plan",
    ]);
    expect(Object.keys(TAB_SCHEMAS).length).toBe(11);
  });

  it("sosmed -> SOSMED (16 cols)", async () => {
    const s = TAB_SCHEMAS.sosmed;
    expect(s.tab).toBe("SOSMED");
    expect(s.columns.length).toBe(16);
  });
  it("website -> WEBSITE (14 cols)", () => {
    expect(TAB_SCHEMAS.website.tab).toBe("WEBSITE");
    expect(TAB_SCHEMAS.website.columns.length).toBe(14);
  });
  it("insight -> INSIGHT (8 cols)", () => {
    expect(TAB_SCHEMAS.insight.tab).toBe("INSIGHT");
    expect(TAB_SCHEMAS.insight.columns.length).toBe(8);
  });
  it("wa_admin -> WA ADMIN REPORT (14 cols)", () => {
    expect(TAB_SCHEMAS.wa_admin.tab).toBe("WA ADMIN REPORT");
    expect(TAB_SCHEMAS.wa_admin.columns.length).toBe(14);
  });
  it("crm -> DATABASE NOMOR (17 effective cols)", () => {
    expect(TAB_SCHEMAS.crm.tab).toBe("DATABASE NOMOR");
    expect(TAB_SCHEMAS.crm.columns.length).toBe(17);
  });
  it("dm_sosmed -> SOSMED ADMIN REPORT (9 cols)", () => {
    expect(TAB_SCHEMAS.dm_sosmed.tab).toBe("SOSMED ADMIN REPORT");
    expect(TAB_SCHEMAS.dm_sosmed.columns.length).toBe(9);
  });
  it("ads_tiktok -> REPORT ADS TIKTOK (15 cols)", () => {
    expect(TAB_SCHEMAS.ads_tiktok.tab).toBe("REPORT ADS TIKTOK");
    expect(TAB_SCHEMAS.ads_tiktok.columns.length).toBe(15);
  });
  it("ads_meta -> REPORT ADS META (11 cols)", () => {
    expect(TAB_SCHEMAS.ads_meta.tab).toBe("REPORT ADS META");
    expect(TAB_SCHEMAS.ads_meta.columns.length).toBe(11);
  });
  it("mekari -> REPORT MEKARI (5 cols)", () => {
    expect(TAB_SCHEMAS.mekari.tab).toBe("REPORT MEKARI");
    expect(TAB_SCHEMAS.mekari.columns.length).toBe(5);
  });
  it("interview -> SCHEDULE INTERVIEW (11 cols)", () => {
    expect(TAB_SCHEMAS.interview.tab).toBe("SCHEDULE INTERVIEW");
    expect(TAB_SCHEMAS.interview.columns.length).toBe(11);
  });
  it("columnsFor returns declared headers / [] for unknown key", () => {
    expect(columnsFor("wa_admin").length).toBe(14);
    expect(columnsFor("nope")).toEqual([]);
  });

  it("content_plan -> CONTENT_PLAN (11 exact cols, §1.1)", () => {
    const s = TAB_SCHEMAS.content_plan;
    expect(s.tab).toBe("CONTENT_PLAN");
    expect(s.columns).toEqual([
      "Judul / Ide Konten", "Tanggal Publish", "Deadline Produksi",
      "Content Pillar", "Format", "Platform", "PIC", "Brief",
      "Reference Link", "Priority", "Status Plan",
    ]);
  });
});

describe("SheetSource interface + placeholder (DATA_CONTRACT §6)", () => {
  it("placeholder is NOT implemented in Phase A", () => {
    const placeholder: SheetSource = new GoogleSheetsSourcePlaceholder();
    expect(() => placeholder.fetchTable("wa_admin")).toThrow(/not implemented in Phase A/);
  });
});