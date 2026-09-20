/**
 * Write operations: append / updateCell / guarded clear / WA→CRM sync.
 *
 * READ THIS for the B1 fix:
 *  - V3 `services/writers.py::_build_crm_rows` wrote the WA Status at the
 *    FIXED 0-based index 17 (column 18) of an 18-cell row, but the live
 *    DATABASE NOMOR sheet has `Status` as the 15th column (header index 14).
 *    V3.1 maps EVERY CRM field by its actual HEADER (from `schema.ts`
 *    `crm.columns`), so Status lands under the literal 'Status' column at
 *    position 15 (1-based).
 */

import { JUNK_TAGS } from "../../../config/constants";
import { normalizePhone, resolveWaStatusCol } from "../../utils/helpers";
import { columnsFor, TAB_SCHEMAS } from "../schema";
import type { ConfirmInfo, Result } from "../source";
import { colToA1, type SheetsApiClient } from "./client";
import { readTable } from "./read";

const EMPTY_VALUES = new Set(["", "nan", "nat", "none"]);

/** V3 `_to_cells`: numbers/bools kept native, everything else str(). */
export function toCells(rows: unknown[][]): unknown[][] {
  return rows.map((row) =>
    row.map((x) =>
      (typeof x === "number" || typeof x === "boolean") && typeof x !== "string" ? x : String(x),
    ),
  );
}

/** V3 `update_cell` value coercion: bool→bool, None→'', else str(). */
export function cellForUpdate(value: unknown): unknown {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

/** Serializable value for a CRM target cell ('' for missing). */
function cleanField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const s = String(value);
  return EMPTY_VALUES.has(s.trim().toLowerCase()) ? "" : s;
}

/** Format a date value to YYYY-MM-DD when it is a Date/parseable; else raw. */
function formatTanggalMasuk(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = value;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const s = String(value).trim();
  return EMPTY_VALUES.has(s.toLowerCase()) ? "" : s;
}

/** First column whose name lowercased contains any keyword; else fallback. */
function findColumn(headers: string[], keywords: string[], fallback: string): string | undefined {
  for (const h of headers) {
    const lc = h.toLowerCase();
    if (keywords.some((k) => lc.includes(k))) {
      return h;
    }
  }
  return headers.includes(fallback) ? fallback : undefined;
}

export interface CrmBuildResult {
  /** Header-aligned CRM cell rows ready to append (B1-correct). */
  rows: unknown[][];
  added: number;
  /** WA rows dropped (junk-filtered + already-present dupes + no phone). */
  skipped: number;
  /** Fatal condition (e.g. WA has no 'No Hp' column); rows will be empty. */
  error?: string;
  message: string;
}

/**
 * Port of V3 `sync_wa_to_crm` + `_build_crm_rows`, but CRM rows are mapped by
 * COLUMN HEADER (crm.columns) not fixed offsets → fixes the B1 offset bug.
 *
 * WA→CRM field mapping (by header):
 *   No Hp                       -> No Hp (normalized 62 form)
 *   Nama                        -> Nama
 *   Asal                        -> Domisili
 *   Kategori   (first col)      -> Kategori
 *   Tanggal Masuk               -> Tanggal Masuk Database
 *   Mekari Tag                  -> Mekari Tag (Status Terakhir)
 *   Status     (last col)       -> Status                <-- lands at col 15
 *   everything else             -> ''
 */
export function buildCrmAppendRows(
  waRows: Record<string, unknown>[],
  crmRows: Record<string, unknown>[],
): CrmBuildResult {
  if (!waRows || !waRows.length) {
    return { rows: [], added: 0, skipped: 0, message: "Data WA Admin kosong." };
  }

  // 1. Junk filter on 'Mekari Tag' / 'Kategori' (V3 exact-name parity).
  const junkRe = new RegExp(JUNK_TAGS.join("|"), "i");
  const filtered = waRows.filter((row) => {
    for (const col of ["Mekari Tag", "Kategori"]) {
      const val = row[col];
      if (val === null || val === undefined || val === "") {
        continue;
      }
      if (junkRe.test(String(val).toLowerCase())) {
        return false; // drop junk row
      }
    }
    return true;
  });
  const junkCount = waRows.length - filtered.length;

  if (!filtered.length) {
    return {
      rows: [],
      added: 0,
      skipped: waRows.length,
      message: "Semua data WA Admin berisi kategori yang dikecualikan.",
    };
  }
  if (!Object.keys(filtered[0]).some((k) => k === "No Hp")) {
    return {
      rows: [],
      added: 0,
      skipped: 0,
      error: "NO_NO_HP",
      message: "Kolom 'No Hp' tidak ditemukan di WA Admin.",
    };
  }

  // 2. Dedupe by normalized phone against existing CRM phones.
  const existing = new Set<string>();
  if (crmRows && crmRows.length) {
    for (const row of crmRows) {
      const p = normalizePhone(row["No Hp"]);
      if (p) {
        existing.add(p);
      }
    }
  }

  const waHeaders = Object.keys(filtered[0]);
  // WA status col resolved by the SHARED canonical helper (last non-"Mekari"
  // "status" column) — identical to the V3 resolution it replaces.
  const statusCol = resolveWaStatusCol(filtered) ?? "Status";
  const kategoriCol = findColumn(waHeaders, ["kategori"], "Kategori") ?? "Kategori";

  const newRows: { phone: string; row: Record<string, unknown> }[] = [];
  for (const row of filtered) {
    const phone = normalizePhone(row["No Hp"]);
    if (!phone || existing.has(phone)) {
      continue;
    }
    newRows.push({ phone, row });
  }

  if (!newRows.length) {
    return {
      rows: [],
      added: 0,
      skipped: junkCount + filtered.length,
      message: "Semua data sudah sinkron (tidak ada prospek baru).",
    };
  }

  // 3. Build header-aligned CRM rows (B1 fix: by header).
  const crmCols = columnsFor("crm");
  const rows = newRows.map(({ phone, row }) => {
    const cells = new Array<string>(crmCols.length).fill("");
    const put = (col: string, val: string) => {
      const i = crmCols.indexOf(col);
      if (i >= 0) {
        cells[i] = val;
      }
    };
    put("No Hp", phone);
    put("Nama", cleanField(row["Nama"]));
    put("Domisili", cleanField(row["Asal"]));
    put("Kategori", cleanField(row[kategoriCol]));
    put("Tanggal Masuk Database", formatTanggalMasuk(row["Tanggal Masuk"]));
    put("Mekari Tag (Status Terakhir)", cleanField(row["Mekari Tag"]));
    put("Status", cleanField(row[statusCol])); // ← col 15, by header
    return cells;
  });

  return {
    rows,
    added: rows.length,
    skipped: junkCount + (filtered.length - rows.length),
    message: `Berhasil menyinkronkan ${rows.length} prospek baru ke CRM.`,
  };
}

