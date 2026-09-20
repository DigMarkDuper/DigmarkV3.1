/**
 * Website workspace — pure derivations (port of pages/3_Website.py, read-only).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts the V3
 * page computed, and never touches Sheets. All inputs are the normalized rows
 * from GET /api/tables/website. Mirrors 3_Website.py line-for-line:
 *   - month filter from the deadline-month label (V3 `Bulan-Deadline`)
 *   - Total / Live / Pending from `Status Post` ∈ DONE_KEYWORDS
 *   - per-pillar remaining counts via the exact V3 pillar regex categories
 *   - audit-pending grouping by `Content Pillar` (sorted)
 */
import type { Row } from "@/server/adapter/source";
import { DONE_KEYWORDS } from "@/config/constants";
import { monthLabel } from "@/server/utils/helpers";

/** V3 reveals a single derived month label per row: "Month YYYY". */
export function deadlineMonth(row: Row): string {
  return monthLabel(row["Deadline"], "%B %Y");
}

/** Distinct derivable deadline-month labels, in first-appearance order. */
export function websiteMonths(rows: Row[]): string[] {
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

/** V3: done = Status Post upper/strip ∈ DONE_KEYWORDS (NaN/absent -> false). */
export function isRowDone(row: Row): boolean {
  const s = String(row["Status Post"] ?? "").toUpperCase().trim();
  return DONE_KEYWORDS.includes(s);
}

/** Case-insensitive substring (V3 `str.contains(x, case=False)`, literal). */
function includesIc(haystack: string, needle: string): boolean {
  return haystack.toUpperCase().includes(needle.toUpperCase());
}

/** Case-insensitive regex (V3 `str.contains(regex, case=False, regex=True)`). */
function regexIc(haystack: string, pattern: string): boolean {
  return new RegExp(pattern, "i").test(haystack);
}

/** Per-pillar "remaining" (not-done) matcher — V3 semantics, same order. */
export interface PillarStat {
  key: string;
  label: string;
  icon: string;
  /** Remaining (not-done) count in this pillar category. */
  count: number;
}

export function pillarStats(rows: Row[]): PillarStat[] {
  const pending = rows.filter((r) => !isRowDone(r));
  const c = (match: (pillar: string) => boolean) =>
    pending.filter((r) => match(String(r["Content Pillar"] ?? ""))).length;
  return [
    { key: "artikel",  label: "Artikel",  icon: "📄", count: c((p) => includesIc(p, "Article")) },
    { key: "news",     label: "News",     icon: "📰", count: c((p) => regexIc(p, "News|Berita")) },
    { key: "galeri",   label: "Galeri",   icon: "🖼️", count: c((p) => regexIc(p, "Galery|Gallery|Album")) },
    { key: "linkedin", label: "LinkedIn", icon: "🔗", count: c((p) => includesIc(p, "Linkedin")) },
  ];
}

/** Remaining rows grouped by Content Pillar, pillars sorted ascending. */
export interface PillarGroup {
  pillar: string;
  rows: Row[];
}

export function pendingByPillar(rows: Row[]): PillarGroup[] {
  const pending = rows.filter((r) => !isRowDone(r));
  const by: Record<string, Row[]> = {};
  for (const r of pending) {
    const pillar = String(r["Content Pillar"] ?? "");
    (by[pillar] ||= []).push(r);
  }
  return Object.keys(by).sort().map((key) => ({ pillar: key, rows: by[key] }));
}

export interface WebsiteStats {
  /** Distinct derivable deadline-month labels (empty => no filtering). */
  months: string[];
  /** Rows after the month filter (or all rows when no month derivable). */
  filtered: Row[];
  total: number;
  live: number;
  pending: number;
  pillars: PillarStat[];
  /** Remaining rows grouped by pillar for the Audit Pending tab. */
  pendingGroups: PillarGroup[];
}

/**
 * Derived counts for the Website dashboard.
 * `selected` = set of month labels to keep. Defaults to ALL derivable months
 * (mirroring V3 `st.multiselect(default=months)`), and a row whose deadline
 * month cannot be derived is dropped exactly as V3 drops a NaN Bulan-Deadline
 * outside the non-null `months` list.
 * V3 parity: filtering is SKIPPED entirely when no month can be derived
 * (months empty) — the `if "Bulan-Deadline" in df.columns else []` branch.
 */
export function deriveWebsiteStats(rows: Row[], selected?: Set<string> | null): WebsiteStats {
  const months = websiteMonths(rows);
  const filterActive = months.length > 0;
  // null/undefined -> default-all; otherwise the caller's multi-select set.
  const pick = filterActive ? (selected ?? new Set(months)) : null;
  const filtered = pick
    ? rows.filter((r) => {
        const m = deadlineMonth(r);
        return m && pick.has(m);
      })
    : rows;
  const done = filtered.filter(isRowDone);
  const live = done.length;
  return {
    months,
    filtered,
    total: filtered.length,
    live,
    pending: filtered.length - live,
    pillars: pillarStats(filtered),
    pendingGroups: pendingByPillar(filtered),
  };
}