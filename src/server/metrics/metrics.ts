/**
 * Business metrics — pure computation on rows-of-records.
 * TypeScript port of `services/metrics.py`. Semantics preserved exactly.
 * Row model: `Record<string, unknown>[]` (an array of objects), which is the
 * TS analogue of a pandas DataFrame built from gspread get_all_records().
 */
import { BIAYA_PELATIHAN, DONE_KEYWORDS } from "@/config/constants";
import { cleanIdr, columnNames, isClosingStatus, resolveWaStatusCol, toDatetime } from "@/server/utils/helpers";

export type Row = Record<string, unknown>;
export type RowTable = Row[];

/**
 * Resolve the WA status column. Delegates to the SHARED canonical resolver
 * (`resolveWaStatusCol` in helpers.ts) so this module, waAdmin.ts, ads.ts and
 * write.ts all agree on the same last-non-Mekari-"status" column. Kept as a
 * thin alias for backward-compat with existing importers/tests.
 */
export function statusCol(rows: RowTable): string | undefined {
  return resolveWaStatusCol(rows);
}

/**
 * First column whose lowercase name contains any keyword.
 * Port of `_find_col`.
 */
export function findCol(rows: RowTable, keywords: string[]): string | undefined {
  for (const c of columnNames(rows)) {
    const lc = c.toLowerCase();
    if (keywords.some((k) => lc.includes(k))) {
      return c;
    }
  }
  return undefined;
}

export interface FunnelResult {
  leads: number;
  closing: number;
  conversion: number;
}

/** Closing funnel from the WA Admin sheet. Port of `funnel`.
 *  Closing uses the SHARED exact `isClosingStatus` predicate (NOT substring),
 *  over the rows the CALLER hands in. Callers that must surface the /wa-admin
 *  "pre-junk exact" closing pass the SOURCE (pre-junk) rows; callers scoping
 *  to a post-junk funnel pass already-filtered rows. This module stays pure. */
export function funnel(wa: RowTable): FunnelResult {
  const out: FunnelResult = { leads: 0, closing: 0, conversion: 0 };
  if (!wa || !wa.length) {
    return out;
  }
  out.leads = wa.length;
  const col = statusCol(wa);
  if (col) {
    let closing = 0;
    for (const row of wa) {
      if (isClosingStatus(row[col])) {
        closing++;
      }
    }
    out.closing = closing;
    out.conversion = out.leads ? (closing / out.leads) * 100 : 0;
  }
  return out;
}

export interface MonthlySnapshotResult {
  leads: number;
  closing: number;
  omzet: number;
  conversion: number;
}

/** Leads/closing for the current month, plus omzet estimate. Port of `monthly_snapshot`. */
export function monthlySnapshot(wa: RowTable, now: Date = new Date()): MonthlySnapshotResult {
  const out: MonthlySnapshotResult = { leads: 0, closing: 0, omzet: 0, conversion: 0 };
  if (!wa || !wa.length || !columnNames(wa).includes("Tanggal Masuk")) {
    return out;
  }
  const cur: RowTable = [];
  for (const row of wa) {
    const d = toDatetime(row["Tanggal Masuk"]);
    if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      cur.push(row);
    }
  }
  out.leads = cur.length;
  const col = statusCol(cur);
  if (col) {
    let closing = 0;
    for (const row of cur) {
      if (isClosingStatus(row[col])) {
        closing++;
      }
    }
    out.closing = closing;
  }
  out.omzet = out.closing * BIAYA_PELATIHAN;
  out.conversion = out.leads ? (out.closing / out.leads) * 100 : 0;
  return out;
}

export interface PendingCountsResult {
  sosmed: number;
  website: number;
}

/**
 * Due-but-not-done tasks this month for social & website.
 * Port of `pending_counts`. NOTE: pandas-based date filtering is replicated;
 * callers may not have wired this use-case yet (kept for parity).
 */
export function pendingCounts(
  sosmed: RowTable | null,
  website: RowTable | null,
  now: Date = new Date(),
): PendingCountsResult {
  const out: PendingCountsResult = { sosmed: 0, website: 0 };

  if (sosmed && sosmed.length && columnNames(sosmed).includes("PROSES")) {
    const cols = columnNames(sosmed);
    const dateCol = ["_date", "Tanggal Posting", "Tanggal Deadline", "Deadline"].find((c) => cols.includes(c));
    if (dateCol) {
      let count = 0;
      for (const row of sosmed) {
        const done = String(row["PROSES"]).toUpperCase() === "DONE";
        const d = toDatetime(row[dateCol]);
        if (!done && d && d.getMonth() === now.getMonth()) {
          count++;
        }
      }
      out.sosmed = count;
    }
  }

  if (website && website.length) {
    const cols = columnNames(website);
    const dateCol = ["Deadline", "Tanggal Deadline"].find((c) => cols.includes(c));
    if (dateCol) {
      let count = 0;
      for (const row of website) {
        let done = false;
        if (cols.includes("Status Post")) {
          done = DONE_KEYWORDS.includes(String(row["Status Post"]).toUpperCase().trim());
        }
        const d = toDatetime(row[dateCol]);
        if (!done && d && d.getMonth() === now.getMonth()) {
          count++;
        }
      }
      out.website = count;
    }
  }
  return out;
}

export interface RoiResult {
  spend: number;
  leads: number;
  closing: number;
  cac: number;
  roas: number;
  omzet: number;
}

/** Global spend / leads / closing / CAC / ROAS. Port of `roi`. */
export function roi(wa: RowTable, tiktok: RowTable, meta: RowTable, mekari: RowTable): RoiResult {
  const out: RoiResult = { spend: 0, leads: 0, closing: 0, cac: 0, roas: 0, omzet: 0 };

  let leads = 0;
  let closing = 0;
  if (wa && wa.length) {
    leads = wa.length;
    const col = statusCol(wa);
    if (col) {
      for (const row of wa) {
        if (isClosingStatus(row[col])) {
          closing++;
        }
      }
    }
  }

  let spend = 0;
  for (const df of [tiktok, meta]) {
    if (df && df.length) {
      const costCol = findCol(df, ["cost", "spent", "spend"]);
      if (costCol) {
        for (const row of df) {
          spend += cleanIdr(row[costCol]);
        }
      }
    }
  }
  if (mekari && mekari.length) {
    const biaya = findCol(mekari, ["biaya", "cost"]);
    if (biaya) {
      for (const row of mekari) {
        spend += cleanIdr(row[biaya]);
      }
    }
  }

  const omzet = closing * BIAYA_PELATIHAN;
  out.spend = spend;
  out.leads = leads;
  out.closing = closing;
  out.cac = closing ? spend / closing : 0;
  out.roas = spend ? omzet / spend : 0;
  out.omzet = omzet;
  return out;
}