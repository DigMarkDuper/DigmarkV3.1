import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CrmDashboard } from "@/workspaces/CrmDashboard";
import {
  buildCrmImportRows,
  crmFilterOptions,
  crmMetrics,
  filterCrmRows,
  mekariCsv,
  mekariFilename,
  TREATMENT_OPTIONS,
} from "@/workspaces/crm";
import {
  syncController,
} from "@/server/api/syncControllers";
import {
  appendTableController,
} from "@/server/api/tableControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { columnsFor } from "@/server/adapter/schema";
import { makeFakeSource, makeSession } from "@/server/api/testHelpers";
import { buildCellRows } from "@/lib/validation";
import { buildCrmAppendRows } from "@/server/adapter/sheets/write";
import type { Row } from "@/server/adapter/source";

/** Exact declared crm columns (schema.ts). */
const COLS = columnsFor("crm");

function crmRow(partial: Partial<Row>): Row {
  return {
    "No": "",
    "No Hp": "",
    "Nama": "",
    "Domisili": "",
    "Tanggal Lahir": "",
    "Usia": "",
    "Kategori": "",
    "Keterangan Setelah Isi Form": "",
    "Tanggal Masuk Database": "",
    "Mekari Tag (Status Terakhir)": "",
    "Treatment 1": "",
    "Treatment 2": "",
    "Tanggal Treatment 1": "",
    "Tanggal Treatment 2": "",
    "Status": "",
    "Updated Status After Treatment": "",
    "Catatan": "",
    ...partial,
  };
}

const FIXTURE: Row[] = [
  crmRow({ "No": 1, "No Hp": "6281", Nama: "Ani", Domisili: "Bantul", "Mekari Tag (Status Terakhir)": "HOT", "Treatment 1": "x", "Treatment 2": "" }),
  crmRow({ "No": 2, "No Hp": "6282", Nama: "Budi", Domisili: "Sleman", "Mekari Tag (Status Terakhir)": "WARM", "Treatment 1": "", "Treatment 2": "y", Status: "Closing" }),
  crmRow({ "No": 3, "No Hp": "6283", Nama: "Citra", Domisili: "Bantul", "Mekari Tag (Status Terakhir)": "HOT", "Treatment 1": "", "Treatment 2": "" }),
  crmRow({ "No": 4, "No Hp": "6284", Nama: "Dodi", Domisili: "Kulon", "Mekari Tag (Status Terakhir)": "", "Treatment 1": "", "Treatment 2": "" }),
];

const NO_FILTER = { search: "", mekari: [] as string[], domisili: [] as string[], treatment: "Semua" };

/* --------------------------------------------------------------------------- */

describe("CRM client-side import mapping (V3 _import_row + DATA/IMPORT DECISION)", () => {
  it("maps full_name/customer_name/phone_number/company into the CRM layout", () => {
    const aoa: unknown[][] = [
      ["full_name", "customer_name", "phone_number", "company"],
      ["Ani", "Ani X", "081234567", "PT Maju"],
      ["nan", "Budi", "082233445", "PT Jaya"],
    ];
    const rows = buildCrmImportRows(aoa);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      No: "",
      "No Hp": "'081234567", // apostrophe forces text
      Nama: "Ani",
      Domisili: "PT Maju",
    });
    // full_name == "nan" -> fall back to customer_name
    expect(rows[1].Nama).toBe("Budi");
    expect(rows[1]["No Hp"]).toBe("'082233445");
    expect(rows[1].Domisili).toBe("PT Jaya");
    // Only schema-keyed fields are emitted (server defaults the rest to "").
    expect(Object.keys(rows[0]).sort()).toEqual(["No", "No Hp", "Nama", "Domisili"].sort());
  });

  it("imports every file row including empty ones", () => {
    const aoa: unknown[][] = [
      ["full_name", "customer_name", "phone_number", "company"],
      [],
      ["nan", "", "", ""],
    ];
    const rows = buildCrmImportRows(aoa);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ No: "", "No Hp": "'", Nama: "", Domisili: "" });
    expect(rows[1]).toEqual({ No: "", "No Hp": "'", Nama: "", Domisili: "" });
  });

  it("single header line yields no rows", () => {
    expect(buildCrmImportRows([["full_name", "phone_number"]])).toEqual([]);
  });
});

