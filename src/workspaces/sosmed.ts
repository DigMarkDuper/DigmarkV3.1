/**
 * Sosmed workspace — pure derivations + inline-editor diff (port of pages/2_Sosmed.py).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts/filtering the
 * V3 page computed, and never touches Sheets. All inputs are the normalized rows
 * from GET /api/tables/sosmed.
 *
 * Mirrors 2_Sosmed.py line-for-line:
 *   - PIC multiselect = sorted distinct non-null PIC (or PIC_LIST fallback),
 *     default all selected
 *   - Month multiselect "Bulan Deadline" = distinct deadline-month labels derived
 *     from `Tanggal Deadline` (the sosmed deadline column), default all selected
 *   - metrics: Total Rencana / Total DONE / Video Selesai / Design Selesai
 *     (video = Output contains "Video" ci; done = PROSES==DONE)
 *   - hutang: IG = count(done & ~post_done.IG); YT = count(done & video &
 *     ~post_done.YT); TikTok = count(done & ~post_done.TIKTOK)
 *   - workload: per selected PIC present in filtered data, Selesai vs Hutang
 *   - editor diff: PATCH only changed cells, booleans as REAL booleans
 *
 * MONTH DERIVATION: WORK is grouped by DEADLINE month (`Tanggal Deadline`),
 * NOT posting month. Source-data validated: the sosmed schema declares
 * `Tanggal Deadline`, and the production master populates it (137/168 rows,
 * all differ from `Tanggal Posting`). `Tanggal Posting` remains available as a
 * date column in the inline editor (read-only) but is NOT used for month
 * grouping/filtering. Filtering mirrors V3's `if month_col and months:` branch:
 * when NO deadline month is derivable across the rows the month filter is
 * skipped entirely; when months are derivable, a row whose deadline month
 * cannot be parsed drops out of the selection exactly like a NaN Bulan-Date.
 */
import type { Row } from "@/server/adapter/source";
import { columnNames, monthLabel, toDatetime } from "@/server/utils/helpers";
import { PIC_LIST } from "@/config/constants";

/** Schema columns the editor exposes (V3 editable_cols, read-only shown plain). */
export const SOSMED_DATE_COLS = ["Tanggal Deadline", "Tanggal Posting", "Deadline"] as const;
/** Boolean post flags — always PATCHed as a REAL boolean. */
export const SOSMED_BOOL_COLS = ["IG", "YT", "TIKTOK"] as const;
/** Free-text / select columns PATCHed as trimmed strings. */
export const SOSMED_TEXT_COLS = ["Output", "PIC", "PROSES"] as const;
/** Read-only columns in the editor (Kode Konten, date col, Judul Konten). */
export const SOSMED_READONLY_COLS = ["Kode Konten", "Judul Konten"] as const;
/** PROSES select options (V3 column_config SelectboxColumn). */
export const PROSES_OPTIONS = ["DONE", "PENDING", "ON PROGRESS"] as const;
/** V3 _truthy / post_done keyword set. */
export const POST_TRUTHY = new Set(["V", "TRUE", "1", "YES", "CHECKED"]);

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** V3 `_truthy`: bool passthrough, numeric via !0, strings stripped/uppercased. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return POST_TRUTHY.has(str(v).trim().toUpperCase());
}

/** V3 post_done for a single value (uppercased+stripped ∈ keyword set). */
export function postDone(v: unknown): boolean {
  return truthy(v);
}

/** Deadline month label for a row (grouping key), "" when unparseable. */
export function deadlineMonth(row: Row): string {
  return monthLabel(row["Tanggal Deadline"], "%B %Y");
}

