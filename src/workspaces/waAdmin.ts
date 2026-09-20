/**
 * WA Admin workspace — pure derivations (port of pages/4_WA_Admin.py, read-only).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts/preparations
 * the V3 page computed, and never touches Sheets. All inputs are the normalized
 * rows from GET /api/tables/wa_admin. Mirrors 4_WA_Admin.py line-for-line:
 *   - JUNK filter on the exact "Mekari Tag"/"Kategori" columns present  (BEFORE all)
 *   - status column resolved V3-style (last col containing "Status", excl. "Mekari")
 *     then null/"" → "Belum Terupdate"
 *   - Closing metric = rows whose STATUS (col L) EXACTLY equals "closing",
 *     measured over ALL source rows (pre-junk-filter), per REVISI FITUR 2026-09
 *     (the spreadsheet's column-L count; junk strips many Closing rows: 70→2).
 *   - KPI: Total Leads / Closing / Conversion (1 dp %) / Closing-Target
 *   - leads-per-month trend restricted to the CURRENT year, labeled "%b %Y"
 *   - status distribution + asal-prospek (source) breakdown + detail-status rows
 *   - Pesan Total Per PIC (group by PIC) + Mekari Tag chart + Pembagian Intensi
 *     Pesan (group by Kategori) — all from actual source values (no hardcoding)
 *   - client-side CSV (whole junk-filtered set, utf-8-sig BOM) — `toCsv`/`csvFilename`
 */
import type { Row } from "@/server/adapter/source";
import { JUNK_TAGS, CLOSING_TARGET } from "@/config/constants";
import { columnNames, isClosingStatus, resolveWaStatusCol, toDatetime } from "@/server/utils/helpers";

/** Exact columns V3 applies the junk filter to (only when present in rows). */
const JUNK_COLS = ["Mekari Tag", "Kategori"];

/**
 * Reified operational category predicates (REVISI FITUR — WA ADMIN, 2026-09).
 *
 * Source-of-truth columns (verified against the live 2052-row WA ADMIN REPORT:
 * K = "Mekari Tag", L = "Status \n\n(...)"). Matching is CASE-INSENSITIVE exact
 * after trimming whitespace — the live data stores Title Case ("Closing",
 * "Sales Progress", "Future Prospect"), so matching the brief's uppercase
 * literals case-sensitively would wrongly return 0.
 *
 *   TOTAL CLOSING      -> STATUS (col L) == "closing"
 *   SALES PROGRESS tbl -> STATUS (col L) == "sales progress"
 *   FUTURE PROSPECT tbl-> MEKARI TAG (col K) == "future prospect"
 */
const STATUS_SALES_PROGRESS = "sales progress";
const MEKARI_FUTURE_PROSPECT = "future prospect";

/** Case-insensitive exact match after trimming whitespace. */
function valueEquals(row: Row, col: string | undefined, value: string): boolean {
  return !!col && String(row[col] ?? "").trim().toLowerCase() === value;
}

/** Regex from JUNK_TAGS joined by "|", case-insensitive (V3 `"|".join(...)`). */
const JUNK_PATTERN = new RegExp(JUNK_TAGS.join("|"), "i");

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Apply the V3 junk filter. Drops any row where a present junk column's
 * lowercased string value matches the joined JUNK_TAGS pattern. When neither
 * "Mekari Tag" nor "Kategori" is present, returns `rows` unchanged (V3 no-op).
 */
export function junkFiltered(rows: Row[]): Row[] {
  const cols = columnNames(rows);
  const junkCols = JUNK_COLS.filter((c) => cols.includes(c));
  if (!junkCols.length) return rows;
  return rows.filter((r) => !junkCols.some((c) => JUNK_PATTERN.test(String(r[c] ?? ""))));
}

/** Resolve the status column as V3 did (last non-"Mekari" "Status" column).
 *  Delegates to the SHARED canonical `resolveWaStatusCol`. */
export function statusColumn(rows: Row[]): string | undefined {
  return resolveWaStatusCol(rows);
}

/**
 * Normalize the resolved status column in-place on copies: trim, and fill
 * null/"" with "Belum Terupdate" (V3 `fillna("").astype(str).str.strip()` then
 * `df.loc[df[col]=="", col] = "Belum Terupdate"`).
 */
export function normalizeStatuses(rows: Row[], col: string | undefined): Row[] {
  if (!col) return rows;
  return rows.map((r) => {
    const raw = r[col];
    const v = raw === null || raw === undefined ? "" : String(raw).trim();
    return { ...r, [col]: v === "" ? "Belum Terupdate" : v };
  });
}

