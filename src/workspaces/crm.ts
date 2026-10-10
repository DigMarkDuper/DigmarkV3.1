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

// Re-exports for consumer convenience.
export { normalizePhone };

/** V3 _import_row canonical file columns. */
export const IMPORT_COLUMNS = ["full_name", "customer_name", "phone_number", "company"] as const;

/** V3 Treatment select options. */
export const TREATMENT_OPTIONS = [
  "Semua",
  "Belum Treated",
  "Sudah T1",
  "Sudah T2",
  "T1+T2 Lengkap",
];

/** Treatment quick-filter labels for the chip bar. */
export const TREATMENT_CHIPS = [
  { label: "Semua", filter: "Semua" },
  { label: "⚠️ Belum Treated", filter: "Belum" },
  { label: "🟡 Sudah T1", filter: "Sudah T1" },
  { label: "🟢 Sudah T2", filter: "Sudah T2" },
  { label: "✅ T1+T2 Lengkap", filter: "T1+T2 Lengkap" },
];

/** Derived treatment status badge for each row (used in the simplified table). */
export type TreatmentStatusBadge =
  | { variant: "empty"; label: "Belum treated" }
  | { variant: "t1-only"; label: "T1 selesai" }
  | { variant: "t2-only"; label: "T2 saja" }
  | { variant: "both"; label: "T1+T2 selesai" };

/** Compute Latest Treatment Status from Treatment 1 / Treatment 2 fields. */
export function computeTreatmentStatus(row: Row): TreatmentStatusBadge {
  const t1 = Object.prototype.hasOwnProperty.call(row, "Treatment 1") ? str(row["Treatment 1"]) : "";
  const t2 = Object.prototype.hasOwnProperty.call(row, "Treatment 2") ? str(row["Treatment 2"]) : "";
  if (t1 === "" && t2 === "") return { variant: "empty", label: "Belum treated" };
  if (t1 !== "" && t2 !== "") return { variant: "both", label: "T1+T2 selesai" };
  if (t1 !== "" && t2 === "") return { variant: "t1-only", label: "T1 selesai" };
  return { variant: "t2-only", label: "T2 saja" };
}

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
  /** Selected Kategori values (empty = no filter). */
  kategori: string[];
  /** TREATMENT_OPTIONS value — "Semua" disables. */
  treatment: string;
}

/** Distinct non-null, non-empty sorted values for the three multiselects. */
export function crmFilterOptions(rows: Row[]): { mekari: string[]; domisili: string[]; kategori: string[] } {
  const mekari = new Set<string>();
  const domisili = new Set<string>();
  const kategori = new Set<string>();
  for (const r of rows) {
    const m = r["Mekari Tag (Status Terakhir)"];
    if (m !== null && m !== undefined && str(m) !== "") mekari.add(str(m));
    const d = r["Domisili"];
    if (d !== null && d !== undefined && str(d) !== "") domisili.add(str(d));
    const k = r["Kategori"];
    if (k !== null && k !== undefined && str(k) !== "") kategori.add(str(k));
  }
  return { mekari: [...mekari].sort(), domisili: [...domisili].sort(), kategori: [...kategori].sort() };
}

/**
 * Apply V3's filter mask. search matches Nama (case-insensitive) OR No Hp
 * (substring) — only when either column exists. Treatment gating follows V3 and
 * always guards on column presence (Treatment 1 required; Treatment 2 guarded).
 * Added: Kategori multiselect filter + "T1+T2 Lengkap" treatment option.
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
    if (f.kategori.length && !f.kategori.includes(str(row["Kategori"]))) {
      return false;
    }
    if ("Treatment 1" in row && f.treatment !== "Semua") {
      const t1 = str(row["Treatment 1"]);
      const t2 = str(row["Treatment 2"]);
      if (f.treatment === "Sudah T1" && t1 === "") return false;
      if (f.treatment === "Sudah T2" && t2 === "") return false;
      if (f.treatment === "Belum" && !(t1 === "" && t2 === "")) return false;
      if (f.treatment === "T1+T2 Lengkap" && !(t1 !== "" && t2 !== "")) return false;
      if (f.treatment === "Belum Treated" && !(t1 === "" && t2 === "")) return false;
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

/* ---------------------------------------------------------------------------
 * Phone number validation, dedup, and copy helpers — for WhatsApp blasting.
 * ------------------------------------------------------------------------ */

/** Result of phone-number validation on a set of rows. */
export interface PhoneValidationResult {
  /** Total rows counted. */
  total: number;
  /** Normalized 62-prefixed numbers that are valid. Deduplicated count. */
  validUnique: number;
  /** Valid numbers before dedup (for duplicate detection display). */
  validAll: number;
  /** Duplicate counts removed. */
  duplicatesRemoved: number;
  /** Rows with empty/no phone number. */
  missingCount: number;
  /** List of unique normalized phone strings (safe to use). */
  phones: string[];
}

/** Validate phone numbers from rows: normalize, dedup, count issues. */
export function validatePhones(rows: Row[]): PhoneValidationResult {
  const allNormalized: string[] = [];
  for (const row of rows) {
    const raw = str(row["No Hp"]);
    if (raw === "" || raw.trim() === "") continue;
    const normalized = normalizePhone(raw);
    if (normalized !== "") allNormalized.push(normalized);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of allNormalized) {
    if (!seen.has(p)) {
      seen.add(p);
      unique.push(p);
    }
  }
  return {
    total: rows.length,
    validAll: allNormalized.length,
    validUnique: unique.length,
    duplicatesRemoved: allNormalized.length - unique.length,
    missingCount: rows.length - allNormalized.length,
    phones: unique,
  };
}

/** Format a normalized 62-phone for display (copy-friendly). */
function formatPhoneForDisplay(phone: string): string {
  // Already starts with 62 from normalizePhone
  if (phone.startsWith("628")) {
    // Indonesian mobile: strip leading 62, insert space after country code
    const rest = phone.slice(2);
    return `+${phone} (${rest})`;
  }
  return `+${phone}`;
}

/** Build plain-text phone list (newline-separated) for clipboard copy. */
export function buildPhoneListText(rows: Row[], validated?: PhoneValidationResult): string {
  const result = validated ?? validatePhones(rows);
  return result.phones.join("\n");
}

/** CSV export of selected/filtered rows (Mekari format). For bulk selection. */
export function mekariCsvSelected(selectedRows: Row[]): string {
  return mekariCsv(selectedRows);
}