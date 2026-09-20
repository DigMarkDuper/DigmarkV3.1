/**
 * Insight workspace — pure derivations for the Social Media Insight page (/insight).
 *
 * Data contract: GET /api/tables/insight returns rows keyed by the declared INSIGHT
 * schema columns: TANGGAL, PLATFORM, VIEW, REACH, CONTENT INTERACTION, PROFILE VISIT,
 * LINK CLICKS, FOLLOWER. Values arrive as strings or numbers (mixed), so numerics and
 * dates are parsed defensively (`toDatetime` for day-first DD/MM/YYYY).
 *
 * Architecture split (Raw -> Transformation -> Calculated -> Dashboard):
 *   - Raw rows -> parsed/filtered rows:  filterInsightRows, insightDate, toNum
 *   - Calculated metrics:                sumMetrics, derivedRates, funnel, platformComparison,
 *                                        trendSeries, multiTrend, periodSummary, dataQuality
 *   - Dashboard composition:             buildInsightModel (single entry point the
 *                                        InsightDashboard consumes)
 *
 * READ-ONLY: this workspace has NO write path. Nothing here ever touches Sheets.
 */

import type { Row } from "@/server/adapter/source";
import { toDatetime } from "@/server/utils/helpers";

/** KNOWN platforms in the INSIGHT tab (platform select + comparison pivots on these). */
export const PLATFORMS = ["Instagram", "TikTok"] as const;
export type PlatformName = (typeof PLATFORMS)[number];
/** Active platform filter key: "all" = both known platforms (plus any unknown rows). */
export type PlatformKey = "all" | PlatformName;

/** Declared INSIGHT metric columns, in display/storage order. */
export const INSIGHT_METRIC_COLS = [
  "VIEW",
  "REACH",
  "CONTENT INTERACTION",
  "PROFILE VISIT",
  "LINK CLICKS",
  "FOLLOWER",
] as const;
export type InsightMetric = (typeof INSIGHT_METRIC_COLS)[number];

/** Indonesian display labels for the metric columns (UI copy is Indonesian). */
export const INSIGHT_METRIC_LABELS: Record<InsightMetric, string> = {
  VIEW: "Views",
  REACH: "Reach",
  "CONTENT INTERACTION": "Interaksi Konten",
  "PROFILE VISIT": "Kunjungan Profil",
  "LINK CLICKS": "Klik Link",
  FOLLOWER: "Follower",
};

/** Map a schema column -> the canonical field name on InsightMetrics. */
export const METRIC_FIELD_BY_COL: Record<InsightMetric, keyof InsightMetrics> = {
  VIEW: "views",
  REACH: "reach",
  "CONTENT INTERACTION": "contentInteraction",
  "PROFILE VISIT": "profileVisit",
  "LINK CLICKS": "linkClicks",
  FOLLOWER: "netFollower",
};

export const DATE_COL = "TANGGAL";
export const PLATFORM_COL = "PLATFORM";

/* ---------------------------------------------------------------------------
 * Raw -> Transformation (parsing + filtering)
 * ------------------------------------------------------------------------ */

