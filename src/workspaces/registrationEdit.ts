/**
 * Registration "Edit Pendaftar" — PURE form logic for editing a REGISTRATION
 * (Form Responses 1) row from the Pendaftar Terbaru table.
 *
 * Edit unit = the EXACT 36-column registration schema (REGISTRATION_COLUMNS),
 * NOT the WA admin schema. Changing a field produces a single per-column PATCH
 * to /api/registration/data keyed by the EXACT column header, so untouched
 * columns are never rewritten (no column corruption).
 *
 * Scope (sensible subset): identity/contact + source + PIC + the process-stage
 * columns. Timestamp is intentionally read-only. Reuses normalizePhone and the
 * waAdminForm `distinctCellValues` for dropdown domains.
 */
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";
import { distinctCellValues } from "@/workspaces/waAdminForm";

/** Editable registration field → EXACT REGISTRATION_COLUMNS header. */
export const REG_EDIT_COLUMNS = {
  nama: "Nama Lengkap",
  whatsapp: "Nomor Whatsapp",
  source: "MENGETAHUI DUTA PERSADA DARI",
  pic: "PIC",
  penjadwalan: "Penjadwalan Interview",
  interview: "Interview",
  hasil: "Hasil Interview\n(Diterima/Tidak)",
  juknis: "Pengiriman Juknis",
  pembayaran: "Pembayaran",
  grup: "Invite Grup Pendaftar",
} as const;

export type RegEditFieldName = keyof typeof REG_EDIT_COLUMNS;

export interface RegEditValues {
  nama: string;
  whatsapp: string;
  source: string;
  pic: string;
  penjadwalan: string;
  interview: string;
  hasil: string;
  juknis: string;
  pembayaran: string;
  grup: string;
}

export type RegEditFieldErrors = Partial<Record<RegEditFieldName, string>>;

/** Stable field order (matches the edit-form layout). */
export const REG_EDIT_FIELD_ORDER: RegEditFieldName[] = [
  "nama",
  "whatsapp",
  "source",
  "pic",
  "penjadwalan",
  "interview",
  "hasil",
  "juknis",
  "pembayaran",
  "grup",
];

/** Fallback dropdown values for the registration process-stage columns. */
export const REG_STAGE_FALLBACKS: Record<string, string[]> = {
  [REG_EDIT_COLUMNS.penjadwalan]: ["Belum", "Sudah"],
  [REG_EDIT_COLUMNS.interview]: ["Belum", "Sudah"],
  [REG_EDIT_COLUMNS.hasil]: ["Ya", "Tidak"],
  [REG_EDIT_COLUMNS.juknis]: ["Belum", "Sudah"],
  [REG_EDIT_COLUMNS.pembayaran]: ["Belum", "Sudah"],
  [REG_EDIT_COLUMNS.grup]: ["Belum", "Sudah"],
};

/** Source (MENGETAHUI DUTA PERSADA DARI) fallbacks when the column holds no data. */
export const REG_SOURCE_FALLBACK = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Google",
  "Teman/Keluarga",
  "Sales",
  "Lainnya",
];

/** Build the per-field dropdown options from live registration rows. */
export function regEditOptions(
  rows: Row[],
  field: RegEditFieldName,
): string[] {
  const col = REG_EDIT_COLUMNS[field];
  if (field === "pic") return distinctCellValues(rows, col, ["ONLINE", "OFFLINE", "EJAK"]);
  if (field === "source") return distinctCellValues(rows, col, REG_SOURCE_FALLBACK);
  return distinctCellValues(rows, col, REG_STAGE_FALLBACKS[col] ?? []);
}

/** Literal column header for a field (exact REGISTRATION_COLUMNS string). */
export function regEditColumn(field: RegEditFieldName): string {
  return REG_EDIT_COLUMNS[field];
}

/** Map a registration row → editable form shape (verbatim, trimmed). */
export function rowToRegFormValue(row: Row): RegEditValues {
  const v = (col: string) => String(row[col] ?? "").trim();
  return {
    nama: v(REG_EDIT_COLUMNS.nama),
    whatsapp: v(REG_EDIT_COLUMNS.whatsapp),
    source: v(REG_EDIT_COLUMNS.source),
    pic: v(REG_EDIT_COLUMNS.pic),
    penjadwalan: v(REG_EDIT_COLUMNS.penjadwalan),
    interview: v(REG_EDIT_COLUMNS.interview),
    hasil: v(REG_EDIT_COLUMNS.hasil),
    juknis: v(REG_EDIT_COLUMNS.juknis),
    pembayaran: v(REG_EDIT_COLUMNS.pembayaran),
    grup: v(REG_EDIT_COLUMNS.grup),
  };
}

/**
 * Per-column change diff vs the pre-fill. Each change → { column: EXACT header,
 * value } exactly equal to the PATCH body for /api/registration/data. Only
 * actually-changed fields are emitted (no clobbering). WhatsApp is normalized
 * before compare + on output (like the WA admin edit); text values are trimmed.
 * Returns [] when nothing changed.
 */
export function changedRegFieldValues(
  preFill: RegEditValues,
  current: RegEditValues,
): { column: string; value: string }[] {
  const out: { column: string; value: string }[] = [];
  for (const field of REG_EDIT_FIELD_ORDER) {
    const prev = String(preFill[field] ?? "").trim();
    const cur = String(current[field] ?? "").trim();
    if (field === "whatsapp") {
      if (normalizePhone(prev) !== normalizePhone(cur)) {
        out.push({ column: REG_EDIT_COLUMNS.whatsapp, value: normalizePhone(cur) });
      }
      continue;
    }
    if (prev !== cur) {
      out.push({ column: REG_EDIT_COLUMNS[field], value: cur });
    }
  }
  return out;
}

/** The 0-based spreadsheet data-row index for a registration Row (its __rowIndex). */
export function regRowIndex(row: Row): number {
  return Number(row.__rowIndex ?? -1);
}

/**
 * Registration edit validation. Nama + WhatsApp required (WhatsApp via
 * normalizePhone — must contain digits). All other fields optional (stage cols
 * left blank are written verbatim). Returns per-field error map; empty = valid.
 */
export function validateRegEdit(values: RegEditValues): RegEditFieldErrors {
  const errors: RegEditFieldErrors = {};
  if (!values.nama.trim()) errors.nama = "Nama wajib diisi.";
  if (!normalizePhone(values.whatsapp)) errors.whatsapp = "Nomor WhatsApp tidak valid.";
  return errors;
}