/** Append header-aligned cells to a tab using USER_ENTERED (V3 parity). */
export async function appendRowsToSheet(
  api: SheetsApiClient,
  spreadsheetId: string,
  tabTitle: string,
  rows: unknown[][],
): Promise<Result> {
  if (!rows.length) {
    return { ok: true, affected: 0, message: "Nothing to append." };
  }
  try {
    await api.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabTitle}'!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: toCells(rows) },
    });
    return { ok: true, affected: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "APPEND_FAILED", message };
  }
}

/** Update one cell by column HEADER at (dataRowIndex+2). V3 `update_cell`. */
export async function updateCellInSheet(
  api: SheetsApiClient,
  spreadsheetId: string,
  tabTitle: string,
  dataRowIndex: number,
  columnName: string,
  value: unknown,
): Promise<Result> {
  try {
    const hdr = await api.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabTitle}'!1:1`,
    });
    const headers = (hdr.data.values?.[0] ?? []).map((c) => String(c ?? "").trim());
    const colIdx = headers.findIndex((h) => h === columnName);
    if (colIdx < 0) {
      return { ok: false, code: "COLUMN_NOT_FOUND", message: `Column '${columnName}' not found in '${tabTitle}'.` };
    }
    const sheetRow = dataRowIndex + 2; // row 1 = headers
    const cell = `${colToA1(colIdx + 1)}${sheetRow}`;
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabTitle}'!${cell}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[cellForUpdate(value)]] },
    });
    return { ok: true, affected: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "UPDATE_FAILED", message };
  }
}

/**
 * Destructive clear, server-guarded (2-step ConfirmInfo).
 * Refuses unless `confirm.confirmed` is true AND appKey/tabTitle match the
 * declared schema (mirrors V3's guarded two-step confirm, R4).
 */
export async function clearSheet(
  api: SheetsApiClient,
  spreadsheetId: string,
  appKey: string,
  confirm: ConfirmInfo,
): Promise<Result> {
  const schema = TAB_SCHEMAS[appKey];
  if (!schema) {
    return { ok: false, code: "UNKNOWN_TAB", message: `Unknown app key '${appKey}'.` };
  }
  if (!confirm.confirmed) {
    return { ok: false, code: "NOT_CONFIRMED", message: "Clear requires an explicit confirmation (2-step)." };
  }
  if (confirm.appKey !== appKey || confirm.tabTitle !== schema.tab) {
    return {
      ok: false,
      code: "CONFIRM_MISMATCH",
      message: `Confirmation payload does not match target '${appKey}' / '${schema.tab}'.`,
    };
  }
  try {
    await api.spreadsheets.values.clear({ spreadsheetId, range: `'${schema.tab}'!A1:ZZ99999` });
    return {
      ok: true,
      affected: 0,
      message: `Audit: cleared '${schema.tab}' actor='${confirm.actor ?? "unknown"}'.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "CLEAR_FAILED", message };
  }
}

export interface SyncSummary {
  ok: boolean;
  message: string;
  added: number;
  skipped: number;
}

/**
 * Full WA→CRM sync against a real Sheets API: read WA + CRM, build header-aligned
 * rows (B1-correct), append to CRM, return summary. Cache invalidation is the
 * responsibility of the calling source (affected-table only).
 */
export async function syncWaToCrm(
  api: SheetsApiClient,
  spreadsheetId: string,
  invalidateCrm: () => void,
): Promise<SyncSummary> {
  const [waRows, crmRows] = await Promise.all([
    readTable(api, spreadsheetId, "wa_admin"),
    readTable(api, spreadsheetId, "crm"),
  ]);
  const built = buildCrmAppendRows(waRows, crmRows);
  if (built.error) {
    return { ok: false, message: built.message, added: 0, skipped: 0 };
  }
  if (!built.rows.length) {
    return { ok: true, message: built.message, added: 0, skipped: built.skipped };
  }
  const res = await appendRowsToSheet(api, spreadsheetId, TAB_SCHEMAS.crm.tab, built.rows);
  if (!res.ok) {
    return { ok: false, message: res.message ?? "Gagal menulis ke Google Sheets CRM.", added: 0, skipped: built.skipped };
  }
  invalidateCrm(); // invalidate the affected table only (V3.1 improvement)
  return { ok: true, message: built.message, added: built.added, skipped: built.skipped };
}