/**
 * Insight File Upload — data transformer.
 *
 * Builds normalized, schema-ordered rows from the parsed files for a given
 * platform. Responsibilities:
 *   - date parsing: Instagram ISO timestamps -> D/M/YYYY (day-first, unpadded);
 *     TikTok `MonthName Day` + year inference (current year; if any resulting
 *       date is in the future, use Y-1 for the WHOLE file).
 *   - number normalization (`"10,000"` -> 10000, `"1.2K"` -> 1200, dash/empty -> 0).
 *   - per-metric merge across files keyed by (D/M/YYYY | platform). Conflicts
 *     (two sources disagree on the same metric for the same date) resolve
 *     with LAST-FILE-WINS (deterministic; order = file upload order).
 *   - TikTok CONTENT INTERACTION = Likes + Comments + Shares (computed).
 *   - output rows as objects keyed by the EXACT INSIGHT schema column names,
 *     with absent metrics stored as 0 (matches the existing 456-row sheet).
 */

import type { ParsedInsightFile } from "./fileParser";
import { mapHeaderToMetric } from "./columnMapper";
import type { Platform } from "./platformDetector";
import { toDatetime } from "@/server/utils/helpers";
import { columnsFor } from "@/server/adapter/schema";
import { buildCellRows } from "@/lib/validation";
import type { Cell } from "@/server/adapter/source";

/** Exact INSIGHT schema column headers (kept in sync via the source of truth). */
export const INSIGHT_COLS: string[] = ["TANGGAL", "PLATFORM", "VIEW", "REACH", "CONTENT INTERACTION", "PROFILE VISIT", "LINK CLICKS", "FOLLOWER"];

/** A schema-keyed row (values are strings/numbers matching the sheet). */
export type InsightSchemaRow = Record<string, string | number>;

/** What the transformer returns. */
export interface TransformResult {
  rows: InsightSchemaRow[];
  /** Warnings discovered during transform (non-blocking notes for the UI). */
  warnings: string[];
}

// --- number / date helpers (unit-tested directly) ---------------------------

/**
 * Normalize a metric value to a real number (never a string).
 *  - numbers -> as-is
 *  - `,` / `.` thousands grouping removed before parsing (locale-aware);
 *    `1.2K`-style K/k suffix => x1000 (single decimal point preserved).
 *  - empty / dash / non-numeric -> 0 (matches existing sheet convention).
 */
