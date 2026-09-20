/**
 * Insight File Upload — deduplication against existing INSIGHT rows.
 *
 * Key = (normalized D/M/YYYY TANGGAL, PLATFORM) — verified: the sheet is one
 * row per (date, platform). Existing rows come from the live source
 * (fetchTable('insight')) so dedupe is always against ground truth at both
 * preview and confirm time.
 */

import type { InsightSchemaRow } from "./insightTransformer";
import type { Row } from "@/server/adapter/source";

export interface DedupeResult {
  /** Rows without an existing (date, platform) — safe to import. */
  newRows: InsightSchemaRow[];
  /** Rows whose (date, platform) already exists — skipped unless 'all'. */
  potentialDuplicates: InsightSchemaRow[];
}

/** Normalize a row's TANGGAL to D/M/YYYY (already stored that way in the sheet). */
export function dedupeKey(tanggal: unknown, platform: unknown): string {
  const p = String(platform ?? "").trim().toLowerCase();
  return `${String(tanggal ?? "").trim().toLowerCase()}|${p}`;
}

/**
 * Split new rows into new vs potential-duplicate against existing rows.
 */
export function dedupeInsight(
  existingRows: Row[],
  newRows: InsightSchemaRow[],
): DedupeResult {
  const existing = new Set<string>();
  for (const r of existingRows) {
    existing.add(dedupeKey(r.TANGGAL, r.PLATFORM));
  }
  const newOut: InsightSchemaRow[] = [];
  const dupeOut: InsightSchemaRow[] = [];
  for (const row of newRows) {
    const k = dedupeKey(row.TANGGAL, row.PLATFORM);
    if (existing.has(k)) {
      dupeOut.push(row);
    } else {
      newOut.push(row);
    }
  }
  return { newRows: newOut, potentialDuplicates: dupeOut };
}