import { describe, expect, it } from "vitest";
import { columnsFor, TAB_SCHEMAS } from "../schema";
import { cellForUpdate, buildCrmAppendRows, toCells } from "./write";
import { GoogleSheetsClient } from "./client";
import { GoogleSheetsSource } from "./index";
import { crmStatusColumnIndex } from "./sandbox";
import { FakeApi } from "./testUtils";

const crmCols = columnsFor("crm");

describe("V3 _to_cells / update value coercion parity", () => {
  it("toCells keeps numbers/booleans native, strings everything else", () => {
    expect(toCells([[1, true, "x", 2.5, null]])).toEqual([[1, true, "x", 2.5, "null"]]);
    expect(toCells([[false]])).toEqual([[false]]);
  });
  it("cellForUpdate: bool->bool, None->'', else str", () => {
    expect(cellForUpdate(true)).toBe(true);
    expect(cellForUpdate(null)).toBe("");
    expect(cellForUpdate(undefined)).toBe("");
    expect(cellForUpdate(123)).toBe("123");
    expect(cellForUpdate("DONE")).toBe("DONE");
  });
});

describe("B1: CRM Status mapped by HEADER (column 15, never 18)", () => {
  it("declared CRM schema puts 'Status' at 0-based index 14 (col 15)", () => {
    expect(crmStatusColumnIndex()).toBe(15);
    expect(crmCols.indexOf("Status")).toBe(14);
    expect(crmCols.length).toBe(17); // effective cols, no index 17 => col 18 is spare
  });

  it("buildCrmAppendRows writes Status to index 14, NOT index 17", () => {
    const waRows = [
      {
        "Tanggal Masuk": "27/09/2025",
        "No Hp": "0815-111",
        Nama: "Ani",
        Asal: "Bantul",
        "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya",
        "Mekari Tag": "",
        "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "Closing",
      },
      {
        "Tanggal Masuk": "01/09/2026",
        "No Hp": "0813-000",
        Nama: "Budi",
        Asal: "Sleman",
        "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya",
        "Mekari Tag": "",
        "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "Follow Up",
      },
      {
        "Tanggal Masuk": "02/09/2026",
        "No Hp": "0812-000",
        Nama: "Junk",
        Asal: "X",
        "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya",
        "Mekari Tag": "double chat", // junk-filtered
        "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "x",
      },
    ];
    const crmRows = [{ "No Hp": "62815000", Nama: "Budi" }];
    const built = buildCrmAppendRows(waRows, crmRows);

    expect(built.added).toBe(2);
    expect(built.skipped).toBe(1); // junk 'double chat' dropped

    const rowAni = built.rows[0];
    expect(rowAni.length).toBe(crmCols.length);
    // Headers still handle CRM fields by position:
    expect(rowAni[crmCols.indexOf("No Hp")]).toBe("62815111"); // normalized 0815-111
    expect(rowAni[crmCols.indexOf("Nama")]).toBe("Ani");
    expect(rowAni[crmCols.indexOf("Domisili")]).toBe("Bantul"); // Asal -> Domisili
    expect(rowAni[crmCols.indexOf("Kategori")]).toBe("Biaya");
    expect(rowAni[crmCols.indexOf("Tanggal Masuk Database")]).toBe("27/09/2025");
    expect(rowAni[crmCols.indexOf("Mekari Tag (Status Terakhir)")]).toBe("");
    // THE B1 FIX:
    expect(rowAni[14]).toBe("Closing"); // Status lands at index 14 (col 15)
    expect(rowAni[14]).toBe(rowAni[crmCols.indexOf("Status")]);
    // V3 wrote it at 17 — assert index 17 is EMPTY (the spare column stays empty):
    expect(rowAni[17]).toBeUndefined();

    const rowBudi = built.rows[1];
    expect(rowBudi[crmCols.indexOf("Status")]).toBe("Follow Up");
    expect(rowBudi[crmCols.indexOf("No Hp")]).toBe("62813000");
    expect(rowBudi[crmCols.indexOf("Tanggal Masuk Database")]).toBe("01/09/2026");
  });
});

describe("buildCrmAppendRows edge cases (junk/dedupe/empty/errors)", () => {
  it("empty WA -> 'Data WA Admin kosong.', no rows", () => {
    const b = buildCrmAppendRows([], []);
    expect(b.rows).toEqual([]);
    expect(b.message).toContain("kosong");
  });
  it("all rows junk -> excluded message, skip all", () => {
    const b = buildCrmAppendRows([{ "No Hp": "0811111", "Mekari Tag": "alumni" }], []);
    expect(b.rows).toEqual([]);
    expect(b.message).toContain("dikecualikan");
    expect(b.skipped).toBe(1);
  });
  it("WA without 'No Hp' column -> error NO_NO_HP", () => {
    const b = buildCrmAppendRows([{ Nama: "X", "Mekari Tag": "" }], []);
    expect(b.error).toBe("NO_NO_HP");
  });
  it("dedupes by normalized phone against existing CRM", () => {
    const waRows = [
      { "No Hp": "0813-000", Nama: "Dup", "Mekari Tag": "", "Tanggal Masuk": "01/01/2026", Asal: "A" },
    ];
    const crmRows = [{ "No Hp": "62813000", Nama: "Already" }]; // 0813-000 == 62813000
    const b = buildCrmAppendRows(waRows, crmRows);
    expect(b.rows).toEqual([]);
    expect(b.skipped).toBe(1);
    expect(b.message).toContain("sudah sinkron");
  });
  it("normalizes 0/8-prefix phones to 62 form", () => {
    const b = buildCrmAppendRows(
      [{ "No Hp": "0815-111", Nama: "A", "Mekari Tag": "", Asal: "X" }, { "No Hp": "0895-222", Nama: "B", "Mekari Tag": "", Asal: "X" }],
      [],
    );
    expect(b.rows[0][crmCols.indexOf("No Hp")]).toBe("62815111");
    expect(b.rows[1][crmCols.indexOf("No Hp")]).toBe("62895222");
  });
});