export function normalizeMetric(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const s = String(value ?? "").trim();
  if (s === "" || s === "-" || s === "–" || s === "--") {
    return 0;
  }
  const lower = s.toLowerCase();
  // Suffix: K/k -> x1000 (single decimal point preserved for the suffix).
  const kMatch = lower.match(/^([+-]?[\d.,]+)\s*k$/);
  if (kMatch) {
    // Keep one decimal separator, drop the rest as thousands grouping.
    const raw = kMatch[1];
    const hasDot = raw.includes(".");
    let digits = raw.replace(/[, ]/g, "");
    if (hasDot) {
      const dotIdx = digits.lastIndexOf(".");
      digits = digits.slice(0, dotIdx) + "." + digits.slice(dotIdx + 1).replace(/\./g, "");
    }
    const n = Number(digits);
    return (Number.isFinite(n) ? n : 0) * 1000;
  }
  // Plain integer: drop all grouping ([.,\s]) then parse (IDR convention).
  const clean = s.replace(/[,.\s\u00a0]/g, "");
  if (clean === "" || clean === "-" || clean === "+") {
    return 0;
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** D/M/YYYY day-first, NON-padded (matches existing sheet storage format). */
export function toDayFirst(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** Parse an ISO timestamp (Instagram) to a D/M/YYYY string, or null. */
export function parseIsoDate(value: unknown): string | null {
  const d = toDatetime(value); // handles ISO YYYY-MM-DD + D/M/YYYY
  return d ? toDayFirst(d) : null;
}

/**
 * Parse a TikTok `MonthName Day` (no year) into {month, day} or null.
 * e.g. "September 17" -> {month: 9, day: 17}.
 */
export function parseMonthDay(value: unknown): { month: number; day: number } | null {
  const s = String(value ?? "").trim().toLowerCase();
  const m = s.match(/^([a-z]+)\s+(\d{1,2})$/);
  if (!m) {
    return null;
  }
  const month = MONTHS[m[1]];
  const day = Number(m[2]);
  if (!month || day < 1 || day > 31) {
    return null;
  }
  return { month, day };
}

/** True when a Date is after the current moment (used for year inference). */
function isFuture(date: Date, now: Date): boolean {
  return date.getTime() > now.getTime();
}

/**
 * Infer the year for a TikTok file's raw `MonthName Day` dates.
 * Rule (verified decision): assume the current year; if ANY resulting date is
 * in the future (>= tomorrow), use Y-1 for the WHOLE file.
 * Returns a year, or null when no parseable date exists.
 */
export function inferTikTokYear(
  rawDates: unknown[],
  now: Date = new Date(),
): number | null {
  const currentYear = now.getFullYear();
  const candidates: Date[] = [];
  for (const raw of rawDates) {
    const md = parseMonthDay(raw);
    if (!md) {
      continue;
    }
    const d = new Date(currentYear, md.month - 1, md.day);
    if (d.getFullYear() !== currentYear || d.getMonth() !== md.month - 1 || d.getDate() !== md.day) {
      continue;
    }
    candidates.push(d);
  }
  if (!candidates.length) {
    return null;
  }
  const anyFuture = candidates.some((d) => isFuture(d, now));
  return anyFuture ? currentYear - 1 : currentYear;
}

// --- transform --------------------------------------------------------------

interface Accumulated {
  /** Merged metric value by canonical metric name for one (date|platform). */
  metrics: Record<string, number>;
}

/**
 * Transform parsed files for a platform into merged schema rows.
 * `platform` is authoritative (already resolved by detector or manual choice).
 */
export function transformInsight(
  files: ParsedInsightFile[],
  platform: Platform,
  now: Date = new Date(),
): TransformResult {
  const warnings: string[] = [];

  // 1. Date strategy per platform.
  // TikTok: compute the year once across all TikTok date cells.
  let tikTokYear: number | null = null;
  if (platform === "TikTok") {
    const allRaw = files
      .flatMap((f) => f.headers.includes("date") ? f.rows.map((r) => r["date"]) : [])
      .filter((d) => parseMonthDay(d) !== null);
    tikTokYear = inferTikTokYear(allRaw, now);
  }

  // (dateKey) -> accumulated metrics.
  const acc = new Map<string, Accumulated>();

  // 2. Per file, per row: parse date + map every column to a metric, fold in.
  for (const f of files) {
    const dateCol = f.headers.find((h) => h === "date") ?? "date";
    for (const row of f.rows) {
      const rawDate = row[dateCol];
      let key: string | null;
      if (platform === "TikTok") {
        const md = parseMonthDay(rawDate);
        if (!md || tikTokYear === null) {
          continue; // invalid date -> dropped (validator reports)
        }
        const d = new Date(tikTokYear, md.month - 1, md.day);
        if (d.getFullYear() !== tikTokYear || d.getMonth() !== md.month - 1 || d.getDate() !== md.day) {
          continue;
        }
        key = toDayFirst(d);
      } else {
        key = parseIsoDate(rawDate);
        if (!key) {
          continue;
        }
      }

      let bucket = acc.get(key);
      if (!bucket) {
        bucket = { metrics: {} };
        acc.set(key, bucket);
      }

      // Fold each column into the bucket (LAST-FILE-WINS on conflict).
      if (f.kind === "instagram-per-metric" && f.title) {
        const metric = mapHeaderToMetric(f.title);
        if (metric) {
          bucket.metrics[metric] = normalizeMetric(row["primary"]);
        }
        continue;
      }
      for (const header of f.headers) {
        if (header === "date") {
          continue;
        }
        const metric = mapHeaderToMetric(header);
        if (metric) {
          bucket.metrics[metric] = normalizeMetric(row[header]);
        }
      }
    }
  }

  // 3. Build schema rows (one per date) — IL / schema-order + TT interaction.
  const rows: InsightSchemaRow[] = [];
  for (const [key, bucket] of acc) {
    const m = bucket.metrics;
    // CONTENT INTERACTION: explicit file metric wins; else compute for TikTok.
    let content = m["CONTENT_INTERACTION"];
    if (platform === "TikTok" && (content === undefined || content === 0)) {
      const likes = m["LIKES"] ?? 0;
      const comments = m["COMMENTS"] ?? 0;
      const shares = m["SHARES"] ?? 0;
      if (likes !== 0 || comments !== 0 || shares !== 0) {
        content = likes + comments + shares;
      } else {
        content = 0;
      }
    }
    rows.push({
      TANGGAL: key,
      PLATFORM: platform,
      VIEW: m["VIEW"] ?? 0,
      REACH: m["REACH"] ?? 0,
      "CONTENT INTERACTION": content ?? 0,
      "PROFILE VISIT": m["PROFILE_VISIT"] ?? 0,
      "LINK CLICKS": m["LINK_CLICKS"] ?? 0,
      FOLLOWER: m["FOLLOWER"] ?? 0,
    });
  }

  // Sort by date ascending, then platform for deterministic output.
  rows.sort((a, b) => {
    const da = toDatetime(a.TANGGAL);
    const db = toDatetime(b.TANGGAL);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.TANGGAL) < String(b.TANGGAL) ? -1 : 1;
  });

  return { rows, warnings };
}

/**
 * Convert processed schema rows into the Cell[][] the adapter expects, in the
 * EXACT declared INSIGHT column order. Keys MUST equal columnsFor('insight');
 * buildCellRows rejects unknown keys, so this is a strict schema guarantee.
 */
export function buildInsightCells(
  rows: InsightSchemaRow[],
): Cell[][] {
  return buildCellRows("insight", rows) as Cell[][];
}

/** For tests: the declared insight columns (from the schema source of truth). */
export function insightColumns(): string[] {
  return columnsFor("insight");
}