/** Defensive numeric parse: strip grouping/separator chars from strings, NaN/empty -> 0. */
export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "." || s === ",") return 0;
  const n = Number(s.replace(/[.,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Parse the row's TANGGAL (day-first supported) to a local-midnight Date, else null. */
export function insightDate(row: Row): Date | null {
  return toDatetime(row[DATE_COL]);
}

/** Raw PLATFORM cell trimmed to string ("" when missing). */
export function insightPlatform(row: Row): string {
  const v = row[PLATFORM_COL];
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Normalize a platform string to a KNOWN platform, or null if unrecognized. */
export function normalizedPlatform(p: string): PlatformName | null {
  const q = p.toUpperCase();
  for (const x of PLATFORMS) if (x.toUpperCase() === q) return x;
  return null;
}

/** True when a raw platform string is one of the known platforms (case-insensitive). */
export function isKnownPlatform(p: string): boolean {
  return normalizedPlatform(p) !== null;
}

/** Match a raw platform against the active filter key. */
export function rowMatchesPlatform(p: string, key: PlatformKey): boolean {
  if (key === "all") return true;
  return normalizedPlatform(p) === key;
}

/** Active date+platform filter (offsets already resolved to Dates by caller). */
export interface InsightFilters {
  /** Inclusive lower bound (00:00 local). null = no lower bound. */
  from: Date | null;
  /** Inclusive upper bound (00:00 local). null = no upper bound. */
  to: Date | null;
  platform: PlatformKey;
}

/**
 * Filter rows by platform + inclusive date range. Rows without a parseable date are
 * kept when no date bound is active, and dropped as soon as ANY date bound is set
 * (an undated row cannot be placed with confidence inside a range).
 */
export function filterInsightRows(rows: Row[], f: InsightFilters): Row[] {
  return rows.filter((r) => {
    if (!rowMatchesPlatform(insightPlatform(r), f.platform)) return false;
    const d = insightDate(r);
    if (f.from || f.to) {
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    return true;
  });
}

/** Span of parseable dates across rows: min/max (local-midnight) + count, else null. */
export function dateSpan(rows: Row[]): { min: Date; max: Date; count: number } | null {
  let min: Date | null = null;
  let max: Date | null = null;
  let count = 0;
  for (const r of rows) {
    const d = insightDate(r);
    if (!d) continue;
    count++;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  return min && max ? { min, max, count } : null;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Calendar-day span of [a,b] inclusive (>= 1). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** The equal-length window immediately preceding [from,to]: [from-span, from-1day]. */
export function previousDates(from: Date, to: Date): { from: Date; to: Date } | null {
  const span = daysBetween(from, to);
  if (span <= 0) return null;
  return { from: addDays(from, -span), to: addDays(from, -1) };
}

/* ---------------------------------------------------------------------------
 * Calculated metrics
 * ------------------------------------------------------------------------ */

export interface InsightMetrics {
  views: number;
  reach: number;
  contentInteraction: number;
  profileVisit: number;
  linkClicks: number;
  /** Net follower = sum of the daily FOLLOWER column within the selection. */
  netFollower: number;
}

export const ZERO_METRICS: InsightMetrics = {
  views: 0, reach: 0, contentInteraction: 0, profileVisit: 0, linkClicks: 0, netFollower: 0,
};

/** Sum all six INSIGHT metrics across rows (raw -> totals). */
export function sumMetrics(rows: Row[]): InsightMetrics {
  let v = 0, r = 0, ci = 0, pv = 0, lc = 0, f = 0;
  for (const row of rows) {
    v += toNum(row.VIEW);
    r += toNum(row.REACH);
    ci += toNum(row["CONTENT INTERACTION"]);
    pv += toNum(row["PROFILE VISIT"]);
    lc += toNum(row["LINK CLICKS"]);
    f += toNum(row.FOLLOWER);
  }
  return { views: v, reach: r, contentInteraction: ci, profileVisit: pv, linkClicks: lc, netFollower: f };
}

/** Percentage helper. Returns null (never NaN/Infinity) when denominator <= 0. */
export function rate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return (n / d) * 100;
}

/** Four derived social-media rates. CRITICAL: denominator 0 -> null (UI shows "N/A"). */
export interface DerivedRates {
  /** Engagement Rate = Content Interaction / Reach * 100. */
  engagement: number | null;
  /** Profile Visit Rate = Profile Visit / Reach * 100. */
  profileVisitRate: number | null;
  /** Link CTR = Link Clicks / Reach * 100. */
  linkCtr: number | null;
  /** Profile->Click Conversion = Link Clicks / Profile Visit * 100. */
  profileToClick: number | null;
}

export function derivedRates(m: InsightMetrics): DerivedRates {
  return {
    engagement: rate(m.contentInteraction, m.reach),
    profileVisitRate: rate(m.profileVisit, m.reach),
    linkCtr: rate(m.linkClicks, m.reach),
    profileToClick: rate(m.linkClicks, m.profileVisit),
  };
}

/** Summed metrics + derived rates in one object. */
export type InsightDerived = InsightMetrics & DerivedRates;

export function deriveMetrics(rows: Row[]): InsightDerived {
  const m = sumMetrics(rows);
  return { ...m, ...derivedRates(m) };
}

/* ---------------------------------------------------------------------------
 * Metric availability ("0 ≠ unavailable")
 *
 * RULE: a metric M is UNAVAILABLE for a scope when its column is unpopulated
 * throughout that scope — i.e. EVERY row parses to 0/empty for M. This is a
 * read-only, derived signal; source data is never touched or mocked. An empty
 * scope is unavailable. A genuine summed 0 (e.g. from matching positive and
 * negative rows that cancel) remains a real "0", because not every row is 0.
 * Derived rates whose denominator is unavailable OR zero already yield null via
 * rate() -> UI shows "N/A".
 * ------------------------------------------------------------------------ */
export function metricAvailable(rows: Row[], metric: InsightMetric): boolean {
  return rows.some((r) => toNum(r[metric]) !== 0);
}

/** Per-platform availability for every metric over the given rows. */
export function platformAvailability(rows: Row[]): Record<PlatformName, Record<InsightMetric, boolean>> {
  const out = {} as Record<PlatformName, Record<InsightMetric, boolean>>;
  for (const p of PLATFORMS) {
    const scope = rows.filter((r) => rowMatchesPlatform(insightPlatform(r), p));
    const avail = {} as Record<InsightMetric, boolean>;
    for (const c of INSIGHT_METRIC_COLS) avail[c] = metricAvailable(scope, c);
    out[p] = avail;
  }
  return out;
}

/** Percentage change cur vs prev; null when there is no previous baseline (prev == 0). */
export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** Funnel stage (Reach -> Content Interaction -> Profile Visit -> Link Clicks). */
export interface FunnelStage {
  stage: string;
  metric: InsightMetric;
  value: number;
}

/** Build the social-media funnel from summed metrics (INSIGHT-only, no CRM/Lead). */
export function funnel(m: InsightMetrics): FunnelStage[] {
  return [
    { stage: "Reach", metric: "REACH", value: m.reach },
    { stage: "Interaksi Konten", metric: "CONTENT INTERACTION", value: m.contentInteraction },
    { stage: "Kunjungan Profil", metric: "PROFILE VISIT", value: m.profileVisit },
    { stage: "Klik Link", metric: "LINK CLICKS", value: m.linkClicks },
  ];
}

/**
 * Adjacent-stage funnel conversion % = cur/prev * 100; null when the previous
 * stage's base (denominator) is unavailable or zero -> UI shows "N/A".
 */
export function funnelConversionRate(prev: number, cur: number): number | null {
  return rate(cur, prev);
}

/** Instagram vs TikTok side-by-side: raw metrics + derived rates. NO scoring/ranking. */
export type PlatformComparison = Record<PlatformName, InsightDerived>;

export function platformComparison(rows: Row[]): PlatformComparison {
  const out = {} as PlatformComparison;
  for (const p of PLATFORMS) {
    out[p] = deriveMetrics(rows.filter((r) => rowMatchesPlatform(insightPlatform(r), p)));
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Time-series (trend)
 * ------------------------------------------------------------------------ */

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Indonesian short month names (index 0 = January). */
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Indonesian short date label 'D MMM' from a 'YYYY-MM-DD' sortable key. */
function dayLabel(key: string): string {
  const [, m, dd] = key.split("-");
  return `${dd} ${MONTH_SHORT[parseInt(m, 10) - 1] ?? "??"}`;
}

export interface TrendPoint {
  /** Sortable 'YYYY-MM-DD' key. */
  key: string;
  /** Short axis label 'D MMM' (e.g. '01 Jan'). */
  label: string;
  value: number;
}

/** Per-day summed values for a single metric, sorted ascending. */
export function trendSeries(rows: Row[], metric: InsightMetric): TrendPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = insightDate(r);
    if (!d) continue;
    const key = isoDay(d);
    map.set(key, (map.get(key) ?? 0) + toNum(r[metric]));
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => ({ key, label: dayLabel(key), value }));
}

export interface MultiTrendSeries {
  metric: InsightMetric;
  /** Values aligned to `labels` (0 where a series has no row that day). */
  values: number[];
}

/** Union of dates across N metrics -> shared labels + per-metric aligned values. */
export function multiTrend(rows: Row[], metrics: InsightMetric[]): { labels: string[]; series: MultiTrendSeries[] } {
  const perMetric = metrics.map((m) => ({ m, points: trendSeries(rows, m) }));
  const keys = new Set<string>();
  for (const pm of perMetric) for (const p of pm.points) keys.add(p.key);
  const sorted = [...keys].sort();
  const labels = sorted.map(dayLabel);
  const series: MultiTrendSeries[] = perMetric.map((pm) => {
    const byKey = new Map(pm.points.map((p) => [p.key, p.value]));
    return { metric: pm.m, values: sorted.map((k) => byKey.get(k) ?? 0) };
  });
  return { labels, series };
}

/* ---------------------------------------------------------------------------
 * Period performance (daily / weekly / monthly)
 * ------------------------------------------------------------------------ */

export type Granularity = "daily" | "weekly" | "monthly";

export interface PeriodGroup {
  label: string;
  metrics: InsightMetrics;
}

export interface PeriodSection {
  granularity: Granularity;
  title: string;
  groups: PeriodGroup[];
}

function weekStart(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

/** Sortable period key + human label for a day at a given granularity. */
function periodKeyOf(d: Date, g: Granularity): { key: string; label: string } {
  if (g === "daily") {
    const key = isoDay(d);
    return { key, label: dayLabel(key) };
  }
  if (g === "weekly") {
    const ws = weekStart(d);
    const key = isoDay(ws);
    return { key, label: `Wk ${dayLabel(key)}` };
  }
  const p = (n: number) => String(n).padStart(2, "0");
  const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  return { key, label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` };
}

const METRIC_BUCKET_COLS: InsightMetric[] = [...INSIGHT_METRIC_COLS];

function bucketRows(rows: Row[], g: Granularity): PeriodGroup[] {
  const buckets = new Map<string, { label: string; m: InsightMetrics }>();
  for (const r of rows) {
    const d = insightDate(r);
    if (!d) continue;
    const { key, label } = periodKeyOf(d, g);
    const b = buckets.get(key) ?? { label, m: { ...ZERO_METRICS } };
    for (const c of METRIC_BUCKET_COLS) {
      b.m[METRIC_FIELD_BY_COL[c]] += toNum(r[c]);
    }
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, b]) => ({ label: b.label, metrics: b.m }));
}

/** Daily + Weekly + Monthly grouped sums, each sorted ascending by period start. */
export function periodSummary(rows: Row[]): PeriodSection[] {
  return [
    { granularity: "daily", title: "Harian", groups: bucketRows(rows, "daily") },
    { granularity: "weekly", title: "Mingguan", groups: bucketRows(rows, "weekly") },
    { granularity: "monthly", title: "Bulanan", groups: bucketRows(rows, "monthly") },
  ];
}

/* ---------------------------------------------------------------------------
 * Data quality (read-only diagnostic — NEVER alters source values)
 * ------------------------------------------------------------------------ */

export interface QualityIssue {
  kind: string;
  message: string;
}

export interface QualityReport {
  count: number;
  issues: QualityIssue[];
  /** Raw platform -> row count (unknown platforms appear here verbatim). */
  platformCounts: Record<string, number>;
  total: number;
}

/**
 * Detect source-data quirks WITHOUT fixing them: Reach=0, negative follower,
 * duplicate date+platform, out-of-order dates, unknown platforms, empty data.
 */
export function dataQuality(rows: Row[]): QualityReport {
  const issues: QualityIssue[] = [];
  const platformCounts: Record<string, number> = {};
  const seen = new Set<string>();
  let reachZero = 0;
  let negFollower = 0;
  let dup = 0;
  let unknown = 0;

  for (const r of rows) {
    const p = insightPlatform(r);
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    if (p !== "" && !isKnownPlatform(p)) unknown++;
    if (toNum(r.REACH) === 0) reachZero++;
    if (toNum(r.FOLLOWER) < 0) negFollower++;
    const d = insightDate(r);
    if (d) {
      const key = `${isoDay(d)}|${normalizedPlatform(p) ?? "?"}`;
      if (seen.has(key)) dup++;
      else seen.add(key);
    }
  }

  const dated = rows.map((r) => insightDate(r)).filter((d): d is Date => d !== null);
  let outOfOrder = false;
  for (let i = 1; i < dated.length; i++) {
    if (dated[i] < dated[i - 1]) {
      outOfOrder = true;
      break;
    }
  }

  const total = rows.length;
  if (total === 0) issues.push({ kind: "empty", message: "Tidak ada data dalam rentang filter ini." });
  if (reachZero > 0) issues.push({ kind: "reachZero", message: `${reachZero} baris memiliki Reach = 0 (rate menjadi N/A).` });
  if (negFollower > 0) issues.push({ kind: "negativeFollower", message: `${negFollower} baris memiliki nilai Follower negatif.` });
  if (dup > 0) issues.push({ kind: "duplicateDate", message: `${dup} duplikasi pasangan tanggal/platform.` });
  if (outOfOrder) issues.push({ kind: "outOfOrder", message: "Data tidak diurutkan berdasarkan tanggal ascending." });
  if (unknown > 0) issues.push({ kind: "unknownPlatform", message: `${unknown} baris dengan platform tidak dikenal.` });

  return { count: issues.length, issues, platformCounts, total };
}

/* ---------------------------------------------------------------------------
 * Dashboard composition — single source the InsightDashboard consumes
 * ------------------------------------------------------------------------ */

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  return toDatetime(s);
}

export interface InsightDashFilters {
  /** 'YYYY-MM-DD' or '' (empty = full data span). */
  from?: string;
  to?: string;
  platform: PlatformKey;
}

export interface InsightDashboardModel {
  /** Rows after active filters (date + platform). */
  filtered: Row[];
  /** Rows in the preceding equal-length window (same filters), for delta comparison. */
  previous: Row[];
  /** True when a previous-period baseline exists (deltas are meaningful). */
  hasPrevious: boolean;
  metrics: InsightDerived;
  prevMetrics: InsightMetrics;
  /** Per-schema-column percentage change vs previous period; null = no baseline. */
  deltas: Record<InsightMetric, number | null>;
  funnelStages: FunnelStage[];
  platforms: PlatformComparison;
  /** Per-platform metric availability ("0 ≠ unavailable") for the filtered rows. */
  platformAvail: Record<PlatformName, Record<InsightMetric, boolean>>;
  periodSections: PeriodSection[];
  quality: QualityReport;
  span: { min: Date; max: Date; count: number } | null;
}

/** Centralized full derivation for the dashboard given raw rows + active filters. */
export function buildInsightModel(rows: Row[], filters: InsightDashFilters): InsightDashboardModel {
  const span = dateSpan(rows);
  let effFrom = parseDate(filters.from);
  let effTo = parseDate(filters.to);
  if (span) {
    if (!effFrom) effFrom = span.min;
    if (!effTo) effTo = span.max;
  }

  const filtered = filterInsightRows(rows, { from: effFrom, to: effTo, platform: filters.platform });
  const metrics = deriveMetrics(filtered);
  const platformAvail = platformAvailability(filtered);

  let previous: Row[] = [];
  let prevMetrics = { ...ZERO_METRICS };
  const deltas = Object.fromEntries(INSIGHT_METRIC_COLS.map((c) => [c, null])) as Record<InsightMetric, number | null>;
  let hasPrevious = false;
  if (effFrom && effTo) {
    const prev = previousDates(effFrom, effTo);
    if (prev) {
      previous = filterInsightRows(rows, { from: prev.from, to: prev.to, platform: filters.platform });
      if (previous.length > 0) {
        hasPrevious = true;
        prevMetrics = sumMetrics(previous);
        for (const c of INSIGHT_METRIC_COLS) {
          deltas[c] = pctChange(metrics[METRIC_FIELD_BY_COL[c]], prevMetrics[METRIC_FIELD_BY_COL[c]]);
        }
      }
    }
  }

  return {
    filtered,
    previous,
    hasPrevious,
    metrics,
    prevMetrics,
    deltas,
    funnelStages: funnel(metrics),
    platforms: platformComparison(filtered),
    platformAvail,
    periodSections: periodSummary(filtered),
    quality: dataQuality(filtered),
    span,
  };
}