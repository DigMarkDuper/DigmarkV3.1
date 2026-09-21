import { describe, expect, it } from "vitest";
import { TAB_ORDER, TAB_SCHEMAS, columnsFor } from "../schema";
import { colToA1, GoogleSheetsClient, headersEqual, trimTrailingEmpty } from "./client";
import { FakeApi } from "./testUtils";

/** Build a FakeApi whose tabs match the declared schema exactly (no drift). */
function schemaPerfectApi(): FakeApi {
  return new FakeApi(
    TAB_ORDER.map((k, i) => ({
      title: TAB_SCHEMAS[k].tab,
      gid: i + 1,
      values: [columnsFor(k)],
    })),
  );
}

describe("helpers (position → A1, header equality)", () => {
  it("colToA1 maps 1-based index to A1 letter", () => {
    expect(colToA1(1)).toBe("A");
    expect(colToA1(15)).toBe("O");
    expect(colToA1(18)).toBe("R");
    expect(colToA1(26)).toBe("Z");
    expect(colToA1(27)).toBe("AA");
    expect(colToA1(28)).toBe("AB");
  });
  it("trimTrailingEmpty strips trailing blanks but keeps interior", () => {
    expect(trimTrailingEmpty(["A", "B", ""])).toEqual(["A", "B"]);
    expect(trimTrailingEmpty(["A", "", "B"])).toEqual(["A", "", "B"]);
    expect(trimTrailingEmpty(["", "A", ""])).toEqual(["", "A"]);
  });
  it("headersEqual ignores trailing empties", () => {
    expect(headersEqual(["A", "B", ""], ["A", "B"])).toBe(true);
    expect(headersEqual(["A", "C"], ["A", "B"])).toBe(false);
  });
});

describe("workbook bootstrap / discovery / drift (mocked API)", () => {
  it("listTabs resolves all 11 tabs with title→gid, no drift for a schema-perfect workbook", async () => {
    const api = schemaPerfectApi();
    const client = new GoogleSheetsClient(api, "abc123");
    const res = await client.listTabs();

    expect(res.sheets.length).toBe(11);
    expect(res.titleToGid.get(TAB_SCHEMAS.crm.tab)).toBe(5); // crm is #5 in TAB_ORDER
    expect(res.missingTabs).toEqual([]);
    expect(res.headerViolations).toEqual([]);
    expect(res.drift).toBe(false);
    expect(res.tabs.length).toBe(11);
    const crm = res.tabs.find((t) => t.appKey === "crm")!;
    expect(crm.title).toBe("DATABASE NOMOR");
    expect(crm.gid).toBe("5");
    expect(crm.headers).toEqual(columnsFor("crm"));
    expect(crm.drift).toBe(false);
  });

  it("detects a missing declared tab (fail-loud)", async () => {
    // Drop INSIGHT and rename its sheet to something else.
    const api = schemaPerfectApi();
    api.tabs = api.tabs.filter((t) => t.title !== TAB_SCHEMAS.insight.tab);
    const client = new GoogleSheetsClient(api, "abc123");
    const res = await client.listTabs();
    expect(res.missingTabs).toContain("insight");
    expect(res.drift).toBe(true);
    expect(res.tabs.length).toBe(10);
  });

  it("detects header drift against the declared schema", async () => {
    const api = schemaPerfectApi();
    // Perturb the CRM header: drop 'Status' so it shifts.
    const crm = api.tabs.find((t) => t.title === "DATABASE NOMOR")!;
    crm.values = [columnsFor("crm").filter((h) => h !== "Status")];
    const client = new GoogleSheetsClient(api, "abc123");
    const res = await client.listTabs();
    expect(res.headerViolations.length).toBe(1);
    expect(res.headerViolations[0].appKey).toBe("crm");
    const crmMeta = res.tabs.find((t) => t.appKey === "crm")!;
    expect(crmMeta.drift).toBe(true);
    expect(res.drift).toBe(true);
  });

  it("openWorkbook builds title→gid map", async () => {
    const api = schemaPerfectApi();
    const client = new GoogleSheetsClient(api, "abc123");
    const wb = await client.openWorkbook();
    expect(wb.titleToGid.get("SOSMED")).toBe(1);
    expect(wb.titleToGid.size).toBe(11);
  });
});