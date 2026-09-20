/**
 * CRM workspace — pure derivations + client-side import transform + Mekari export
 * (port of pages/5_CRM.py).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts/filtering the
 * V3 page computed, and never touches Sheets directly. All inputs are the
 * normalized rows from GET /api/tables/crm.
 *
 * Mirrors 5_CRM.py line-for-line:
 *   - sync is a single POST /api/sync/wa-to-crm (editor) whose summary message /
 *     added / skipped are surfaced verbatim
 *   - CRM import is a CLIENT-SIDE transform (V3 `_import_row`: file cols
 *     full_name / customer_name / phone_number / company are mapped into the CRM
 *     layout) + POST /api/tables/crm append (seen briefly + in cli docs) — the
 *     server's header-projection import would NOT map those file columns into
 *     Nama / No Hp / Domisili, so we transform here.
 *   - search: Nama case-insensitive substring OR No Hp substring (V3 str.contains)
 *   - Mekari Tag multiselect on the schema column "Mekari Tag (Status Terakhir)"
 *   - Domisili multiselect; Treatment select (Sudah T1 / Sudah T2 / Belum)
 *   - Mekari CSV export of the FILTERED rows: phone_number/full_name/customer_name/
 *     company with normalizePhone and a utf-8-sig BOM
 *
 * NOTE on B1: Status is ALWAYS header-mapped. The workspace never builds fixed
 * cells — the append path goes through buildCellRows (header-projected declared
 * order) and the WA→CRM sync through buildCrmAppendRows (header-aligned). See
 * crm.test.tsx for the regression proof.
 */
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";
import { parseFileToAoa } from "@/workspaces/ads";

/** V3 _import_row canonical file columns. */
export const IMPORT_COLUMNS = ["full_name", "customer_name", "phone_number", "company"] as const;

/** V3 Treatment select options. */
export const TREATMENT_OPTIONS = ["Semua", "Sudah T1", "Sudah T2", "Belum"];

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Read a string cell at an aoa column index (missing -> ""). */
function cellAt(aoa: unknown[], i: number): unknown {
  return i >= 0 && aoa && i < aoa.length ? aoa[i] : "";
}

/**
 * Map a parsed file (aoa, row 0 = headers) into schema-keyed CRM append objects,
 * exactly V3 `_import_row`:
 *   No=""  No Hp="'" + phone (apostrophe keeps the number as text in Sheets)
 *   Nama = full_name, falling back to customer_name when full_name=="nan"
 *   Domisili = String(company); every other CRM column is left unset (the server
 *   defaults missing keys to "" in buildCellRows).
 * Every data row is imported (V3 imports all rows; the server skips empty cells).
 */
export function buildCrmImportRows(aoa: unknown[][]): Record<string, unknown>[] {
  if (!aoa || aoa.length < 2) return [];
  const headers = aoa[0].map((h) => str(h).trim().toLowerCase());
  const idxOf = (name: string) => headers.indexOf(name);
  const fullName = idxOf("full_name");
  const customerName = idxOf("customer_name");
  const phoneNumber = idxOf("phone_number");
  const company = idxOf("company");

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const arr = aoa[r];
    let nama = str(cellAt(arr, fullName));
    if (nama.toLowerCase() === "nan") {
      nama = str(cellAt(arr, customerName));
    }
    rows.push({
      No: "",
      "No Hp": "'" + str(cellAt(arr, phoneNumber)),
      Nama: nama,
      Domisili: str(cellAt(arr, company)),
    });
  }
  return rows;
}

/** Re-export the shared browser CSV/XLSX parser (reads pd.read_csv/read_excel parity). */
export { parseFileToAoa };

/* ---------------------------------------------------------------------------
 * Filters & search (V3 mask semantics) — pure over the normalized rows.
 * ------------------------------------------------------------------------ */

export interface CrmFilters {
  search: string;
  /** Selected "Mekari Tag (Status Terakhir)" values (empty = no filter). */
  mekari: string[];
  /** Selected Domisili values (empty = no filter). */
  domisili: string[];
  /** TREATMENT_OPTIONS value — "Semua" disables. */
  treatment: string;
}

