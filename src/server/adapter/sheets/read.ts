/**
 * Table reads + normalization.
 *
 * Mirrors V3 `services/loaders.py::_read_tab` (get_all_records → sanitize_mixed).
 * Uses `FORMATTED_VALUE` render like gspread so dates arrive as DD/MM/YYYY
 * strings and booleans as real booleans. Empty sheets and missing tabs degrade
 * to `[]` (graceful empty — parity with V3).
 */

import { columnsFor, TAB_SCHEMAS } from "../schema";
import { sanitizeMixed } from "../../utils/helpers";
import type { SheetsApiClient } from "./client";

/**
 * Convert raw Sheet values (row 0 = headers) to normalized rows keyed by the
 * LIVE header text. Only declared columns (from the schema) are surfaced, so a
 * sheet with extra/odd columns does not pollute the DTO surface.
 */

/** Coerce boolean-literal strings ("TRUE"/"FALSE") back to real booleans. */
function coerceCell(v: unknown): unknown {
  if (typeof v === "string") {
    const t = v.trim();
    if (/^true$/i.test(t)) {
      return true;
    }
    if (/^false$/i.test(t)) {
      return false;
    }
  }
  return v;
}

export function normalizeRows(columns: string[], values: unknown[][]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  if (!values || values.length < 2) {
    return rows; // header only / empty -> graceful empty
  }
  const headerRow = values[0] ?? [];
  // Map exact declared column -> its live index (position-proof: B1 class fixes).
  const headerIdx: Record<string, number> = {};
  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c];
    const key = h === null || h === undefined ? "" : String(h).trim();
    if (key && headerIdx[key] === undefined) {
      headerIdx[key] = c;
    }
  }
  for (let i = 1; i < values.length; i++) {
    const raw = values[i] ?? [];
    const row: Record<string, unknown> = {};
    let any = false;
    for (const col of columns) {
      const idx = headerIdx[col.trim()];
      let v: unknown = "";
      if (idx !== undefined && idx !== -1) {
        v = coerceCell(raw[idx] ?? "");
        if (v !== "" && v !== null && v !== undefined) {
          any = true;
        }
      }
      row[col] = v;
    }
    if (any) {
      // Row handle for edit integrity: the 0-based index into the ORIGINAL values
      // array (i-1, since row 0 is the header). This is EXACTLY the dataRowIndex
      // updateCellInSheet expects (sheetRow = dataRowIndex + 2). Attaching it only
      // to rows actually returned makes `__rowIndex` survive the `if (any)`
      // empty-row filtering — the true original row, never the filtered-array
      // position — so editors can address the right spreadsheet row by identity.
      row.__rowIndex = i - 1;
      rows.push(row);
    }
  }
  // sanitize_mixed: coerce mixed-dtype columns to string (Arrow/display-safe).
  return sanitizeMixed(rows);
}

/**
 * Read a tab by app key from a Sheets API client. Uses declared headers only.
 */
export async function readTable(api: SheetsApiClient, spreadsheetId: string, appKey: string): Promise<Record<string, unknown>[]> {
  const schema = TAB_SCHEMAS[appKey];
  if (!schema) {
    return []; // unknown app key -> graceful empty
  }
  const columns = columnsFor(appKey);
  let values: unknown[][];
  try {
    const res = await api.spreadsheets.values.get({
      spreadsheetId,
      range: `'${schema.tab}'!A1:ZZ`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    values = res.data.values ?? [];
  } catch {
    return []; // tab missing / not accessible -> graceful empty
  }
  return normalizeRows(columns, values);
}