/** Distinct derivable deadline-month labels, in first-appearance order. */
export function sosmedMonths(rows: Row[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const m = deadlineMonth(r);
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/** PIC multiselect options: sorted distinct non-null PIC, else PIC_LIST. */
export function picOptions(rows: Row[]): string[] {
  if (!columnNames(rows).includes("PIC")) return [...PIC_LIST].sort();
  const set = new Set<string>();
  for (const r of rows) {
    const v = r["PIC"];
    if (v === null || v === undefined) continue;
    set.add(str(v));
  }
  return [...set].sort();
}

/** V3: done = PROSES uppercased == "DONE". */
export function isDone(row: Row): boolean {
  return str(row["PROSES"]).toUpperCase() === "DONE";
}

/** V3: video = Output contains "Video" (case-insensitive, na→False). */
export function isVideo(row: Row): boolean {
  return str(row["Output"]).toLowerCase().includes("video");
}

/** Apply the V3 filter mask: PIC ∈ selection, then deadline-month ∈ selection. */
export function filterSosmedRows(rows: Row[], picSel: Set<string>, monthSel: Set<string>): Row[] {
  const filtered = rows.filter((r) => picSel.has(str(r["PIC"])));
  const months = sosmedMonths(rows);
  if (months.length > 0) {
    return filtered.filter((r) => monthSel.has(deadlineMonth(r)));
  }
  return filtered;
}

export interface SosmedMetrics {
  total: number;
  done: number;
  videoCount: number;
  videoDone: number;
  designDone: number;
  designCount: number;
  /** V3 display strings "a/b". */
  videoLabel: string;
  designLabel: string;
  hutangIg: number;
  hutangYt: number;
  hutangTiktok: number;
}

/** V3 key metrics computed over the FILTERED rows. */
export function sosmedMetrics(rows: Row[]): SosmedMetrics {
  const total = rows.length;
  let done = 0;
  let videoCount = 0;
  let videoDone = 0;
  let designDone = 0;
  let designCount = 0;
  let hutangIg = 0;
  let hutangYt = 0;
  let hutangTiktok = 0;
  for (const r of rows) {
    const d = isDone(r);
    const v = isVideo(r);
    if (d) done++;
    if (v) {
      videoCount++;
      if (d) videoDone++;
    } else {
      designCount++;
      if (d) designDone++;
    }
    if (d && !postDone(r["IG"])) hutangIg++;
    if (d && v && !postDone(r["YT"])) hutangYt++;
    if (d && !postDone(r["TIKTOK"])) hutangTiktok++;
  }
  return {
    total,
    done,
    videoCount,
    videoDone,
    designDone,
    designCount,
    videoLabel: `${videoDone}/${videoCount}`,
    designLabel: `${designDone}/${designCount}`,
    hutangIg,
    hutangYt,
    hutangTiktok,
  };
}

/* ---------------------------------------------------------------------------
 * Content Operations Dashboard derivations (additive — existing exports above
 * are unchanged so the V3 metrics, filters, workload and inline editor keep
 * their exact behavior). All functions are PURE: dates are resolved against an
 * injected `today` so the logic is deterministic and unit-testable.
 * ------------------------------------------------------------------------ */

/** Parse the deadline column to a Date (day-first, null when absent/invalid). */
export function deadlineDate(row: Row): Date | null {
  return toDatetime(row["Tanggal Deadline"]);
}

/**
 * §4.2 — Data-aware calendar default month. If today's month already holds a
 * parseable-deadline row, snapshot it to the 1st of today. Otherwise advance to
 * the deadline month carrying the most rows (earliest wins ties); falls back to
 * the 1st of today when no deadline can be parsed at all. Pure & deterministic.
 */
export function calendarDefaultMonth(rows: Row[], today: Date): Date {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = deadlineDate(r);
    if (!d) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const todayKey = `${today.getFullYear()}-${today.getMonth()}`;
  if (counts.has(todayKey)) return new Date(today.getFullYear(), today.getMonth(), 1);
  let bestKey: string | null = null;
  let bestCount = -1;
  for (const [key, n] of counts) {
    if (n > bestCount || (n === bestCount && bestKey !== null && key < bestKey)) {
      bestKey = key;
      bestCount = n;
    }
  }
  if (bestKey === null) return new Date(today.getFullYear(), today.getMonth(), 1);
  const [year, month] = bestKey.split("-").map(Number);
  return new Date(year, month, 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** True when the deadline is in the past AND the content is not yet DONE. */
export function isOverdue(row: Row, today: Date): boolean {
  if (isDone(row)) return false;
  const d = deadlineDate(row);
  return d !== null && d < startOfDay(today);
}

/**
 * Map a row to its production stage, using ONLY the existing `PROSES` field
 * (DONE/ON PROGRESS/PENDING/empty). Review/Revision have NO column in the
 * spreadsheet, so those stages always resolve to 0 — never invented.
 * Published = DONE + posted on the relevant platform(s).
 */
export type ProdStage =
  | "notStarted"
  | "inProduction"
  | "review"
  | "revision"
  | "done"
  | "published";

/** Is this content posted on at least one platform (robust bool parse)? */
export function isPosted(row: Row): boolean {
  return truthy(row["IG"]) || truthy(row["TIKTOK"]) || truthy(row["YT"]);
}

export const STAGE_LABELS: Record<ProdStage, string> = {
  notStarted: "Belum Dimulai",
  inProduction: "Dalam Produksi",
  review: "Review",
  revision: "Revision",
  done: "Done",
  published: "Published",
};

/** Classify a row into a production stage from `PROSES` + posting flags. */
export function stageOf(row: Row): ProdStage {
  if (isDone(row)) return isPosted(row) ? "published" : "done";
  const s = str(row["PROSES"]).toUpperCase();
  if (s === "ON PROGRESS") return "inProduction";
  if (s === "PENDING") return "notStarted";
  // empty / unknown PROSES -> not started (safe bucket, never throws)
  return "notStarted";
}

export interface ProductionOverview {
  planned: number;
  done: number;
  inProgress: number;
  overdue: number;
  completionRate: number | null;
}

/** Operational KPI row: total planned, done, in-progress, overdue, completion %. */
export function productionOverview(rows: Row[], today: Date): ProductionOverview {
  const planned = rows.length;
  let done = 0;
  let inProgress = 0;
  let overdue = 0;
  for (const r of rows) {
    if (isDone(r)) {
      done++;
    } else {
      const s = str(r["PROSES"]).toUpperCase();
      if (s === "ON PROGRESS" || s === "PENDING") inProgress++;
      if (isOverdue(r, today)) overdue++;
    }
  }
  return {
    planned,
    done,
    inProgress,
    overdue,
    completionRate: planned > 0 ? (done / planned) * 100 : null,
  };
}

export interface FunnelStage {
  key: ProdStage;
  label: string;
  count: number;
}

/**
 * Production funnel: Planned → Production → Review → Revision → Done → Published.
 * Review/Revision have no source column -> always 0 (PROSES fallback, honest).
 */
export function productionFunnel(rows: Row[]): FunnelStage[] {
  const counts: Record<ProdStage, number> = {
    notStarted: 0,
    inProduction: 0,
    review: 0,
    revision: 0,
    done: 0,
    published: 0,
  };
  for (const r of rows) {
    counts[stageOf(r)]++;
  }
  const order: ProdStage[] = ["notStarted", "inProduction", "review", "revision", "done", "published"];
  return order.map((key) => ({ key, label: STAGE_LABELS[key], count: counts[key] }));
}

/** Status breakdown: how many contents sit in each production stage (edge-safe). */
export function statusBreakdown(rows: Row[]): FunnelStage[] {
  return productionFunnel(rows);
}

export interface DeadlineMonitor {
  overdue: Row[];
  dueToday: Row[];
  dueThisWeek: Row[];
  completed: Row[];
  overdueCount: number;
  dueTodayCount: number;
  dueThisWeekCount: number;
  completedCount: number;
}

/**
 * Deadline monitoring. `dueThisWeek` = deadline within [today, today+7d].
 * Completed = DONE regardless of deadline. Invalid/missing deadlines drop out
 * of deadline buckets but never break the count.
 */
export function deadlineMonitor(rows: Row[], today: Date): DeadlineMonitor {
  const overdue: Row[] = [];
  const dueToday: Row[] = [];
  const dueThisWeek: Row[] = [];
  const completed: Row[] = [];
  const todayStart = startOfDay(today);
  const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);
  for (const r of rows) {
    if (isDone(r)) {
      completed.push(r);
      continue;
    }
    const d = deadlineDate(r);
    if (d === null) continue; // no/invalid deadline -> not a deadline concern
    if (d < todayStart) overdue.push(r);
    else if (sameDay(d, todayStart)) dueToday.push(r);
    else if (d <= weekEnd) dueThisWeek.push(r);
  }
  return {
    overdue,
    dueToday,
    dueThisWeek,
    completed,
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    dueThisWeekCount: dueThisWeek.length,
    completedCount: completed.length,
  };
}

export interface PicWorkload {
  pic: string;
  total: number;
  done: number;
  pending: number;
  overdue: number;
  completionPct: number | null;
}

/**
 * Workload / capacity monitoring per PIC (NOT a ranking). For each PIC present
 * in the filtered rows: total assigned, done, pending (not done), overdue, and
 * completion %. PICs with no rows are skipped (matches V3 `unique()` behavior).
 */
export function picWorkload(rows: Row[], today: Date): PicWorkload[] {
  const byPic = new Map<string, Row[]>();
  for (const r of rows) {
    const pic = str(r["PIC"]).trim();
    if (pic === "") continue; // missing PIC -> not assignable, skip quietly
    if (!byPic.has(pic)) byPic.set(pic, []);
    byPic.get(pic)!.push(r);
  }
  const out: PicWorkload[] = [];
  for (const [pic, prs] of byPic) {
    let done = 0;
    let overdue = 0;
    for (const r of prs) {
      if (isDone(r)) done++;
      if (isOverdue(r, today)) overdue++;
    }
    out.push({
      pic,
      total: prs.length,
      done,
      pending: prs.length - done,
      overdue,
      completionPct: prs.length > 0 ? (done / prs.length) * 100 : null,
    });
  }
  return out;
}

export interface PublishingSummary {
  ig: number;
  tiktok: number;
  yt: number;
  crossPlatform: number;
  finishedNotPublished: number;
}

/**
 * Publishing tracker from the IG / TIKTOK / YT flags (robust boolean parse).
 * Cross-platform = a row posted on 2+ platforms. finishedNotPublished = DONE
 * content that has NOT been posted anywhere yet.
 */
export function publishingTracker(rows: Row[]): PublishingSummary {
  let ig = 0;
  let tiktok = 0;
  let yt = 0;
  let crossPlatform = 0;
  let finishedNotPublished = 0;
  for (const r of rows) {
    const b = { ig: truthy(r["IG"]), tiktok: truthy(r["TIKTOK"]), yt: truthy(r["YT"]) };
    if (b.ig) ig++;
    if (b.tiktok) tiktok++;
    if (b.yt) yt++;
    if ([b.ig, b.tiktok, b.yt].filter(Boolean).length >= 2) crossPlatform++;
    if (isDone(r) && !isPosted(r)) finishedNotPublished++;
  }
  return { ig, tiktok, yt, crossPlatform, finishedNotPublished };
}

export interface StrategyBucket {
  value: string;
  count: number;
  sharePct: number;
}

export interface ContentStrategy {
  pillars: StrategyBucket[];
  formats: StrategyBucket[];
  platforms: StrategyBucket[];
}

/**
 * Content strategy distribution grouped by the ACTUAL column values
 * (Konten Pillar / Output-as-Format / Platform). Never hardcoded — the live
 * sheet drives the buckets; missing/empty values are excluded.
 */
export function contentStrategy(rows: Row[]): ContentStrategy {
  const aggregate = (col: string): StrategyBucket[] => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const v = str(r[col]).trim();
      if (v === "") continue;
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    const total = rows.length;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        count,
        sharePct: total > 0 ? (count / total) * 100 : 0,
      }));
  };
  return {
    pillars: aggregate("Konten Pillar"),
    formats: aggregate("Output"),
    platforms: aggregate("Platform"),
  };
}

