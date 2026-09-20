/**
 * WA Admin "+ Tambah Data" — PURE form logic (payload-build + formatting +
 * validation + value-domain derivation). No I/O, no React — unit-testable.
 *
 * The UI component (src/components/ops/WaAdminDataForm.tsx) and the dashboard
 * call into these helpers. The payload keys are the EXACT declared schema
 * headers (columnsFor("wa_admin")), so what we send to POST /api/tables/wa_admin
 * maps 1:1 to the live WA ADMIN REPORT columns. Per spec: do NOT include the
 * auto `f` column or `Database` column.
 */
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";

/**
 * Form field name -> exact schema header (payload key).
 * Note the Status header contains a LITERAL "\n\n" (never a space).
 */
export const WA_ADMIN_PAYLOAD_KEYS = {
  tanggalMasuk: "Tanggal Masuk",
  noHp: "No Hp",
  jamChatMasuk: "Jam Chat Masuk",
  pic: "PIC",
  nama: "Nama",
  asal: "Asal",
  sumber: "Sumber (Ads/Organik/Sales)",
  pertanyaan: "Pertanyaan",
  kategori: "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)",
  mekariTag: "Mekari Tag",
  status: "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)",
  keteranganAdmin: "Keterangan Admin",
} as const;

export type WaAdminFieldName = keyof typeof WA_ADMIN_PAYLOAD_KEYS;

export interface WaAdminFormValues {
  tanggalMasuk: string;
  noHp: string;
  jamChatMasuk: string;
  pic: string;
  nama: string;
  asal: string;
  sumber: string;
  pertanyaan: string;
  kategori: string;
  mekariTag: string;
  status: string;
  keteranganAdmin: string;
}

/** Per-field validation errors keyed by form-field name. */
export type WaAdminFieldErrors = Partial<Record<WaAdminFieldName, string>>;

/** The schema-keyed append payload (object of set keys ONLY). */
export type WaAdminPayload = Record<string, string>;

/** Required form fields (spec §Validation). */
export const REQUIRED_FIELDS: WaAdminFieldName[] = [
  "tanggalMasuk",
  "noHp",
  "jamChatMasuk",
  "pic",
  "nama",
  "sumber",
  "kategori",
  "status",
];

/* --------------------------------------------------------------------------
 * Value domains — build dropdowns from the LIVE rows, falling back to these
 * exact verified lists when a column has no data (spec §Verified live facts).
 * ------------------------------------------------------------------------ */
export const PIC_FALLBACK = ["BELIA", "DEA", "EJAK"];
export const SUMBER_FALLBACK = ["ADS/ Blast", "Organik", "Sales Team"];
export const KATEGORI_FALLBACK = [
  "Biaya", "Lainnya", "Loker", "Partnership", "Pendaftaran", "Persyaratan",
];
export const STATUS_FALLBACK = [
  "Closing", "Follow Up", "Interview", "Lainnya", "No Response",
  "Pending Registration", "Sales Progress", "Withdraw",
];

/**
 * Mekari Tag — fixed dropdown options (Ejak, 2026-09-19). The field is
 * OPTIONAL but, when set, must be one of these exact labels.
 */
export const MEKARI_TAG_OPTIONS = [
  "Hot Lead",
  "Warm Lead",
  "Cold Lead",
  "Pending Form - L1",
  "Pending Form - L2",
  "Re-engagement",
  "Future Prospect",
  "Form Submitted",
  "Sales Progress",
  "Not Eligible",
  "Double Chat",
  "Alumni",
  "Partnership",
  "Closed - Registered",
  "Closed - Not Interested",
  "Fast Track",
  "Mahasiswa Observasi",
  "Ortu Siswa",
];

/** The exact Status schema header (for reading live status values). */
export const STATUS_COLUMN = WA_ADMIN_PAYLOAD_KEYS.status;

/** Known-sentinel cell values excluded from dropdown distinct-value sets. */
const NULL_LIKE = new Set(["", "nan", "none", "null"]);

/**
 * Distinct non-empty cell values for a column across `rows`, in first-seen
 * order. Falls back to `fallback` when the column holds no real values
 * (spec: "failing back to these exact lists if a column has no data").
 */
export function distinctCellValues(
  rows: Row[],
  col: string,
  fallback: string[],
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = String(r?.[col] ?? "").trim();
    if (!NULL_LIKE.has(v.toLowerCase())) set.add(v);
  }
  const live = Array.from(set);
  return live.length ? live : fallback;
}

/* --------------------------------------------------------------------------
 * Time / date formatting (spec §Field → column mapping).
 * ------------------------------------------------------------------------ */

/** Convert an `HH:MM` time-picker value to the dot-separated `HH.MM` the
 *  Jam Chat Masuk column stores (e.g. "13:39" -> "13.39"). Tolerance in case
 *  a dot is already present; returns the trimmed input when unparseable. */
export function timeHmToDotted(value: string): string {
  const m = value.trim().match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (!m) return value.trim();
  const [, h, min] = m;
  return `${h.padStart(2, "0")}.${min.padStart(2, "0")}`;
}

/** Current time as `HH:MM` (time-picker default; injectable for tests). */
export function nowTimeHm(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Today as ISO `YYYY-MM-DD` (date-picker default; injectable for tests). */
export function todayYmd(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/* --------------------------------------------------------------------------
 * Form defaults / validation / payload assembly.
 * ------------------------------------------------------------------------ */

/** Fresh form state: today's date + now as the picker defaults, blank else. */
export function emptyWaAdminFormValue(now: Date = new Date()): WaAdminFormValues {
  return {
    tanggalMasuk: todayYmd(now),
    jamChatMasuk: nowTimeHm(now),
    noHp: "",
    pic: "",
    nama: "",
    asal: "",
    sumber: "",
    pertanyaan: "",
    kategori: "",
    mekariTag: "",
    status: "",
    keteranganAdmin: "",
  };
}

/**
 * Client-side validation (spec §Validation). Returns a per-field error map;
 * empty object means "valid, safe to submit". No Hp uses normalizePhone — a
 * value with no digits (or only garbage) fails.
 */
export function validateWaAdminForm(values: WaAdminFormValues): WaAdminFieldErrors {
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

/**
 * Assemble the schema-keyed append payload. Keys are EXACT schema headers;
 * `f` and `Database` are intentionally omitted (the adapter fills them "").
 * No Hp is normalized to the 62-... form, Jam Chat Masuk to the HH.MM dot form.
 */
export function buildWaAdminPayload(values: WaAdminFormValues): WaAdminPayload {
  return {
    [WA_ADMIN_PAYLOAD_KEYS.tanggalMasuk]: values.tanggalMasuk.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.noHp]: normalizePhone(values.noHp),
    [WA_ADMIN_PAYLOAD_KEYS.jamChatMasuk]: timeHmToDotted(values.jamChatMasuk),
    [WA_ADMIN_PAYLOAD_KEYS.pic]: values.pic.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.nama]: values.nama.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.asal]: values.asal.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.sumber]: values.sumber.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.pertanyaan]: values.pertanyaan.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.kategori]: values.kategori.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.mekariTag]: values.mekariTag.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.status]: values.status.trim(),
    [WA_ADMIN_PAYLOAD_KEYS.keteranganAdmin]: values.keteranganAdmin.trim(),
  };
}