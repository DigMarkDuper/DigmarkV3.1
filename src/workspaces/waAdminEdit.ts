/**
 * WA Admin "Edit Data" — PURE form logic (search predicate, row→form mapping,
 * change diff, validation). No IO, no React — unit-testable.
 *
 * Reuses EXACTLY the KEYS / format helpers / value-domain fallbacks exported from
 * waAdminForm.ts (never re-declared). The UI component
 * (src/components/ops/WaAdminEditData.tsx) wires these to state + PATCH.
 *
 * Data integrity: this module treats `__rowIndex` as the ONLY row handle. The GET
 * rows carry a numeric `__rowIndex` (the 0-based index into the ORIGINAL
 * spreadsheet rows) which `searchRowsMulti` carries through untouched — array /
 * filtered position is never used as identity.
 */
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  timeHmToDotted,
  type WaAdminFormValues,
  type WaAdminFieldErrors,
  type WaAdminFieldName,
} from "@/workspaces/waAdminForm";

const KEY = WA_ADMIN_PAYLOAD_KEYS;

/** Canonical 12-field order (= §3.2 order; keys EXACT schema headers). */
const FIELD_ORDER: WaAdminFieldName[] = [
  "tanggalMasuk",
  "noHp",
  "jamChatMasuk",
  "pic",
  "nama",
  "asal",
  "sumber",
  "pertanyaan",
  "kategori",
  "mekariTag",
  "status",
  "keteranganAdmin",
];

/** `DD/MM/YYYY` (what the sheet emits) → `YYYY-MM-DD` for the date picker. */
function toIsoYmd(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  return "";
}

/** `HH.MM`/`HH:MM` stored value → `HH:MM` for the time picker. */
function toHm(value: unknown): string {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
  return "";
}

/** A single AND-clause: a column + a lifted keyword clause. */
export interface SearchClause {
  /** EXACT schema column for the criterion (see SEARCH_CRITERIA.column). */
  column: string;
  /** Trimmed, non-empty keyword; a clause whose keyword is empty is IGNORED. */
  keyword: string;
}

/**
 * Multi-criterion search: AND (intersection) of every NON-empty clause, in order.
 * Each clause = contains, case-insensitive, whitespace-trimmed match against its
 * client column across ALL rows (whole table, not the filtered view).
 * AND across the filled rows = a row must match EVERY non-empty clause.
 * Clauses with empty keyword.trim() are skipped (the caller already guarantees at
 * least one is non-empty). Returns matched rows, same source order, __rowIndex
 * carried through untouched. All-empty clauses → [].
 */
export function searchRowsMulti(
  rows: Row[],
  clauses: SearchClause[],
): Row[] {
  const active = clauses.filter((c) => c.keyword.trim().length > 0);
  if (active.length === 0) return [];
  return rows.filter((r) =>
    active.every((c) =>
      String(r[c.column] ?? "").trim().toLowerCase().includes(
        c.keyword.trim().toLowerCase(),
      ),
    ),
  );
}

/** Column → user-friendly label (mirror of the UI SEARCH_CRITERIA pairing). */
const SEARCH_COLUMN_LABELS: Record<string, string> = {
  [WA_ADMIN_PAYLOAD_KEYS.noHp]: "No Hp",
  [WA_ADMIN_PAYLOAD_KEYS.tanggalMasuk]: "Tanggal Masuk",
  [WA_ADMIN_PAYLOAD_KEYS.jamChatMasuk]: "Jam Chat Masuk",
  [WA_ADMIN_PAYLOAD_KEYS.pic]: "PIC",
  [WA_ADMIN_PAYLOAD_KEYS.nama]: "Nama",
  [WA_ADMIN_PAYLOAD_KEYS.asal]: "Asal",
  [WA_ADMIN_PAYLOAD_KEYS.sumber]: "Sumber",
  [WA_ADMIN_PAYLOAD_KEYS.kategori]: "Kategori",
  [WA_ADMIN_PAYLOAD_KEYS.mekariTag]: "Mekari Tag",
  [STATUS_COLUMN]: "Status",
};

