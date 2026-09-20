import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InterviewDashboard } from "@/workspaces/InterviewDashboard";
import {
  deriveKpis,
  filterOptions,
  applyFilters,
  interviewFilterColumns,
} from "@/workspaces/interview";
import type { Row } from "@/server/adapter/source";

const PIC = "PIC Interview";
const STATUS = "Status Follow-Up";
const HASIL = "Hasil Interview";

function row(partial: Partial<Row>): Row {
  return { [PIC]: "", [STATUS]: "", [HASIL]: "", ...partial };
}

const FIXTURE: Row[] = [
  // r1: Follow Up status -> menunggu; empty hasil -> not selesai
  row({ [PIC]: "Anna", [STATUS]: "Follow Up", [HASIL]: "" }),
  // r2: status Done -> selesai; hasil Lulus -> lolos
  row({ [PIC]: "Bob", [STATUS]: "Done", [HASIL]: "Lulus" }),
  // r3: No Respon -> menunggu; hasil Diterima -> selesai + lolos
  row({ [PIC]: "Anna", [STATUS]: "No Respon", [HASIL]: "Diterima" }),
  // r4: Pending -> menunggu; hasil "Tidak Lulus" -> selesai but NOT lolos (negative exclusion)
  row({ [PIC]: "Cara", [STATUS]: "Pending", [HASIL]: "Tidak Lulus" }),
  // r5: all blank -> contributes nothing
  row({ [PIC]: null, [STATUS]: "", [HASIL]: "" }),
];

describe("interview derivations (V3 8_Interview.py parity)", () => {
  it("computes KPI counts: total / menunggu regex / selesai / lolos", () => {
    const k = deriveKpis(FIXTURE);
    expect(k.total).toBe(5);
    // menunggu: Follow Up (r1) + No Respon (r3) + Pending (r4)
    expect(k.menunggu).toBe(3);
    // selesai: hasil non-empty OR status == Done -> r2 (Done), r3, r4
    expect(k.selesai).toBe(3);
    // lolos: lulus|diterima AND NOT (tidak lulus|tidak ) -> r2, r3
    expect(k.lolos).toBe(2);
  });

  it("excludes rows matching the negative pattern even when lulus appears", () => {
    const k = deriveKpis([
      row({ [HASIL]: "Tidak Lulus" }),
      row({ [HASIL]: "tidak diterima" }),
      row({ [HASIL]: "Lulus" }),
    ]);
    expect(k.lolos).toBe(1);
  });

  it("treats missing columns defensively (V3 col-absent branches)", () => {
    const rows: Row[] = [{ Nama: "X" }, { Nama: "Y" }];
    const k = deriveKpis(rows);
    expect(k.total).toBe(2);
    expect(k.menunggu).toBe(0);
    expect(k.selesai).toBe(0);
    expect(k.lolos).toBe(0);
  });

  it("builds sorted non-null distinct options per filter column", () => {
    // V3 `dropna()` removes only null/NaN, so empty-string cells are kept.
    expect(filterOptions(FIXTURE, PIC)).toEqual(["Anna", "Bob", "Cara"]);
    expect(filterOptions(FIXTURE, STATUS)).toEqual(["", "Done", "Follow Up", "No Respon", "Pending"]);
    expect(filterOptions(FIXTURE, HASIL)).toEqual(["", "Diterima", "Lulus", "Tidak Lulus"]);
  });

  it("returns [] for a column absent from the data", () => {
    expect(filterOptions([{ Nama: "X" }], PIC)).toEqual([]);
  });

  it("applies each filter independently (and together)", () => {
    const sel = (col: string, vals: string[]) => ({ [col]: new Set(vals) });
    expect(applyFilters(FIXTURE, sel(PIC, ["Anna"])).length).toBe(2); // r1, r3
    expect(applyFilters(FIXTURE, sel(STATUS, ["Done"])).length).toBe(1); // r2
    expect(applyFilters(FIXTURE, sel(HASIL, ["Lulus"])).length).toBe(1);
    // combined independent filters -> intersection
    const both = applyFilters(FIXTURE, { [PIC]: new Set(["Anna"]), [STATUS]: new Set(["No Respon"]) });
    expect(both.length).toBe(1);
  });

  it("does not filter when a column is absent or a selection is empty", () => {
    expect(applyFilters([{ Nama: "X" }], { [PIC]: new Set(["Anna"]) })).toHaveLength(1);
    expect(applyFilters(FIXTURE, { [PIC]: new Set() })).toHaveLength(FIXTURE.length);
  });

  it("enumerates only present filter columns in order", () => {
    const cols = interviewFilterColumns(FIXTURE);
    expect(cols.map((c) => c.col)).toEqual([PIC, STATUS, HASIL]);
    expect(interviewFilterColumns([{ Nama: "X" }])).toEqual([]);
  });
});

describe("InterviewDashboard (react-dom/server, no browser)", () => {
  const columns = [
    "Tanggal", "Nama Calon Siswa", "Nomor Whatsapp", "Pilihan Program",
    PIC, STATUS, "Tanggal Interview", "Waktu Interview", "Tipe Interview", HASIL, "Catatan PIC",
  ];

  it("renders hero, KPI section and filter section with counts", () => {
    const html = renderToStaticMarkup(
      <InterviewDashboard rows={FIXTURE} columns={columns} />,
    );
    expect(html).toContain("Interview");
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Total Kandidat");
    expect(html).toContain("Filter Kandidat");
    expect(html).toContain("Hasil Filter");
    expect(html).toContain("Refresh Data");
  });

  it("renders the V3 empty state: zeroed KPI row, no filter section", () => {
    const html = renderToStaticMarkup(
      <InterviewDashboard rows={[]} columns={columns} />,
    );
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Belum ada data.");
    expect(html).toContain("Total Kandidat");
    expect(html).not.toContain("Filter Kandidat");
  });
});