/** Distinct non-null, non-empty sorted values for the two multiselects. */
export function crmFilterOptions(rows: Row[]): { mekari: string[]; domisili: string[] } {
  const mekari = new Set<string>();
  const domisili = new Set<string>();
  for (const r of rows) {
    const m = r["Mekari Tag (Status Terakhir)"];
    if (m !== null && m !== undefined && str(m) !== "") mekari.add(str(m));
    const d = r["Domisili"];
    if (d !== null && d !== undefined && str(d) !== "") domisili.add(str(d));
  }
  return { mekari: [...mekari].sort(), domisili: [...domisili].sort() };
}

/**
 * Apply V3's filter mask. search matches Nama (case-insensitive) OR No Hp
 * (substring) — only when either column exists. Treatment gating follows V3 and
 * always guards on column presence (Treatment 1 required; Treatment 2 guarded).
 */
export function filterCrmRows(rows: Row[], f: CrmFilters): Row[] {
  const q = f.search.trim();
  return rows.filter((row) => {
    // Search (Nama case-insensitive OR No Hp substring), only when a col exists.
    if (q !== "") {
      const hasName = Object.prototype.hasOwnProperty.call(row, "Nama");
      const hasHp = Object.prototype.hasOwnProperty.call(row, "No Hp");
      if (hasName || hasHp) {
        const nm = hasName && str(row["Nama"]).toLowerCase().includes(q.toLowerCase());
        const hp = hasHp && str(row["No Hp"]).includes(q);
        if (!nm && !hp) return false;
      }
    }
    if (f.mekari.length && !f.mekari.includes(str(row["Mekari Tag (Status Terakhir)"]))) {
      return false;
    }
    if (f.domisili.length && !f.domisili.includes(str(row["Domisili"]))) {
      return false;
    }
    if ("Treatment 1" in row && f.treatment !== "Semua") {
      const t1 = str(row["Treatment 1"]);
      const t2 = str(row["Treatment 2"]);
      if (f.treatment === "Sudah T1" && t1 === "") return false;
      if (f.treatment === "Sudah T2" && t2 === "") return false;
      if (f.treatment === "Belum" && !(t1 === "" && t2 === "")) return false;
    }
    return true;
  });
}

export interface CrmMetrics {
  hasilFilter: number;
  totalDb: number;
  sudahT1: number;
  sudahT2: number;
}

/** V3 metric_row: Hasil Filter / Total DB / Sudah T1 / Sudah T2. */
export function crmMetrics(filtered: Row[], all: Row[]): CrmMetrics {
  let sudahT1 = 0;
  let sudahT2 = 0;
  for (const r of all) {
    if ("Treatment 1" in r && str(r["Treatment 1"]) !== "") sudahT1++;
    if ("Treatment 2" in r && str(r["Treatment 2"]) !== "") sudahT2++;
  }
  return { hasilFilter: filtered.length, totalDb: all.length, sudahT1, sudahT2 };
}

/* ---------------------------------------------------------------------------
 * Mekari CSV export (V3 `_mekari_csv`) of the FILTERED rows.
 *   columns: phone_number,full_name,customer_name,company
 *   phone_number = normalizePhone(No Hp); full_name=customer_name=Nama; company=Domisili
 *   utf-8-sig BOM. Filename `mekari_contacts_YYYYMMDD.csv`.
 * ------------------------------------------------------------------------ */

/** Escape a CSV field per RFC-4180 (quote with commas/quotes/newlines; double quotes). */
function escField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the Mekari CSV text (utf-8-sig BOM prepended). */
export function mekariCsv(rows: Row[]): string {
  if (!rows.length) return "\uFEFF";
  const header = "phone_number,full_name,customer_name,company";
  const body = rows.map((row) => {
    const hp = normalizePhone(row["No Hp"]);
    const nama = str(row["Nama"]);
    const company = str(row["Domisili"]);
    return [escField(hp), escField(nama), escField(nama), escField(company)].join(",");
  });
  return "\uFEFF" + [header, ...body].join("\r\n");
}

/** V3 filename `mekari_contacts_YYYYMMDD.csv` (local time). */
export function mekariFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `mekari_contacts_${y}${m}${d}.csv`;
}