export interface TrendPoint {
  /** Week key (YYYY-M-D of Monday) + display label DD/MM/YYYY. */
  key: string;
  label: string;
  planned: number;
  done: number;
}

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  const shift = dow === 0 ? 6 : dow - 1; // ISO: Monday=0
  d.setDate(d.getDate() - shift);
  return d;
}

/**
 * Weekly production trend (planned vs done) grouped by DEADLINE week.
 * Weeks are keyed by their Monday, ascending. Rows with no/invalid deadline
 * are excluded from the trend (they have no week-axis point).
 */
export function outputTrend(rows: Row[]): TrendPoint[] {
  const byWeek = new Map<string, { planned: number; done: number; monday: Date }>();
  for (const r of rows) {
    const d = deadlineDate(r);
    if (d === null) continue;
    const monday = mondayOf(d);
    const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    const b = byWeek.get(key) ?? { planned: 0, done: 0, monday };
    b.planned++;
    if (isDone(r)) b.done++;
    byWeek.set(key, b);
  }
  return [...byWeek.values()]
    .sort((a, b) => a.monday.getTime() - b.monday.getTime())
    .map((b) => ({
      key: `${b.monday.getFullYear()}-${b.monday.getMonth()}-${b.monday.getDate()}`,
      label: `${String(b.monday.getDate()).padStart(2, "0")}/${String(b.monday.getMonth() + 1).padStart(2, "0")}/${b.monday.getFullYear()}`,
      planned: b.planned,
      done: b.done,
    }));
}

