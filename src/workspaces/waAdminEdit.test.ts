import { describe, expect, it } from "vitest";
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  timeHmToDotted,
  type WaAdminFormValues,
} from "@/workspaces/waAdminForm";
import {
  searchRowsMulti,
  formatActiveCriteria,
  rowToFormValue,
  changedFieldValues,
  validateWaAdminEdit,
} from "@/workspaces/waAdminEdit";

const KEY = WA_ADMIN_PAYLOAD_KEYS;

/** A representative row reconstructed from a real GET /api/tables/wa_admin payload. */
function richRow(over: Record<string, unknown> = {}): Row {
  return {
    __rowIndex: 3,
    [KEY.tanggalMasuk]: "19/09/2026",
    [KEY.noHp]: "081234567890",
    [KEY.jamChatMasuk]: "13.39",
    [KEY.pic]: "BELIA",
    [KEY.nama]: "Budi Santoso",
    [KEY.asal]: "Instagram",
    [KEY.sumber]: "Organik",
    [KEY.pertanyaan]: "Berapa biaya daftar?",
    [KEY.kategori]: "Pendaftaran",
    [KEY.mekariTag]: "Cold Lead",
    [STATUS_COLUMN]: "Follow Up",
    [KEY.keteranganAdmin]: "Sudah follow up sekali",
    ...over,
  };
}

/** The form-shape mirror of `richRow()` (what rowToFormValue _should_ produce). */
function expectedForm(row: Row): WaAdminFormValues {
  const v = (col: string) => String(row[col] ?? "").trim();
  return {
    tanggalMasuk: "2026-09-19",
    noHp: v(KEY.noHp),
    jamChatMasuk: "13:39",
    pic: v(KEY.pic),
    nama: v(KEY.nama),
    asal: v(KEY.asal),
    sumber: v(KEY.sumber),
    pertanyaan: v(KEY.pertanyaan),
    kategori: v(KEY.kategori),
    mekariTag: v(KEY.mekariTag),
    status: v(STATUS_COLUMN),
    keteranganAdmin: v(KEY.keteranganAdmin),
  };
}

describe("waAdminEdit — searchRowsMulti", () => {
  const rows: Row[] = [
    { __rowIndex: 0, Nama: "Budi Santoso", [KEY.noHp]: "081234567890" },
    { __rowIndex: 1, Nama: "budi pratama", [KEY.noHp]: "081234567891" },
    { __rowIndex: 2, Nama: "Siti Aminah", [KEY.noHp]: "081234567892" },
  ];

  it("a single filled clause behaves exactly like the old single-criterion search", () => {
    const hit = searchRowsMulti(rows, [{ column: "Nama", keyword: "  BUDI  " }]);
    expect(hit.map((r) => r.__rowIndex)).toEqual([0, 1]);
    expect(hit[0]).toBe(rows[0]); // identity carried, not a new object
    expect(searchRowsMulti(rows, [{ column: "Nama", keyword: "prat" }]).map((r) => r.__rowIndex)).toEqual([1]);
  });

  it("matches a substring of the cell, not just full-token equality", () => {
    expect(searchRowsMulti(rows, [{ column: "Nama", keyword: "prat" }]).map((r) => r.__rowIndex)).toEqual([1]);
  });

  it("ANDs two/three filled clauses (only rows matching ALL remain)", () => {
    // two clauses: Nama "budi" AND No Hp "891" → only row 1 matches both.
    expect(
      searchRowsMulti(rows, [
        { column: "Nama", keyword: "budi" },
        { column: KEY.noHp, keyword: "891" },
      ]).map((r) => r.__rowIndex),
    ).toEqual([1]);
    // three clauses: Nama "Budi" + Nama "Santoso" + No Hp "0812" → only row 0
    // matches ALL three (row 1 lacks "Santoso", row 2 lacks "Budi"/"Santoso").
    expect(
      searchRowsMulti(rows, [
        { column: "Nama", keyword: "Budi" },
        { column: "Nama", keyword: "Santoso" },
        { column: KEY.noHp, keyword: "0812" },
      ]).map((r) => r.__rowIndex),
    ).toEqual([0]);
  });

  it("ignores an empty/whitespace clause (e.g. an unfilled row-2 keyword)", () => {
    expect(
      searchRowsMulti(rows, [
        { column: "Nama", keyword: "budi" },
        { column: KEY.noHp, keyword: "" },
        { column: KEY.nama, keyword: "   " },
      ]).map((r) => r.__rowIndex),
    ).toEqual([0, 1]);
  });

  it("returns [] for an all-empty/whitespace set of clauses (and for [] itself)", () => {
    expect(searchRowsMulti(rows, [{ column: "Nama", keyword: "   " }])).toEqual([]);
    expect(searchRowsMulti(rows, [{ column: "Nama", keyword: "" }])).toEqual([]);
    expect(searchRowsMulti(rows, [])).toEqual([]);
  });

  it("returns [] when no row matches", () => {
    expect(searchRowsMulti(rows, [{ column: "Nama", keyword: "zzz" }])).toEqual([]);
  });

  it("tolerates a missing criterion column (treats it as empty)", () => {
    expect(searchRowsMulti(rows, [{ column: "Tidak Ada Kolom", keyword: "budi" }])).toEqual([]);
  });
});