export interface TrendPoint {
  /** "YYYY-MM" */ period: string;
  /** "MMM YYYY" (from YYYY-MM-01), V3 `strftime("%b %Y")`. */
  label: string;
  leads: number;
}

export function monthlyTrend(rows: Row[], now: Date = new Date()): TrendPoint[] {
  const year = now.getFullYear();
  const count = new Map<string, number>();
  for (const r of rows) {
    const d = toDatetime(r["Tanggal Masuk"]);
    if (!d || d.getFullYear() !== year) continue; // dropna + current-year filter
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    count.set(period, (count.get(period) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, leads]) => {
      const [y, mo] = period.split("-");
      return { period, label: `${MONTH_ABBR[Number(mo) - 1]} ${y}`, leads };
    });
}

export interface SourceStat {
  name: string;
  n: number;
}

/* ---------------------------------------------------------------------------
 * Monthly ("Bulan") filter — date field = `Tanggal Masuk` (D1).
 * ------------------------------------------------------------------------ */

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthOption {
  /** "YYYY-MM" (the selector value). */
  period: string;
  /** "MMMM YYYY" (e.g. "September 2026"). */
  label: string;
}

/** "YYYY-MM" from a parseable date, or null. */
function periodOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Format a "YYYY-MM" period as "MMMM YYYY". */
function periodLabel(period: string): string {
  const [y, mo] = period.split("-");
  return `${MONTH_FULL[Number(mo) - 1]} ${y}`;
}

/**
 * Distinct "YYYY-MM" periods present in `Tanggal Masuk`, ascending, labelled
 * "MMMM YYYY". Rows with unparseable dates are ignored. The UI prepends the
 * "Semua Bulan" option itself (this returns only real periods).
 */
export function monthOptions(rows: Row[]): MonthOption[] {
  const set = new Set<string>();
  for (const r of rows) {
    const d = toDatetime(r["Tanggal Masuk"]);
    if (!d) continue;
    set.add(periodOfDate(d));
  }
  return [...set].sort().map((period) => ({ period, label: periodLabel(period) }));
}

/** Keep only rows whose `Tanggal Masuk` falls in the given "YYYY-MM" period. */
export function filterByMonth(rows: Row[], period: string): Row[] {
  return rows.filter((r) => {
    const d = toDatetime(r["Tanggal Masuk"]);
    return d ? periodOfDate(d) === period : false;
  });
}

/* ---------------------------------------------------------------------------
 * Operational category tables (D2/D3/D5) — REVISI FITUR 2026-09.
 *
 * Source-of-truth columns (verified live: K = "Mekari Tag", L = status col).
 * Matching is CASE-INSENSITIVE exact after trim (live data is Title Case).
 *
 * - CLOSING (green)         = STATUS (col L) == "closing". Same predicate as
 *                             `closingCount`, so the table always equals the
 *                             Closing KPI. Measured over the (already
 *                             month-filtered) SOURCE rows, pre-junk — the
 *                             spreadsheet's column-L "Closing" count includes
 *                             rows whose Mekari Tag is a junk tag (e.g.
 *                             "Closed - Registered"), so post-junk would
 *                             undercount (70 → 2) and drift from the sheet.
 * - SALES PROGRESS (blue)   = STATUS (col L) == "sales progress"
 * - PENDING FORM - L1 (orange) = status "Pending Registration"
 * - FUTURE PROSPECT (pink)  = MEKARI TAG (col K) == "future prospect"
 * ------------------------------------------------------------------------ */

export type WaCategory = "closing" | "salesProgress" | "pendingForm" | "futureProspect";

/**
 * Exact (trimmed) live status-value -> operational category (D3) for the
 * status-driven tables ONLY. Grounded in the ACTUAL `Status` domain dumped
 * from the live WA ADMIN REPORT tab.
 *  - Pending Form - L1 (orange): Pending Registration
 *  - CLOSING, SALES PROGRESS and FUTURE PROSPECT are NOT status-category driven:
 *    closing = STATUS "closing" (measured pre-junk over source rows),
 *    sales progress = STATUS "sales progress", future prospect = MEKARI TAG
 *    "future prospect". "Lainnya"/"Withdraw" have no palette.
 */
export const STATUS_CATEGORY: Record<string, WaCategory> = {
  "Pending Registration": "pendingForm",
};

/** Rows in the Closing table = STATUS (last non-Mekari col) EXACTLY "closing"
 *  (case-insensitive after trim). Uses the SHARED `isClosingStatus`. */