export interface ActionItem {
  title: string;
  pic: string;
  deadline: string;
  platform: string;
  status: string;
}

export interface ActionRequired {
  overdue: ActionItem[];
  reviewNeeded: ActionItem[];
  inRevision: ActionItem[];
  finishedNotPublished: ActionItem[];
}

function toActionItem(row: Row): ActionItem {
  const posted: string[] = [];
  if (truthy(row["IG"])) posted.push("IG");
  if (truthy(row["TIKTOK"])) posted.push("TikTok");
  if (truthy(row["YT"])) posted.push("YT");
  const dl = str(row["Tanggal Deadline"]).trim();
  return {
    title: str(row["Judul Konten"]).trim() !== "" ? str(row["Judul Konten"]) : str(row["Kode Konten"]),
    pic: str(row["PIC"]).trim() === "" ? "—" : str(row["PIC"]),
    deadline: dl === "" ? "—" : dl,
    platform: posted.length ? posted.join(" / ") : "—",
    status: str(row["PROSES"]).trim() === "" ? "" : str(row["PROSES"]),
  };
}

/**
 * Compact operational action list.
 * - overdue: deadline passed & not done
 * - reviewNeeded: in production (PROSES=ON PROGRESS) awaiting next step
 * - inRevision: PROSES="REVISION" if it ever exists (0 today — honest fallback)
 * - finishedNotPublished: DONE but not posted anywhere
 */