/** Human label for a clause column — falls back to the raw column header. */
export function labelFor(column: string): string {
  return SEARCH_COLUMN_LABELS[column] ?? column;
}

/**
 * "No Hp: 08123", "No Hp: 08123 · Nama: Budi", etc. — active-clause summary used
 * on the results/empty screens (§12.8). Empty-keyword clauses are dropped.
 */
export function formatActiveCriteria(clauses: SearchClause[]): string {
  const active = clauses.filter((c) => c.keyword.trim().length > 0);
  return active
    .map((c) => `${labelFor(c.column)}: ${c.keyword.trim()}`)
    .join(" · ");
}

/**
 * Map a selected row → the 12-field form shape (§3.2). Date/time get converted
 * for their native pickers; No Hp is preserved VERBATIM (stored format, NOT
 * re-normalized into view — normalization happens only on SAVE via
 * `changedFieldValues`); free fields verbatim; empty ⇒ "".
 */
export function rowToFormValue(row: Row): WaAdminFormValues {
  const v = (col: string) => String(row[col] ?? "").trim();
  return {
    tanggalMasuk: toIsoYmd(row[KEY.tanggalMasuk]),
    noHp: v(KEY.noHp),
    jamChatMasuk: toHm(row[KEY.jamChatMasuk]),
    pic: v(KEY.pic),
    nama: v(KEY.nama),
    asal: v(KEY.asal),
    sumber: v(KEY.sumber),
    pertanyaan: v(KEY.pertanyaan),
    kategori: v(KEY.kategori),
    mekariTag: v(KEY.mekariTag),
    status: v(KEY.status),
    keteranganAdmin: v(KEY.keteranganAdmin),
  };
}

/**
 * Change-diff against the pre-fill. For each of the 12 fields, a difference
 * (after normalization) → `{ column: EXACT schema header, value: fmt(current) }`
 * where No Hp → `normalizePhone` (62-form), Jam Chat Masuk → `timeHmToDotted`
 * (HH.MM), else `trim()`.
 *
 * Normalized COMPARISON for No Hp keeps a user who retyped/left the same phone
 * from producing a spurious PATCH (a stored "08..." and a "62..." alike both
 * normalize to the same 62-form). Returns [] when nothing changed (caller skips
 * the PATCH entirely).
 */
export function changedFieldValues(
  preFill: WaAdminFormValues,
  current: WaAdminFormValues,
): { column: string; value: string }[] {
  const out: { column: string; value: string }[] = [];
  for (const field of FIELD_ORDER) {
    const prev = String(preFill[field] ?? "").trim();
    const cur = String(current[field] ?? "").trim();
    if (field === "noHp") {
      if (normalizePhone(prev) !== normalizePhone(cur)) {
        out.push({ column: KEY[field], value: normalizePhone(cur) });
      }
      continue;
    }
    if (prev !== cur) {
      out.push({
        column: KEY[field],
        value: field === "jamChatMasuk" ? timeHmToDotted(cur) : cur,
      });
    }
  }
  return out;
}

/**
 * EDIT validation — mirrors waAdminForm.validateWaAdminForm (same required set —
 * i.e. REQUIRED_FIELDS — No Hp via normalizePhone, Jam non-empty). Error copy
 * matches the "+ Tambah Data" form verbatim.
 */
export function validateWaAdminEdit(values: WaAdminFormValues): WaAdminFieldErrors {
  const errors: WaAdminFieldErrors = {};
  if (!values.tanggalMasuk.trim()) errors.tanggalMasuk = "Tanggal Masuk wajib diisi.";
  if (!normalizePhone(values.noHp)) errors.noHp = "Nomor HP tidak valid.";
  if (!values.jamChatMasuk.trim()) errors.jamChatMasuk = "Jam Chat Masuk wajib diisi.";
  if (!values.pic.trim()) errors.pic = "PIC wajib diisi.";
  if (!values.nama.trim()) errors.nama = "Nama wajib diisi.";
  if (!values.sumber.trim()) errors.sumber = "Sumber wajib diisi.";
  if (!values.kategori.trim()) errors.kategori = "Kategori wajib diisi.";
  if (!values.status.trim()) errors.status = "Status wajib diisi.";
  return errors;
}