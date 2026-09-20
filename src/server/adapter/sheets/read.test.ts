import { describe, expect, it } from "vitest";
import { columnsFor } from "../schema";
import { normalizeRows, readTable } from "./read";
import { FakeApi } from "./testUtils";

describe("normalizeRows (sheet values → typed rows)", () => {
  const crmCols = columnsFor("crm");

  it("maps values by exact live header; preserves numbers/booleans/empties", () => {
    const values: unknown[][] = [
      ["No Hp", "Nama", "Status", "IG"],
      ["62813000", "Budi", "Closing", true],
      ["62815111", "", undefined, false],
    ];
    const rows = normalizeRows(["No Hp", "Nama", "Status", "IG"], values);
    expect(rows).toEqual([
      { "No Hp": "62813000", Nama: "Budi", Status: "Closing", IG: true, __rowIndex: 0 },
      { "No Hp": "62815111", Nama: "", Status: "", IG: false, __rowIndex: 1 },
    ]);
  });

  it("surfaces only DECLARED columns; ignores extra live columns", () => {
    const values: unknown[][] = [
      ["No Hp", "Nama", "Extra"],
      ["62813000", "Budi", 999],
    ];
    const rows = normalizeRows(["No Hp", "Nama"], values);
    expect(rows[0]).toEqual({ "No Hp": "62813000", Nama: "Budi", __rowIndex: 0 });
    expect(rows[0]).not.toHaveProperty("Extra");
  });

  it("skips fully-empty rows (graceful empty data)", () => {
    const values: unknown[][] = [
      ["No Hp", "Nama", "Status"],
      ["", "", ""],
      ["62813000", "Budi", "Closing"],
    ];
    const rows = normalizeRows(["No Hp", "Nama", "Status"], values);
    expect(rows.length).toBe(1);
    // The empty row (i=1) is skipped, but __rowIndex still tracks the ORIGINAL
    // values-array position of the surviving row (i=2 -> 1), not the filtered index.
    expect(rows[0]).toEqual({ "No Hp": "62813000", Nama: "Budi", Status: "Closing", __rowIndex: 1 });
  });

  it("returns [] for header-only / empty sheet", () => {
    expect(normalizeRows(crmCols, [crmCols])).toEqual([]);
    expect(normalizeRows(crmCols, [])).toEqual([]);
    expect(normalizeRows(crmCols, undefined as unknown as unknown[][])).toEqual([]);
  });

  it("sanitize_mixed: coerces mixed-dtype columns to string", () => {
    const values: unknown[][] = [
      ["No Hp", "Usia"],
      ["62813000", "25"], // string
      ["62815111", 30], // number -> mixed -> string via sanitize
    ];
    const rows = normalizeRows(["No Hp", "Usia"], values);
    expect(typeof rows[1]["Usia"]).toBe("string");
    expect(rows[1]["Usia"]).toBe("30");
  });

  it("coerces boolean-literal strings to real booleans (Sheets FORMATTED_VALUE parity)", () => {
    const values: unknown[][] = [
      ["IG", "YT", "TIKTOK", "Nama"],
      ["TRUE", "false", "True", "Santoso"],
    ];
    const rows = normalizeRows(["IG", "YT", "TIKTOK", "Nama"], values);
    expect(rows[0]["IG"]).toBe(true);
    expect(rows[0]["YT"]).toBe(false);
    expect(rows[0]["TIKTOK"]).toBe(true);
    expect(rows[0]["Nama"]).toBe("Santoso"); // non-boolean strings untouched
  });

  it("maps Status only if the declared CRM column is present (its true position)", () => {
    // Simulate the live CRM headers where Status is the 15th column (index 14).
    const values: unknown[][] = [
      crmCols,
      // full row 2 with 'Status' landmine at index 14
      ...Array.from({ length: 1 }, () => crmCols.map((c) => (c === "Status" ? "Closing" : c === "No Hp" ? "62813000" : ""))),
    ];
    const rows = normalizeRows(crmCols, values);
    expect(rows[0]["Status"]).toBe("Closing"); // read correctly, not empty
    expect(crmCols.indexOf("Status")).toBe(14); // 0-based -> column 15
  });
});

describe("readTable against an API (graceful empty, DTO shape)", () => {
  it("returns [] when a tab is missing / not readable (graceful)", async () => {
    const api = new FakeApi([{ title: "SOSMED", gid: 1, values: [columnsFor("sosmed")] }]);
    const rows = await readTable(api, "fake", "crm"); // crm tab absent
    expect(rows).toEqual([]);
  });

  it("returns [] for an unknown app key", async () => {
    const api = new FakeApi([]);
    const rows = await readTable(api, "fake", "nope");
    expect(rows).toEqual([]);
  });

  it("returns typed rows with only declared columns", async () => {
    const rows = await readTable(
      new FakeApi([{ title: "SOSMED", gid: 1, values: [columnsFor("sosmed"), ["DP-1", "", "", "", "Article"]] }]),
      "fake",
      "sosmed",
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({ "Kode Konten": "DP-1", "Konten Pillar": "Article" });
    expect(rows[0]).toHaveProperty("PROSES");
  });
});