export function actionRequired(rows: Row[], today: Date): ActionRequired {
  const overdue: ActionItem[] = [];
  const reviewNeeded: ActionItem[] = [];
  const inRevision: ActionItem[] = [];
  const finishedNotPublished: ActionItem[] = [];
  for (const r of rows) {
    if (isOverdue(r, today)) overdue.push(toActionItem(r));
    const s = str(r["PROSES"]).toUpperCase();
    if (s === "ON PROGRESS") reviewNeeded.push(toActionItem(r));
    if (s === "REVISION") inRevision.push(toActionItem(r));
    if (isDone(r) && !isPosted(r)) finishedNotPublished.push(toActionItem(r));
  }
  return { overdue, reviewNeeded, inRevision, finishedNotPublished };
}

export interface SosmedFilters {
  pics: Set<string>;
  months: Set<string>;
  statuses: Set<string>;
  platforms: Set<string>;
  pillars: Set<string>;
  formats: Set<string>;
}

/** Distinct non-empty values of a column across rows (for filter dropdowns). */
export function distinctValues(rows: Row[], col: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = str(r[col]).trim();
    if (v !== "") set.add(v);
  }
  return [...set].sort();
}

/**
 * Multi-dimension filter (AND): PIC ∪ deadline-month ∪ status ∪ platform ∪
 * pillar ∪ format. Empty sets pass everything (default = show all). A row is
 * kept only when it satisfies EVERY non-empty dimension. Deadline-month
 * reuses the same deadline derivation as the existing filter.
 */