describe("GoogleSheetsSource write ops + affected-table cache invalidation (FakeApi)", () => {
  function makeSource() {
    const api = new FakeApi(
      TAB_SCHEMAS && Object.keys(TAB_SCHEMAS).length
        ? (Object.keys(TAB_SCHEMAS) as (keyof typeof TAB_SCHEMAS)[]).map((k, i) => ({
            title: TAB_SCHEMAS[k].tab,
            gid: i + 1,
            values: [columnsFor(k)],
          }))
        : [],
    );
    const client = new GoogleSheetsClient(api, "fake");
    return { api, source: new GoogleSheetsSource(client, api) };
  }

  it("fetchTable populates cache; append invalidates ONLY the affected tab", async () => {
    const { source } = makeSource();
    await source.fetchTable("sosmed");
    await source.fetchTable("crm");
    expect(source.cacheImpl.has("sosmed")).toBe(true);
    expect(source.cacheImpl.has("crm")).toBe(true);

    const res = await source.appendRows("sosmed", [["DP-1", "", "", "done", "Article", "IG", "P", "J", "M", "C", "L", "PRO", "LK", true, false, true]]);
    expect(res.ok).toBe(true);

    // sosmed invalidated (re-fetched lazily), crm cache retained:
    expect(source.cacheImpl.has("sosmed")).toBe(false);
    expect(source.cacheImpl.has("crm")).toBe(true);

    const rows = await source.fetchTable("sosmed");
    expect(rows[0]["Kode Konten"]).toBe("DP-1");
  });

  it("updateCell writes by column header at dataRowIndex+2", async () => {
    const api = new FakeApi([
      {
        title: "WEBSITE",
        gid: 2,
        values: [columnsFor("website"), ["DPW-1", "01/01/2026", "", "Article", "", "Judul", "", "", "", "Ejak", "", "", "Uploaded", ""]],
      },
    ]);
    const client = new GoogleSheetsClient(api, "fake");
    const source = new GoogleSheetsSource(client, api);

    const res = await source.updateCell("website", 0, "Status Post", "DONE");
    expect(res.ok).toBe(true);
    expect(source.cacheImpl.has("website")).toBe(false); // invalidated

    const rows = await source.fetchTable("website");
    expect(rows[0]["Status Post"]).toBe("DONE");
  });

  it("updateCell returns COLUMN_NOT_FOUND for a missing header", async () => {
    const api = new FakeApi([{ title: "WEBSITE", gid: 2, values: [columnsFor("website")] }]);
    const source = new GoogleSheetsSource(new GoogleSheetsClient(api, "fake"), api);
    const res = await source.updateCell("website", 0, "DoesNotExist", 1);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("COLUMN_NOT_FOUND");
  });

  it("clearTable is server-guarded (2-step + audit), refuses without confirm", async () => {
    const api = new FakeApi([{ title: "SOSMED", gid: 1, values: [columnsFor("sosmed"), ["DP-1"]] }]);
    const source = new GoogleSheetsSource(new GoogleSheetsClient(api, "fake"), api);

    const refused = await source.clearTable("sosmed", {
      appKey: "sosmed",
      tabTitle: "SOSMED",
      confirmed: false,
    });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("NOT_CONFIRMED");

    const mismatch = await source.clearTable("sosmed", {
      appKey: "sosmed",
      tabTitle: "WRONG TAB",
      confirmed: true,
    });
    expect(mismatch.code).toBe("CONFIRM_MISMATCH");

    const ok = await source.clearTable("sosmed", {
      appKey: "sosmed",
      tabTitle: "SOSMED",
      confirmed: true,
      actor: "test",
    });
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain("Audit");
    expect(ok.message).toContain("test");
    expect(source.cacheImpl.has("sosmed")).toBe(false);

    const rows = await source.fetchTable("sosmed");
    expect(rows).toEqual([]); // cleared
  });

  it("cache expires after TTL", async () => {
    const api = new FakeApi([{ title: "SOSMED", gid: 1, values: [columnsFor("sosmed")] }]);
    const source = new GoogleSheetsSource(new GoogleSheetsClient(api, "fake"), api, { ttlMs: 50 });
    await source.fetchTable("sosmed");
    expect(source.cacheImpl.has("sosmed")).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(source.cacheImpl.has("sosmed")).toBe(false);
  });
});