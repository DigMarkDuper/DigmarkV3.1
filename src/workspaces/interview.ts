/**
 * Interview workspace — pure derivations (port of pages/8_Interview.py, read-only).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts/preparations
 * the V3 page computed, and never touches Sheets. All inputs are the normalized
 * rows from GET /api/tables/interview. Mirrors 8_Interview.py line-for-line:
 *   - KPI: Total Kandidat / Menunggu Follow-up / Interview Selesai / Lolos Seleksi
 *   - three optional-column multiselect filters (PIC / Status Follow-Up / Hasil)
 *     applied independently to the full row set
 *   - filter options = sorted distinct non-null values of each present column
 *
 * Defensive column handling mirrors V3 (guarded on `in df.columns`): when a
 * column is absent the corresponding KPI/filter is a no-op (0 / unfiltered).
 */
import type { Row } from "@/server/adapter/source";
import { columnNames } from "@/server/utils/helpers";

/** Declared interview columns the derivations reference (schema.ts, exact). */
export const COL_STATUS = "Status Follow-Up";
export const COL_HASIL = "Hasil Interview";
export const COL_PIC = "PIC Interview";

/** V3 `str.contains(..., case=False, na=False)` for the fu series. */
export const FOLLOWUP_PATTERN = /No Respon|Follow Up|Reschedule|Pending|Belum|Menunggu/i;

/** V3 `hasil.str.contains("lulus|diterima", regex=True, na=False)`. */
export const PASS_YES_PATTERN = /lulus|diterima/i;

/** V3 negative-exclusion `~hasil.str.contains("tidak lulus|tidak ", na=False)`. */
export const PASS_NO_PATTERN = /tidak lulus|tidak /i;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export interface InterviewKpis {
  total: number;
  menunggu: number;
  selesai: number;
  lolos: number;
}

/**
 * KPI counts over the full (unfiltered) row set — V3 8_Interview.py §KPI.
 * Every count is guarded on column presence just like `if "..." in df.columns`.
 */
export function deriveKpis(rows: Row[]): InterviewKpis {
  const cols = new Set(columnNames(rows));
  const hasStatus = cols.has(COL_STATUS);
  const hasHasil = cols.has(COL_HASIL);

  // fu: only rows whose Status Follow-Up matches the regex (missing col -> all False).
  let menunggu = 0;
  if (hasStatus) {
    for (const r of rows) {
      if (FOLLOWUP_PATTERN.test(str(r[COL_STATUS]))) menunggu++;
    }
  }

  // hasil lowercased per row for both selesai + lolos (V3 lowercases once).
  const hasil = (r: Row) => (hasHasil ? str(r[COL_HASIL]).toLowerCase() : "");

  // done: hasil non-empty OR status stripped == "Done".
  let selesai = 0;
  for (const r of rows) {
    const h = hasil(r);
    const statusDone = hasStatus && str(r[COL_STATUS]).trim() === "Done";
    if (h !== "" || statusDone) selesai++;
  }

  // passed: hasil matches lulus|diterima AND NOT (tidak lulus|tidak ).
  let lolos = 0;
  for (const r of rows) {
    const h = hasil(r);
    if (PASS_YES_PATTERN.test(h) && !PASS_NO_PATTERN.test(h)) lolos++;
  }

  return { total: rows.length, menunggu, selesai, lolos };
}

/**
 * Sorted distinct non-null string values of an optional column.
 * V3 `sorted(df[col].dropna().astype(str).unique().tolist())`; [] when absent.
 */
export function filterOptions(rows: Row[], col: string): string[] {
  if (!columnNames(rows).includes(col)) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined) continue; // dropna
    set.add(String(v));
  }
  return [...set].sort();
}

/** Apply independent selections: keep rows whose value is in the selection. */
export function applyFilters(
  rows: Row[],
  selections: Partial<Record<string, Set<string>>>,
): Row[] {
  const cols = columnNames(rows);
  let out = rows;
  for (const col of [COL_PIC, COL_STATUS, COL_HASIL]) {
    if (!cols.includes(col)) continue; // col absent -> unfiltered (V3 no-op)
    const sel = selections[col];
    if (sel && sel.size > 0) {
      out = out.filter((r) => sel.has(str(r[col])));
    }
  }
  return out;
}

/** All declared filter columns, each with its sorted options (for the UI row). */
export function interviewFilterColumns(rows: Row[]): { col: string; options: string[] }[] {
  return [COL_PIC, COL_STATUS, COL_HASIL]
    .filter((c) => columnNames(rows).includes(c))
    .map((c) => ({ col: c, options: filterOptions(rows, c) }));
}