export function closingRows(rows: Row[]): Row[] {
  const col = statusColumn(rows);
  return col ? rows.filter((r) => isClosingStatus(r[col])) : [];
}

/**
 * Rows in the SALES PROGRESS table = STATUS (col L) == "sales progress"
 * (case-insensitive exact after trim), over the supplied rows — the derivation
 * passes month-filtered SOURCE rows, pre-junk, so the count matches the active
 * period/filter. No Mekari-tag proxy, no substring.
 */
export function salesProgressRows(rows: Row[]): Row[] {
  const col = statusColumn(rows);
  return col ? rows.filter((r) => valueEquals(r, col, STATUS_SALES_PROGRESS)) : [];
}

/** Rows in the FUTURE PROSPECT table = MEKARI TAG (col K) == "future prospect". */
export function futureProspectRows(rows: Row[]): Row[] {
  return rows.filter((r) => valueEquals(r, "Mekari Tag", MEKARI_FUTURE_PROSPECT));
}

/** Rows mapping to a status-driven category, from prepared (post-junk) rows. */
export function categoryRows(rows: Row[], col: string | undefined, key: WaCategory): Row[] {
  if (!col || key === "closing" || key === "salesProgress" || key === "futureProspect") return [];
  return rows.filter((r) => STATUS_CATEGORY[String(r[col] ?? "").trim()] === key);
}

/**
 * Columns for the four operational tables (present in the data), with the
 * resolved status column last. Order: Tanggal Masuk, Nama, No Hp, Asal,
 * Sumber, PIC, Keterangan Admin, <status>.
 */
export function operationalColumns(rows: Row[], col: string | undefined): string[] {
  const present = columnNames(rows);
  const wanted = [
    "Tanggal Masuk", "Nama", "No Hp", "Asal", "Sumber (Ads/Organik/Sales)",
    "PIC", "Keterangan Admin", col || "",
  ];
  return wanted.filter((c) => c && present.includes(c));
}

/* ---------------------------------------------------------------------------
 * "Tag Asal" treemap (D4) — grouped by the actual `Asal` column values.
 * ------------------------------------------------------------------------ */

export interface TreemapItem {
  name: string;
  n: number;
}

export interface TreemapRect extends TreemapItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Value counts of the "Tag Asal" (`Asal`) column.
 *
 * Latest-audit rule: rows with an EMPTY / null / blank / literal-"nan" Asal are
 * EXCLUDED entirely (never surfaced as a block). The ACTUAL source value is
 * kept verbatim as the label — NO artificial category ("Onbekend", "Andere",
 * "Unknown", "Other") is ever created, and NO grouping cap aggregates
 * categories together. Every distinct valid `Asal` value is shown, so
 * categories with different values stay separated. Count-descending.
 */
