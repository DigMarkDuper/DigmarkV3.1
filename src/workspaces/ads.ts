/**
 * Ads workspace — pure derivations + Mekari summary-row builder
 * (port of pages/7_Ads.py).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts V3 computed
 * and NEVER touches Sheets directly. Per-platform KPIs operate on the normalized
 * rows from GET /api/tables/*; the ROI scalars come from the server route
 * GET /api/ads/metrics (which reuses the pure roi() in src/server/metrics).
 *
 * Mirrors 7_Ads.py line-for-line:
 *   - spend = cleanIdr sum over the first column whose lowercase name contains
 *     a cost key (cost/spent/spend — order per platform)
 *   - leads = WA rows whose source column (first col containing "Sumber")
 *     contains source_pat (case-insensitive); closing = those with status col
 *     containing "Closing" (status col = first col with "status", minus "mekari")
 *   - CPL = rupiah(spend/leads) or "—" when no leads
 *   - Mekari total interaksi = row count; biaya col = first "biaya" else "cost";
 *     total biaya = cleanIdr sum; biaya/interaksi
 *   - Mekari special import: read file -> drop trailing "Total" rows ->
 *     compute the summary row from headers (deducted balance / broadcast
 *     amount / credit / manual) -> append ONE row via POST /api/tables/mekari.
 */
import * as XLSX from "xlsx";
import type { Row } from "@/server/adapter/source";
import { cleanIdr, columnNames, isClosingStatus, resolveWaStatusCol } from "@/server/utils/helpers";
import { parseCSV } from "@/lib/csv";

// --- Per-platform tab configuration (V3 _ads_tab call sites) ---------------

export interface AdsTabConfig {
  key: string;
  title: string;
  costKeys: string[];
  sourcePat: string;
}

/** TikTok: cost keys (cost, spent, spend), WA source pattern "Tiktok". */
export const TIKTOK_TAB: AdsTabConfig = {
  key: "ads_tiktok",
  title: "TikTok",
  costKeys: ["cost", "spent", "spend"],
  sourcePat: "tiktok",
};

/** Meta/IG: cost keys (spent, spend, cost), WA source "Instagram|Facebook|IG|FB". */
export const META_TAB: AdsTabConfig = {
  key: "ads_meta",
  title: "Meta/IG",
  costKeys: ["spent", "spend", "cost"],
  sourcePat: "instagram|facebook|ig|fb",
};

// --- Spend / leads / closing / CPL (V3 _spend_of + _ads_tab) ----------------

/** Sum cleanIdr over the first column whose lowercase name contains a cost key. */
export function spendOf(rows: Row[], costKeys: string[]): number {
  if (!rows || !rows.length) return 0;
  for (const c of columnNames(rows)) {
    const lc = c.toLowerCase();
    if (costKeys.some((k) => lc.includes(k))) {
      return rows.reduce((acc, r) => acc + cleanIdr(r[c]), 0);
    }
  }
  return 0;
}

/** V3 src_col: first WA column whose name contains "Sumber". */
export function waSourceCol(wa: Row[]): string | undefined {
  for (const c of columnNames(wa)) {
    if (c.includes("Sumber")) return c;
  }
  return undefined;
}

/** V3 status_col → SHARED canonical resolver: last col with "status" (minus
 *  "mekari"). Previously matched the FIRST such column; converging to the
 *  canonical LAST-match is a no-op on live wa_admin data (only one column
 *  matches) but removes drift from metrics/waAdmin/write. */
export function waStatusCol(wa: Row[]): string | undefined {
  return resolveWaStatusCol(wa);
}

/** Rupiah with Rp + dot grouping (V3 ui.components.rupiah). */
function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

export interface AdsTabResult {
  spend: number;
  leads: number;
  closing: number;
  /** CPL as rupiah, or "—" when there are no leads. */
  cpl: string;
}

/**
 * V3 _ads_tab: spend from the ad rows + leads/closing counted on WA rows whose
 * source matches `sourcePat`. `sourcePat` is the lowercased V3 pattern.
 */
export function adsTab(
  rows: Row[],
  wa: Row[],
  costKeys: string[],
  sourcePat: string,
): AdsTabResult {
  const spend = spendOf(rows, costKeys);
  let leads = 0;
  let closing = 0;
  if (wa && wa.length) {
    const src = waSourceCol(wa);
    const status = waStatusCol(wa);
    if (src) {
      // V3 uses pandas str.contains(source_pat, case=False) — a REGEX alternation
      // (e.g. "Instagram|Facebook|IG|FB"), matched case-insensitively.
      const re = new RegExp(sourcePat, "i");
      for (const r of wa) {
        if (re.test(String(r[src]))) {
          leads++;
          // Closing = EXACT "closing" (shared isClosingStatus) over the
          // resolved (last-non-Mekari) status col. Behavior improvement vs old
          // substring-over-first-col: aligns ads closing to /wa-admin.
          if (status && isClosingStatus(r[status])) {
            closing++;
          }
        }
      }
    }
  }
  const cpl = leads ? rupiah(spend / leads) : "—";
  return { spend, leads, closing, cpl };
}

// --- Mekari stats (V3 _mekari_tab KPI section) ------------------------------

export interface MekariStats {
  total: number;
  biaya: number;
  biayaPer: string;
  /** Resolved biaya column, or undefined when none found. */
  biayaCol: string | undefined;
}