export function filterRows(rows: Row[], f: SosmedFilters): Row[] {
  return rows.filter((r) => {
    if (f.pics.size > 0 && !f.pics.has(str(r["PIC"]))) return false;
    if (f.months.size > 0 && !f.months.has(deadlineMonth(r))) return false;
    if (f.statuses.size > 0 && !f.statuses.has(STAGE_LABELS[stageOf(r)])) return false;
    if (f.platforms.size > 0 && !f.platforms.has(str(r["Platform"]).trim())) return false;
    if (f.pillars.size > 0 && !f.pillars.has(str(r["Konten Pillar"]).trim())) return false;
    if (f.formats.size > 0 && !f.formats.has(str(r["Output"]).trim())) return false;
    return true;
  });
}

export interface WorkloadItem {
  pic: string;
  selesai: number;
  hutang: number;
}

/** V3 workload: per selected PIC present in filtered data, Selesai vs Hutang. */
export function workload(rows: Row[], selectedPics: string[]): WorkloadItem[] {
  const out: WorkloadItem[] = [];
  for (const pic of selectedPics) {
    const p = rows.filter((r) => str(r["PIC"]) === pic);
    if (!p.length) continue; // V3 `if pic in fdf.PIC.unique()`
    const selesai = p.filter(isDone).length;
    out.push({ pic, selesai, hutang: p.length - selesai });
  }
  return out;
}

/** First present date column (V3 `next(... in fdf.columns)`). */
export function pickDateCol(rows: Row[]): string | undefined {
  const cols = columnNames(rows);
  return SOSMED_DATE_COLS.find((c) => cols.includes(c));
}

/* ---------------------------------------------------------------------------
 * Inline editor diff (V3 _save loop) — pure, so it is unit-testable.
 * ------------------------------------------------------------------------ */

/** A single PATCH payload the editor sends to /api/tables/sosmed. */
export interface SosmedPatch {
  /** 0-based row index into the ORIGINAL (unfiltered) rows. */
  rowIndex: number;
  /** Declared schema column name (server resolves by name). */
  column: string;
  /** Scalar — booleans stay REAL booleans; strings are trimmed. */
  value: string | boolean;
}

/**
 * Diff a working-draft edit grid against the original rows and return PATCHes
 * ONLY for cells whose value changed (V3 loops edited.index × bool/text cols,
 * comparing old vs new). `draft` is keyed by original rowIndex → edited column
 * values (bool columns are booleans, text columns are strings).
 *
 * - bool cols IG/YT/TIKTOK: original coerced via truthy(); if differs → PATCH
 *   the REAL boolean (never "true"/"false").
 * - text cols Output/PIC/PROSES: if new is null/empty → skip; if `.trim()`
 *   differs → PATCH the trimmed string.
 */
export function diffPatches(rows: Row[], draft: Record<number, Record<string, string | boolean>>): SosmedPatch[] {
  const patches: SosmedPatch[] = [];
  const rowIndexes = Object.keys(draft)
    .map(Number)
    .sort((a, b) => a - b);
  for (const rowIndex of rowIndexes) {
    const row = rows[rowIndex];
    if (!row) continue;
    const edited = draft[rowIndex];
    // bool cols
    for (const col of SOSMED_BOOL_COLS) {
      const newVal = edited[col];
      if (typeof newVal !== "boolean") continue;
      if (truthy(row[col]) !== newVal) {
        patches.push({ rowIndex, column: col, value: newVal });
      }
    }
    // text cols
    for (const col of SOSMED_TEXT_COLS) {
      const newVal = edited[col];
      if (newVal === null || newVal === undefined || String(newVal).trim() === "") continue;
      const trimmed = String(newVal).trim();
      if (str(row[col]).trim() !== trimmed) {
        patches.push({ rowIndex, column: col, value: trimmed });
      }
    }
  }
  return patches;
}