export function asalBreakdown(rows: Row[]): TreemapItem[] {
  const tally = new Map<string, number>();
  for (const r of rows) {
    const v = String(r["Asal"] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue; // exclude empty/null/nan
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
}

/**
 * Recursive balanced treemap layout (dependency-free). Slices the current area
 * along its LONG axis, splitting the item list at the pivot closest to half the
 * total area, so sibling blocks stay near-square and readable. Returns rects in
 * item order with absolute coordinates in a W×H viewBox.
 */
export function buildTreemap(items: TreemapItem[], W: number, H: number): TreemapRect[] {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.n, 0);
  if (!total) return [];
  const out: TreemapRect[] = [];

  function split(list: TreemapItem[], x: number, y: number, w: number, h: number): void {
    if (list.length === 0) return;
    if (list.length === 1) {
      const it = list[0];
      out.push({ ...it, x, y, w, h });
      return;
    }
    const sum = list.reduce((s, i) => s + i.n, 0);
    // Pivot so each partition holds ~half the area (area ∝ n within `sum`).
    let acc = 0;
    let pivot = 0;
    for (let i = 0; i < list.length; i++) {
      acc += list[i].n;
      if (acc >= sum / 2) {
        pivot = i + 1;
        break;
      }
    }
    if (pivot === 0) pivot = 1;
    if (pivot === list.length) pivot = list.length - 1;
    const leftSum = list.slice(0, pivot).reduce((s, i) => s + i.n, 0);
    const frac = leftSum / sum;
    if (w >= h) {
      split(list.slice(0, pivot), x, y, w * frac, h);
      split(list.slice(pivot), x + w * frac, y, w * (1 - frac), h);
    } else {
      split(list.slice(0, pivot), x, y, w, h * frac);
      split(list.slice(pivot), x, y + h * frac, w, h * (1 - frac));
    }
  }

  split(items, 0, 0, W, H);
  return out;
}

/** Value counts excluding empty/null and literal "nan", count-descending. */
function valueCountNonEmpty(rows: Row[], col: string | undefined): SourceStat[] {
  if (!col) return [];
  const count = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue;
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
}

export interface SourceBreakdown {
  /** First column containing "Sumber" (undefined => section is skipped). */
  col: string | undefined;
  sources: SourceStat[];
}

export function sourceBreakdown(rows: Row[]): SourceBreakdown {
  const col = columnNames(rows).find((c) => c.includes("Sumber"));
  if (!col) return { col: undefined, sources: [] };
  const count = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue; // exclude empty + "nan"
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  const sources = [...count.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
  return { col, sources };
}

/**
 * Pesan Total Per PIC — group by the actual `PIC` column values, count each,
 * exclude empty/null PIC (undefined → skipped), sorted count-descending.
 */
export function picBreakdown(rows: Row[]): SourceStat[] {
  return valueCountNonEmpty(rows, "PIC");
}

/**
 * Chart "Mekari Tag" — group by the actual `Mekari Tag` column values, count
 * each present tag (empty/null/NaN excluded), sorted count-descending.
 */
export function mekariTagBreakdown(rows: Row[]): SourceStat[] {
  return valueCountNonEmpty(rows, "Mekari Tag");
}

/**
 * Pembagian Intensi Pesan — group by the actual `Kategori` column values
 * (live header is suffixed: "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)",
 * so resolve by keyword, excluding the "Mekari" status column). Empty/null/NaN
 * excluded. Sorted count-descending.
 */
export function kategoriBreakdown(rows: Row[]): SourceStat[] {
  const col = columnNames(rows).find(
    (c) => c.toLowerCase().includes("kategori") && !c.toLowerCase().includes("mekari"),
  );
  return valueCountNonEmpty(rows, col);
}

/**
 * Closing = STATUS (col L) EXACTLY equals "closing" (case-insensitive, trimmed).
 *
 * Decision (confirmed): measured over ALL source rows BEFORE the junk filter,
 * because JUNK_TAGS contains "closed - registered" etc. and thus strips the very
 * rows this headline metric must count (live: closing drops 70 → 2 post-junk).
 * No Mekari-tag proxy, no substring, no double counting. Safe on empty (0).
 */
export function closingCount(rows: Row[]): number {
  const col = statusColumn(rows);
  if (!col) return 0;
  let n = 0;
  for (const r of rows) if (isClosingStatus(r[col])) n++;
  return n;
}

/**
 * Unique status values (excluding "" and "nan") plus the "Semua status" label.
 * V3 `selectbox(["Semua status"] + sorted(options))`.
 */
export function statusOptions(rows: Row[], col: string | undefined): string[] {
  if (!col) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue;
    set.add(v);
  }
  return [...set].sort();
}

/**
 * Detail-status table columns present in the data, in V3 order + the latest
 * audit addition of the `Mekari Tag` column (it is useful for reading lead
 * condition). Status column is kept last.
 */
export function detailColumns(rows: Row[], col: string | undefined): string[] {
  const wanted = ["Tanggal Masuk", "Nama", "No Hp", "Asal", "Sumber", "Mekari Tag", col || ""];
  const present = columnNames(rows);
  return wanted.filter((c) => c && present.includes(c));
}

export interface WaAdminStats {
  /** Junk-filtered + status-normalized rows (what charts/table/export use). */
  rows: Row[];
  /** Resolved status column (for rendering), or undefined when absent. */
  statusCol: string | undefined;
  total: number;
  closing: number;
  /** "12.3%" or "—" when no leads. */
  conversionLabel: string;
  /** "5/45" V3 `closing/CLOSING_TARGET`. */
  closingTargetLabel: string;
  /** Distinct "YYYY-MM" periods present in `Tanggal Masuk` (for the filter). */
  months: MonthOption[];
  /** Rows for the CLOSING (green) palette — STATUS == "closing". */
  closingRows: Row[];
  /** Rows for the SALES PROGRESS (blue) palette. */
  salesProgress: Row[];
  /** Rows for the PENDING FORM - L1 (orange) palette. */
  pendingForm: Row[];
  /** Rows for the FUTURE PROSPECT (pink) palette. */
  futureProspect: Row[];
  /** Columns for the four operational tables. */
  operationalCols: string[];
  /** "Tag Asal" treemap blocks (grouped by `Asal`, empty → Onbekend). */
  asalItems: TreemapItem[];
  /** Leads-per-month line series (current year only). */
  trend: TrendPoint[];
  /** Status distribution (donut + breakdown), count-descending. */
  statusDist: SourceStat[];
  /** Asal-prospek source breakdown. */
  sources: SourceBreakdown;
  /** Pesan Total Per PIC (grouped by actual PIC values). */
  picDist: SourceStat[];
  /** Chart "Mekari Tag" (grouped by actual Mekari Tag values). */
  mekariDist: SourceStat[];
  /** Pembagian Intensi Pesan (grouped by actual Kategori values). */
  kategoriDist: SourceStat[];
  /** The resolved Kategori column name (for the chart label), if any. */
  kategoriCol: string | undefined;
  /** Unique statuses (sorted) for the Detail Status selector. */
  options: string[];
  /** Columns for the detail-status DataTable. */
  detailCols: string[];
}

/**
 * All derived state for the WA Admin dashboard. Junk filter runs FIRST (V3
 * ordering), then status normalization, then every KPI/viz is computed from the
 * prepared rows. Closing is the exception: it is measured on the ORIGINAL rows
 * (pre-junk) by exact `STATUS == "closing"` match, per the confirmed definition.
 * `now` is injectable so tests can pin the current year; `month` ("YYYY-MM" or
 * undefined = Semua Bulan) filters `Tanggal Masuk` BEFORE every derivation, so
 * KPIs, charts, treemap, operational tables and the detail table all react to
 * it. `months` (for the selector) is computed from the FULL unfiltered rows so
 * the user can switch back to any month.
 */
export function deriveWaAdminStats(rows: Row[], now: Date = new Date(), month?: string): WaAdminStats {
  const sourceRows = month ? filterByMonth(rows, month) : rows;
  const prepared = normalizeStatuses(junkFiltered(sourceRows), statusColumn(junkFiltered(sourceRows)));
  const col = statusColumn(prepared);
  const total = prepared.length;
  const closing = closingCount(sourceRows); // over month-filtered ALL source rows (pre-junk)
  const closingSet = closingRows(sourceRows);
  const conversionLabel = total ? `${((closing / total) * 100).toFixed(1)}%` : "—";
  return {
    rows: prepared,
    statusCol: col,
    total,
    closing,
    conversionLabel,
    closingTargetLabel: `${closing}/${CLOSING_TARGET}`,
    months: monthOptions(rows),
    closingRows: closingSet,
    // Sales Progress = STATUS (col L) == "sales progress" (REVISI 2026-09),
    // over the SAME month-filtered source rows the closing table uses.
    salesProgress: salesProgressRows(sourceRows),
    pendingForm: categoryRows(prepared, col, "pendingForm"),
    // Future Prospect = MEKARI TAG (col K) == "future prospect", over the
    // source rows (pre-junk, matching the spreadsheet's column-K count).
    futureProspect: futureProspectRows(sourceRows),
    operationalCols: operationalColumns(prepared, col),
    asalItems: asalBreakdown(prepared),
    trend: monthlyTrend(prepared, now),
    statusDist: valueCountNonEmpty(prepared, col),
    sources: sourceBreakdown(prepared),
    picDist: picBreakdown(prepared),
    mekariDist: mekariTagBreakdown(prepared),
    kategoriDist: kategoriBreakdown(prepared),
    kategoriCol: columnNames(prepared).find(
      (c) => c.toLowerCase().includes("kategori") && !c.toLowerCase().includes("mekari"),
    ),
    options: statusOptions(prepared, col),
    detailCols: detailColumns(prepared, col),
  };
}

/* ---------------------------------------------------------------------------
 * Client-side CSV export (V3 `df.to_csv(index=False).encode("utf-8-sig")`).
 * ------------------------------------------------------------------------ */

/** Escape a field per RFC-4180 (quote only when needed, double inner quotes). */
function escField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[\",\\n\\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize the whole prepared set to CSV text with a utf-8-sig BOM prefix. */
export function toCsv(rows: Row[]): string {
  if (!rows.length) return "\uFEFF";
  const cols = columnNames(rows);
  const header = cols.map(escField).join(",");
  const body = rows.map((r) => cols.map((c) => escField(r[c])).join(","));
  return `\uFEFF${[header, ...body].join("\r\n")}`;
}

/** V3 filename `wa_admin_<YYYYMMDD>.csv`. */
export function csvFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `wa_admin_${y}${m}${d}.csv`;
}