describe("CRM filters, options & metrics (V3 mask parity)", () => {
  it("filter options are sorted distinct non-empty values", () => {
    const o = crmFilterOptions(FIXTURE);
    expect(o.mekari).toEqual(["HOT", "WARM"]);
    expect(o.domisili).toEqual(["Bantul", "Kulon", "Sleman"]);
  });

  it("search matches Nama case-insensitively OR No Hp substring", () => {
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, search: "ani" })).toHaveLength(1); // only Nama "Ani"
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, search: "6282" })).toHaveLength(1); // No Hp
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, search: "BUDI" })).toHaveLength(1); // Nama case-insensitive
    // Search never matches Domisili (V3 masks Nama/No Hp only).
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, search: "Bantul" })).toHaveLength(0);
  });

  it("treats no search with both masking cols as identity", () => {
    expect(filterCrmRows(FIXTURE, NO_FILTER)).toHaveLength(4);
  });

  it("Mekari + Domisili multiselect filters", () => {
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, mekari: ["HOT"] })).toHaveLength(2);
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, domisili: ["Bantul"] })).toHaveLength(2);
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, mekari: ["HOT"], domisili: ["Bantul"] })).toHaveLength(2);
  });

  it("treatment options gate Sudah T1 / Sudah T2 / Belum", () => {
    expect(TREATMENT_OPTIONS).toEqual(["Semua", "Sudah T1", "Sudah T2", "Belum"]);
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, treatment: "Sudah T1" })).toHaveLength(1);
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, treatment: "Sudah T2" })).toHaveLength(1);
    expect(filterCrmRows(FIXTURE, { ...NO_FILTER, treatment: "Belum" })).toHaveLength(2);
  });

  it("metrics: hasilFilter / totalDb / sudahT1 / sudahT2", () => {
    const m = crmMetrics(filterCrmRows(FIXTURE, { ...NO_FILTER, mekari: ["HOT"] }), FIXTURE);
    expect(m.hasilFilter).toBe(2);
    expect(m.totalDb).toBe(4);
    expect(m.sudahT1).toBe(1);
    expect(m.sudahT2).toBe(1);
  });
});