/* ---------------------------------------------------------------------------
 * Social Media Command Center derivations (additive — pure, unit-testable).
 * Appended after the existing exports; nothing above is modified.
 * ------------------------------------------------------------------------ */

/** Searchable columns for the Master Content Data EXPLORER (§5.2). */
const EXPLORER_SEARCH_COLS = [
  "Kode Konten",
  "Judul Konten",
  "Konten Pillar",
  "Platform",
  "Output",
  "PIC",
] as const;

/**
 * §5.2 — Case-insensitive substring search across Kode/Titel/Pillar/Platform/
 * Format/PIC. Empty/whitespace query returns all rows unchanged.
 */
export function searchContents(rows: Row[], q: string): Row[] {
  const needle = q.trim().toLowerCase();
  if (needle === "") return rows;
  return rows.filter((r) =>
    EXPLORER_SEARCH_COLS.some((c) => str(r[c]).trim().toLowerCase().includes(needle)),
  );
}

/** §5.4.1 — deadline bucket classifier for the Deadline single-select. */
export type DeadlineBucket = "ALL" | "overdue" | "dueToday" | "dueThisWeek" | "future" | "completed";

/**
 * §5.4.1 — Mirror the deadlineMonitor buckets one-to-one. `today` is the
 * start-of-day reference. Completed (DONE) wins; overdue/due-today/due-week
 * only apply to not-done rows; unparseable deadlines fall through to "ALL".
 */
export function deadlineBucket(row: Row, today: Date): DeadlineBucket {
  if (isDone(row)) return "completed";
  const d = deadlineDate(row);
  if (d === null) return "ALL";
  const todayStart = startOfDay(today);
  const weekEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 7);
  if (d < todayStart) return "overdue";
  if (sameDay(d, todayStart)) return "dueToday";
  if (d <= weekEnd) return "dueThisWeek";
  return "future";
}

/**
 * §5.3 — Page-window labels. Always includes 1, totalPages, the current page,
 * and one page on each side; gaps collapse to "…". Literal labels per §5.3.
 */
export type PageItem = number | "…";
export function paginationWindow(page: number, totalPages: number): PageItem[] {
  const total = Math.max(1, totalPages);
  const clamped = Math.max(1, Math.min(page, total));
  if (total === 1) return [1];
  const window = new Set<number>([1, total, clamped - 1, clamped, clamped + 1]);
  const sorted = [...window].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: PageItem[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export interface CalendarCell {
  /** Day-of-month number (1..length of month). For outside cells, the day shown (may be from adjacent month). */
  day: number;
  /** True when this cell belongs to the previous/next month (greyed). */
  isOutside: boolean;
  /** True when this cell is `today`. */
  isToday: boolean;
  /** Deadline rows landing on this day. */
  rows: Row[];
}

/**
 * §4.2 — Build the 7-wide month grid for (year, month). Leading blanks offset
 * the first day from Monday; out-of-month cells render greyed. Rows with a
 * parseable deadline equal to the cell day are attached.
 */
export function calendarCells(rows: Row[], year: number, month: number, today: Date): CalendarCell[] {
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  // Leading blanks from the previous month.
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, isOutside: true, isToday: false, rows: [] });
  }

  // Attach rows to their deadline day.
  const byDay = new Map<number, Row[]>();
  for (const r of rows) {
    const d = deadlineDate(r);
    if (d && d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
  }

  const todayStart = startOfDay(today);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      day,
      isOutside: false,
      isToday: sameDay(new Date(year, month, day), todayStart),
      rows: byDay.get(day) ?? [],
    });
  }

  // Trailing blanks to complete the last week row (keep grid 7-wide even).
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length + 1 - firstDow - daysInMonth, isOutside: true, isToday: false, rows: [] });
  }
  return cells;
}

/**
 * §6.3 — Kode generator. Deterministic per plan row so a re-push produces the
 * same Kode and the dedupe scan catches it.
 */