describe("waAdminEdit — formatActiveCriteria", () => {
  it("builds a single-clause summary, trimming the keyword", () => {
    expect(formatActiveCriteria([{ column: KEY.nama, keyword: "  Budi  " }])).toBe("Nama: Budi");
    expect(formatActiveCriteria([{ column: KEY.noHp, keyword: "0812" }])).toBe("No Hp: 0812");
  });

  it("builds a multi-clause summary joined by ' · ', in order, dropping empty clauses", () => {
    expect(
      formatActiveCriteria([
        { column: KEY.nama, keyword: "Budi" },
        { column: KEY.noHp, keyword: "" },
        { column: STATUS_COLUMN, keyword: "  Follow Up " },
      ]),
    ).toBe("Nama: Budi · Status: Follow Up");
  });

  it("returns an empty string when every clause keyword is empty", () => {
    expect(formatActiveCriteria([{ column: KEY.nama, keyword: "" }, { column: KEY.noHp, keyword: "  " }])).toBe("");
    expect(formatActiveCriteria([])).toBe("");
  });
});

describe("waAdminEdit — rowToFormValue", () => {
  it("converts DD/MM/YYYY to YYYY-MM-DD and HH.MM to HH:MM for the pickers", () => {
    expect(rowToFormValue(richRow())).toEqual(expectedForm(richRow()));
    expect(rowToFormValue(richRow()).tanggalMasuk).toBe("2026-09-19");
    expect(rowToFormValue(richRow()).jamChatMasuk).toBe("13:39");
  });

  it("preserves the stored No Hp format verbatim (not re-normalized)", () => {
    const r = richRow({ [KEY.noHp]: "08 1234-5678-90" });
    expect(rowToFormValue(r).noHp).toBe("08 1234-5678-90");
  });

  it("leaves malformed date/time empty (picker untouched, validation enforces)", () => {
    const r = richRow({ [KEY.tanggalMasuk]: "bukan-tanggal", [KEY.jamChatMasuk]: "nope" });
    const f = rowToFormValue(r);
    expect(f.tanggalMasuk).toBe("");
    expect(f.jamChatMasuk).toBe("");
  });

  it("maps ISO date + dotted time and blank non-set fields to empty strings", () => {
    const r: Row = { __rowIndex: 9, [KEY.nama]: "X", [KEY.tanggalMasuk]: "2025-01-02", [KEY.jamChatMasuk]: "09.05" };
    const f = rowToFormValue(r);
    expect(f.tanggalMasuk).toBe("2025-01-02");
    expect(f.jamChatMasuk).toBe("09:05");
    expect(f.pic).toBe("");
    expect(f.pertanyaan).toBe("");
  });
});

describe("waAdminEdit — changedFieldValues", () => {
  it("returns [] when nothing has meaningfully changed", () => {
    const pre = rowToFormValue(richRow());
    // same values, possibly with stray trailing spaces
    const same = { ...pre, nama: "  Budi Santoso  ", asal: "Instagram " };
    expect(changedFieldValues(pre, same)).toEqual([]);
  });

  it("emits only the changed fields as EXACT schema headers", () => {
    const pre = rowToFormValue(richRow());
    const cur = { ...pre, nama: "Budi Wijaya", status: "Closing" };
    const out = changedFieldValues(pre, cur);
    expect(out).toEqual([
      { column: "Nama", value: "Budi Wijaya" },
      { column: STATUS_COLUMN, value: "Closing" },
    ]);
  });

  it("sends No Hp in the 62-form when it changed", () => {
    const pre = rowToFormValue(richRow({ [KEY.noHp]: "081234567890" }));
    const cur = { ...pre, noHp: "081298765432" };
    const out = changedFieldValues(pre, cur);
    expect(out).toEqual([{ column: "No Hp", value: "6281298765432" }]);
  });

  it("does NOT emit No Hp when retyped to the same number (normalized equal)", () => {
    const pre = rowToFormValue(richRow({ [KEY.noHp]: "081234567890" }));
    const cur = { ...pre, noHp: "6281234567890" }; // semantically identical
    expect(changedFieldValues(pre, cur)).toEqual([]);
  });

  it("sends Jam Chat Masuk as HH.MM when it changed", () => {
    const pre = rowToFormValue(richRow({ [KEY.jamChatMasuk]: "13.39" }));
    const cur = { ...pre, jamChatMasuk: "14:00" };
    const out = changedFieldValues(pre, cur);
    expect(out).toEqual([{ column: "Jam Chat Masuk", value: "14.00" }]);
  });

  it("round-trips a legacy Meekari/status value unchanged (trimmed)", () => {
    const pre = rowToFormValue(richRow());
    const cur = { ...pre, mekariTag: "Fast Track", status: "Pending Registration" };
    const out = changedFieldValues(pre, cur);
    expect(out).toEqual([
      { column: "Mekari Tag", value: "Fast Track" },
      { column: STATUS_COLUMN, value: "Pending Registration" },
    ]);
  });
});