describe("Mekari CSV export (V3 _mekari_csv)", () => {
  it("emits header + normalized phone/full_name/customer_name/company with BOM", () => {
    const csv = mekariCsv([
      crmRow({ "No Hp": "0812-3", Nama: "Ani", Domisili: "Bantul" }),
      crmRow({ "No Hp": "6285", Nama: "Budi", Domisili: "" }),
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("phone_number,full_name,customer_name,company");
    expect(lines[1]).toBe("628123,Ani,Ani,Bantul"); // normalizePhone("0812-3") -> 628123
    expect(lines[2]).toBe("6285,Budi,Budi,");
  });

  it("escapes commas/quotes/newlines", () => {
    const csv = mekariCsv([crmRow({ "No Hp": "68", Nama: 'A, "B"', Domisili: "X\nY" })]);
    const line = csv.replace(/^\uFEFF/, "").split("\r\n")[1];
    expect(line).toBe('68,"A, ""B""","A, ""B""","X\nY"');
  });

  it("produces a BOM-only string for empty rows", () => {
    expect(mekariCsv([])).toBe("\uFEFF");
  });

  it("names the file mekari_contacts_YYYYMMDD.csv", () => {
    expect(mekariFilename(new Date(2026, 8, 15))).toBe("mekari_contacts_20260915.csv");
  });
});

/* --------------------------------------------------------------------------- */

describe("B1 regression: Status is HEADER-mapped, never a fixed offset", () => {
  it("declared crm schema puts Status at crm.columns.indexOf('Status') (0-based 14)", () => {
    expect(COLS.indexOf("Status")).toBe(14);
    expect(COLS[14]).toBe("Status");
    expect(COLS).toHaveLength(17); // effective cols; index 17 (col 18) is spare
  });

  it("buildCrmAppendRows writes Status at crm.columns.indexOf('Status'), not index 17", () => {
    const wa = [
      {
        "No Hp": "0815-111",
        Nama: "Ani",
        Asal: "Bantul",
        "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya",
        "Mekari Tag": "",
        "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "Closing",
      },
    ];
    const built = buildCrmAppendRows(wa, []);
    const row = built.rows[0];
    expect(row[COLS.indexOf("Status")]).toBe("Closing");
    expect(row[14]).toBe("Closing");
    expect(row[17]).toBeUndefined(); // the V3-bug column stays empty
  });

  it("append projection (buildCellRows) keeps Status under its declared header", () => {
    // Simulates a client append object carrying Status (e.g. a future import that
    // includes it): buildCellRows must place it at the Status header, not offset.
    const cells = buildCellRows("crm", { Nama: "X", Status: "Closing" });
    const row = cells[0];
    expect(row).toHaveLength(COLS.length);
    expect(row[COLS.indexOf("Status")]).toBe("Closing");
    expect(row[14]).toBe("Closing");
    expect(row[17]).toBeUndefined(); // declared cols only; no fixed offset write.
  });
});

describe("WRITE tests — mock source ONLY (never production)", () => {
  /** Seeded source with one syncable WA row + empty CRM tab. */
  const syncSource = () =>
    makeFakeSource({
      seed: (title, key) => {
        if (key === "wa_admin") {
          const cols = columnsFor("wa_admin");
          const r = new Array<string>(cols.length).fill("");
          const put = (c: string, v: string) => {
            const i = cols.indexOf(c);
            if (i >= 0) r[i] = v;
          };
          put("f", "1");
          put("Tanggal Masuk", "27/09/2025");
          put("No Hp", "0815-111");
          put("Nama", "Ani");
          put("Asal", "Bantul");
          put("Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)", "Biaya");
          put("Mekari Tag", "");
          put("Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)", "Closing");
          return [cols, r];
        }
        return [columnsFor(key)];
      },
    });

  it("sync: editor 200 + audit entry (mock source)", async () => {
    const { source, api } = syncSource();
    const audit = new MemoryAuditLog();
    const res = await syncController(makeSession("editor-user", "editor"), source, audit);
    expect(res.status).toBe(200);
    const b = (await res.json()) as { ok: boolean; added: number; message: string };
    expect(b.ok).toBe(true);
    expect(b.added).toBe(1);
    expect(b.message).toContain("Berhasil menyinkronkan 1 prospek baru ke CRM.");
    expect(audit.entries[0]).toMatchObject({
      operation: "sync", tableKey: "crm", actor: "editor-user", success: true,
    });
    // The appended Status landed at the header position in the fake sheet.
    const crmValues = api.tabs.find((t) => t.title === "DATABASE NOMOR")!.values;
    const statusCol = crmValues[0].indexOf("Status"); // header-resolved
    expect(statusCol).toBe(14);
    expect(crmValues[crmValues.length - 1][statusCol]).toBe("Closing");
  });

  it("sync: viewer 403 (mock source)", async () => {
    const { source } = syncSource();
    const res = await syncController(makeSession("v", "viewer"), source, new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("import append: unknown column -> 400 VALIDATION_FAILED (mock source)", async () => {
    const { source } = makeFakeSource();
    const res = await appendTableController(
      makeSession("editor-user", "editor"),
      source,
      "crm",
      { "No Hp": "'0812", Bogus: "x" },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("VALIDATION_FAILED");
  });

  it("append: valid client-import payload for an editor nulls no Status offset (mock source)", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const res = await appendTableController(
      makeSession("editor-user", "editor"),
      source,
      "crm",
      [{ No: "", "No Hp": "'0812", Nama: "Ani", Domisili: "PT Maju" }],
      audit,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, affected: 1 });
    expect(audit.entries[0]).toMatchObject({ operation: "append", tableKey: "crm", actor: "editor-user" });
  });
});

describe("CrmDashboard (react-dom/server, no browser)", () => {
  it("renders hero, sync/import, filters, metrics, table, export and refresh", () => {
    const html = renderToStaticMarkup(
      <CrmDashboard rows={FIXTURE} columns={COLS} />,
    );
    expect(html).toContain("CRM / Leads");
    expect(html).toContain("Sync &amp; Import"); // HTML-escaped '&'
    expect(html).toContain("Tarik data unik dari WA Admin");
    expect(html).toContain("Konfirmasi import");
    expect(html).toContain("Filter &amp; Cari");
    expect(html).toContain("Cari nama / nomor HP");
    expect(html).toContain("Hasil Filter");
    expect(html).toContain("Total DB");
    expect(html).toContain("Sudah T1");
    expect(html).toContain("Sudah T2");
    expect(html).toContain("Unduh hasil filter (CSV Mekari)");
    expect(html).toContain("Refresh Data");
    // Treatment options rendered.
    for (const o of TREATMENT_OPTIONS) expect(html).toContain(o);
  });

  it("renders the empty state (Database CRM kosong) with no filter section", () => {
    const html = renderToStaticMarkup(<CrmDashboard rows={[]} columns={COLS} />);
    expect(html).toContain("Database CRM kosong.");
    expect(html).not.toContain("Filter &amp; Cari");
    expect(html).not.toContain("Unduh hasil filter");
    expect(html).toContain("Sync &amp; Import"); // sync/import still shown (V3 order)
    expect(html).toContain("Refresh Data");
  });
});