export function contentKode(date: Date, planRowIndex: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `CT-${y}${m}${d}-${String(planRowIndex).padStart(4, "0")}`;
}

/**
 * §6.3 — Build the ONE appended sosmed row for an approved plan. Keys are the
 * exact declared sosmed schema columns; empty strings for unset.
 */
export function buildProductionRow(plan: Row, today: Date, todayKode: string): Record<string, unknown> {
  return {
    "Kode Konten": todayKode,
    "Tanggal Deadline": str(plan["Deadline Produksi"]),
    "Tanggal Posting": "",
    "Output": str(plan["Format"]),
    "Konten Pillar": str(plan["Content Pillar"]),
    "Platform": str(plan["Platform"]),
    "PIC": str(plan["PIC"]),
    "Judul Konten": str(plan["Judul / Ide Konten"]),
    "Materi Konten": str(plan["Brief"]),
    "  CAPTION ": "",
    "LINK COVER": str(plan["Reference Link"]),
    "PROSES": "PENDING",
    "LINK KONTEN JADI": "",
    "IG": false,
    "TIKTOK": false,
    "YT": false,
  };
}

/**
 * §6.3.2 — Durable dedupe: true when the generated Kode already exists in the
 * current sosmed rows (self-evident collision survives page reloads).
 */
export function productionKodeExists(rows: Row[], kode: string): boolean {
  return rows.some((r) => str(r["Kode Konten"]).trim() === kode);
}

/** §5.5 — Explorer column catalog (key → header → source column). */
export interface ExplorerColumnDef {
  key: string;
  header: string;
  source: string;
}

const DEFAULT_KEYS = ["code", "title", "deadline", "pic", "format", "status", "platform"] as const;
const EXTRA_KEYS = ["pillar", "process", "ig", "tiktok", "yt", "reference", "notes"] as const;

export const EXPLORER_DEFAULT_COLS: readonly string[] = DEFAULT_KEYS as readonly string[];
export const EXPLORER_EXTRA_COLS: readonly string[] = EXTRA_KEYS as readonly string[];

export const COLUMN_DEFS: ExplorerColumnDef[] = [
  { key: "code", header: "Kode", source: "Kode Konten" },
  { key: "title", header: "Content Title", source: "Judul Konten" },
  { key: "deadline", header: "Deadline", source: "Tanggal Deadline" },
  { key: "pic", header: "PIC", source: "PIC" },
  { key: "format", header: "Format", source: "Output" },
  { key: "status", header: "Status", source: "PROSES" },
  { key: "platform", header: "Platform", source: "Platform" },
  { key: "pillar", header: "Content Pillar", source: "Konten Pillar" },
  { key: "process", header: "Process", source: "PROSES" },
  { key: "ig", header: "IG", source: "IG" },
  { key: "tiktok", header: "TikTok", source: "TIKTOK" },
  { key: "yt", header: "YouTube", source: "YT" },
  { key: "reference", header: "Reference", source: "LINK COVER" },
  { key: "notes", header: "Notes", source: "Materi Konten" },
];

/**
 * §4.1 — Build the content_plan append payload from the planner form. Keys are
 * the exact 11 declared content_plan columns (§1.1).
 */
export function buildPlanPayload(form: {
  judul: string;
  publish: string;
  deadlineProduksi: string;
  pillar: string;
  format: string;
  platform: string;
  pic: string;
  brief: string;
  reference: string;
  priority: string;
  statusPlan: string;
}): Record<string, unknown> {
  return {
    "Judul / Ide Konten": form.judul.trim(),
    "Tanggal Publish": form.publish.trim(),
    "Deadline Produksi": form.deadlineProduksi.trim(),
    "Content Pillar": form.pillar.trim(),
    "Format": form.format.trim(),
    "Platform": form.platform.trim(),
    "PIC": form.pic.trim(),
    "Brief": form.brief.trim(),
    "Reference Link": form.reference.trim(),
    "Priority": form.priority.trim(),
    "Status Plan": form.statusPlan.trim() === "" ? "IDEA" : form.statusPlan.trim(),
  };
}