export function mekariStats(rows: Row[]): MekariStats {
  const total = rows.length;
  const names = columnNames(rows);
  let biayaCol = names.find((c) => c.toLowerCase().includes("biaya"));
  if (biayaCol === undefined) {
    biayaCol = names.find((c) => c.toLowerCase() === "cost");
  }
  let biaya = 0;
  if (biayaCol) {
    for (const r of rows) biaya += cleanIdr(r[biayaCol]);
  }
  const biayaPer = total ? rupiah(biaya / total) : "—";
  return { total, biaya, biayaPer, biayaCol };
}

// --- Mekari special import (client-side transform -> append one row) --------

/**
 * V3's file pre-processing: drop rows whose FIRST column (lowercased) starts
 * with "total" (ad/WA-log exports usually end with a summary "Total" row that
 * must not be counted as an interaction or biaya line).
 */
export function dropTotalRows(aoa: unknown[][]): { data: unknown[][]; dropped: number } {
  if (aoa.length < 2) return { data: aoa, dropped: 0 };
  const header = aoa[0];
  let dropped = 0;
  const data: unknown[][] = [header];
  for (let r = 1; r < aoa.length; r++) {
    const first = aoa[r][0];
    if (first !== undefined && String(first).toLowerCase().startsWith("total")) {
      dropped++;
      continue;
    }
    data.push(aoa[r]);
  }
  return { data, dropped };
}

/** Today as "YYYY-MM-DD HH:MM" (V3 `datetime.now().strftime("%Y-%m-%d %H:%M")`). */
export function todayStamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

export interface MekariImportResult {
  /** Schema-keyed summary row for POST /api/tables/mekari. */
  row: Record<string, unknown>;
  jenis: string;
  /** Warning when the "biaya" column is unrecognised (V3 aborts). */
  warning: string | undefined;
  dropped: number;
}

/**
 * V3 _mekari_tab special import: from the parsed file (array-of-arrays, row 0 =
 * headers) compute ONE summary row depending on headers.
 */
export function buildMekariRow(aoa: unknown[][], now: Date = new Date()): MekariImportResult {
  const { data, dropped } = dropTotalRows(aoa);
  const headers = data[0].map((h) => String(h));
  const body = data.slice(1);

  const lower: Record<string, number> = {};
  headers.forEach((h, i) => {
    const l = h.toLowerCase();
    if (lower[l] === undefined) lower[l] = i;
  });

  // Sum a column by index via cleanIdr (V3 sums raw numerics; cleanIdr is a
  // superset that handles "Rp1.234.567"-style strings too).
  const sumCol = (idx: number | undefined): number =>
    idx === undefined ? 0 : body.reduce((acc, r) => acc + cleanIdr(r[idx]), 0);

  let jenis: string;
  let totalBiaya: number;
  let totalMsg: number;
  let warning: string | undefined;

  if (lower["deducted balance"] !== undefined || lower["broadcast amount"] !== undefined) {
    jenis = "WA Campaign Logs";
    totalBiaya = sumCol(lower["deducted balance"]);
    if (lower["broadcast amount"] !== undefined) {
      totalMsg = Math.round(sumCol(lower["broadcast amount"]));
    } else {
      totalMsg = body.length;
    }
  } else if (lower["credit"] !== undefined) {
    jenis = "WA Billing Logs";
    totalBiaya = sumCol(lower["credit"]);
    totalMsg = body.length;
  } else {
    const biayaCol = headers.find((c) => c.toLowerCase().includes("biaya"));
    if (biayaCol === undefined) {
      return {
        row: { __noop: true } as Record<string, unknown>,
        jenis: "Manual",
        warning: "Kolom biaya tidak dikenali dalam file ini.",
        dropped,
      };
    }
    jenis = "Manual";
    totalBiaya = sumCol(headers.indexOf(biayaCol));
    totalMsg = body.length;
  }

  const biayaStr = `Rp${Math.round(totalBiaya).toLocaleString("id-ID")}`;
  const row: Record<string, unknown> = {
    "Tanggal Input": todayStamp(now),
    Periode: "periode",
    "Jenis Laporan": jenis,
    "Total Interaksi": totalMsg,
    "Total Biaya (Rp)": biayaStr,
  };
  return { row, jenis, warning, dropped };
}

// --- Client-side file parsing (Mekari reads the raw file in the browser) ----

function decodeUtf8(buf: ArrayBuffer): string {
  const TD = (globalThis as { TextDecoder?: new (enc?: string) => { decode(b: ArrayBuffer): string } }).TextDecoder;
  if (TD) return new TD("utf-8").decode(buf);
  return String.fromCharCode(...new Uint8Array(buf));
}

/**
 * Read a CSV/XLSX File into an array-of-arrays (row 0 = headers) in the
 * browser, mirroring V3 pd.read_csv / pd.read_excel. The `xlsx` (SheetJS) lib
 * is browser-compatible and already a dependency for the server import path.
 */
export function parseFileToAoa(file: File): Promise<unknown[][]> {
  const lower = file.name.toLowerCase();
  return file.arrayBuffer().then((buf) => {
    if (lower.endsWith(".csv")) {
      return parseCSV(decodeUtf8(buf));
    }
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: "array" });
    } catch {
      wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    }
    const sheetName = wb.SheetNames[0];
    if (!sheetName || !wb.Sheets[sheetName]) {
      return []; // unreadable workbook -> calculator surfaces "File tidak dapat dibaca."
    }
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: "",
    });
  });
}