describe("waAdminEdit — validateWaAdminEdit", () => {
  const valid = rowToFormValue(richRow());

  it("accepts a fully valid edit", () => {
    expect(validateWaAdminEdit(valid)).toEqual({});
  });

  it("rejects every required field when blanked", () => {
    const errs = validateWaAdminEdit({
      ...valid,
      tanggalMasuk: "", noHp: "", jamChatMasuk: "", pic: "",
      nama: "", sumber: "", kategori: "", status: "",
    });
    expect(Object.keys(errs).sort()).toEqual(
      ["tanggalMasuk", "noHp", "jamChatMasuk", "pic", "nama", "sumber", "kategori", "status"].sort(),
    );
  });

  it("rejects an invalid No Hp with the Tambah-Data copy", () => {
    const errs = validateWaAdminEdit({ ...valid, noHp: "no digits here!" });
    expect(errs.noHp).toBe("Nomor HP tidak valid.");
  });

  it("accepts a leading-zero phone (normalizes to 62, not empty)", () => {
    const errs = validateWaAdminEdit({ ...valid, noHp: "0812 3456 7890" });
    expect(errs.noHp).toBeUndefined();
    expect(normalizePhone("081234567890")).toBe("6281234567890");
    expect(timeHmToDotted("13:39")).toBe("13.39");
  });

  it("leaves optional fields free to be empty", () => {
    const errs = validateWaAdminEdit({ ...valid, asal: "", pertanyaan: "", mekariTag: "", keteranganAdmin: "" });
    expect(errs).toEqual({});
  });
});

describe("waAdminEdit — INTEGRITY: same-Nama rows must stay distinct (no wrong-row edit)", () => {
  it("two same-Nama rows carry distinct __rowIndex that SURVIVE searchRowsMulti and feed DISTINCT PATCH rowIndex", () => {
    const rows: Row[] = [
      richRow({ __rowIndex: 3, [KEY.nama]: "Budi" }),
      richRow({ __rowIndex: 7, [KEY.nama]: "Budi", [KEY.noHp]: "081200000001" }),
      richRow({ __rowIndex: 12, [KEY.nama]: "Siti" }),
    ];
    const hits = searchRowsMulti(rows, [{ column: "Nama", keyword: "budi" }]);
    // both same-Nama rows found, and the results are NOT keyed by their position.
    expect(hits).toHaveLength(2);
    expect(hits.map((r) => r.__rowIndex)).toEqual([3, 7]);

    // For each selected row, a one-field edit must PATCH its OWN original
    // spreadsheet row (never the filtered/result-array position 0 / 1).
    const patched = hits.map((r) => {
      const pre = rowToFormValue(r);
      const changed = changedFieldValues(pre, { ...pre, status: "Closing" });
      expect(changed).toHaveLength(1); // exactly one field changed
      return Number(r.__rowIndex);
    });
    expect(patched).toEqual([3, 7]);
    expect(patched[0]).not.toBe(patched[1]); // two distinct original rows
    expect(patched).not.toEqual([0, 1]); // guard: never the filtered positions
  });

  it("search filtering drops a row yet the survivor keeps its ORIGINAL __rowIndex", () => {
    const rows: Row[] = [
      richRow({ __rowIndex: 0, [KEY.nama]: "Aji" }),
      richRow({ __rowIndex: 15, [KEY.nama]: "Aji", [KEY.noHp]: "082211223344" }),
    ];
    const hits = searchRowsMulti(rows, [{ column: KEY.noHp, keyword: "082211223344" }]);
    expect(hits).toHaveLength(1);
    // Array position (0) !== original identity (15) — proves identity is threaded
    // and never re-derived from array index.
    expect(hits[0].__rowIndex).toBe(15);
    expect(hits[0].__rowIndex).not.toBe(0);
  });
});