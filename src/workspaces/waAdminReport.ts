/**
 * Monthly WA Admin Report — PURE dataset builder (P2).
 *
 * Given the WA Admin rows, the registration rows and a selected period, it
 * builds every number/table/chart section (A Chat Masuk, B Closing, C
 * Pendaftar, D Asal Chat, E insights) so the export UI renders a consistent
 * monthly report. No I/O, no React — unit-testable.
 *
 * Period semantics:
 *   - WA Admin rows are placed in a period via their date column `Tanggal Masuk`.
 *   - Registration rows are placed in a period via their `Timestamp` column.
 * Both use the SAME resolved period (from/to bounds) so the numbers agree.
 */
import type { Row } from "@/server/adapter/source";
import { toDatetime, isClosingStatus, resolveWaStatusCol } from "@/server/utils/helpers";
import { timestampMs, buildNeedsAttention } from "@/workspaces/registration";
import { mekariTagBreakdown, picBreakdown, sourceBreakdown } from "@/workspaces/waAdmin";

/** Exact live column headers (verified against the schemas). */
export const WA_DATE_COL = "Tanggal Masuk";
export const WA_MEKARI_COL = "Mekari Tag";
export const REG_TS_COL = "Timestamp";

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabelOf(y: number, m: number): string {
  return `${MONTH_FULL[m - 1]} ${y}`;
}

export interface ExpandedPeriod {
  /** Inclusive start. */
  from: Date;
  /** Exclusive end. */
  to: Date;
  /** Human label (e.g. "September 2026"). */
  label: string;
}

/**
 * Resolve a period selector to inclusive/exclusive Date bounds + a label.
 * Supports:
 *   - "CURRENT"              -> `now`'s month
 *   - "PREVIOUS"             -> the month before `now`'s
 *   - "YYYY-MM"              -> that specific month
 *   - "YYYY-MM-DD..YYYY-MM-DD" -> a custom inclusive date range
 * Unrecognised / malformed selectors fall back to CURRENT.
 */
export function expandPeriod(sel: string, now: Date = new Date()): ExpandedPeriod {
  const s = String(sel ?? "").trim() || "CURRENT";

  // Custom inclusive date range "YYYY-MM-DD..YYYY-MM-DD".
  const range = s.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (range) {
    const a = new Date(`${range[1]}T00:00:00`);
    const b = new Date(`${range[2]}T00:00:00`);
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a <= b) {
      const to = new Date(b.getTime() + 86_400_000);
      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      return { from: a, to, label: `${fmt(a)} – ${fmt(b)}` };
    }
  }

  let y = now.getFullYear();
  let m = now.getMonth() + 1;

  if (s === "PREVIOUS") {
    const d = new Date(y, m - 2, 1); // month before now
    y = d.getFullYear();
    m = d.getMonth() + 1;
  } else {
    const month = s.match(/^(\d{4})-(\d{1,2})$/);
    if (month) {
      const yy = Number(month[1]);
      const mm = Number(month[2]);
      if (yy >= 2000 && yy <= 2100 && mm >= 1 && mm <= 12) {
        y = yy;
        m = mm;
      }
    }
    // "CURRENT" (and anything unrecognised) -> now's month.
  }

  return {
    from: new Date(y, m - 1, 1),
    to: new Date(y, m, 1),
    label: monthLabelOf(y, m),
  };
}

export interface ReportPeriodOption {
  value: string;
  label: string;
}

/** Selector options: Bulan Ini, Bulan Lalu, then the most recent N months. */
export function reportPeriodOptions(now: Date = new Date(), recent = 6): ReportPeriodOption[] {
  const out: ReportPeriodOption[] = [
    { value: "CURRENT", label: "Bulan Ini" },
    { value: "PREVIOUS", label: "Bulan Lalu" },
  ];
  for (let i = 0; i < recent; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    out.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: monthLabelOf(y, m) });
  }
  return out;
}

/** Inclusive/exclusive membership of a Date within a period. */
function inPeriod(ms: number | null, p: ExpandedPeriod): boolean {
  if (ms === null) return false;
  return ms >= p.from.getTime() && ms < p.to.getTime();
}

/** WA admin rows whose `Tanggal Masuk` falls in the period (pre-junk, raw). */
export function waRowsInPeriod(rows: Row[], period: ExpandedPeriod): Row[] {
  return rows.filter((r) => {
    const d = toDatetime(r[WA_DATE_COL]);
    return inPeriod(d ? d.getTime() : null, period);
  });
}

/** Registration rows whose `Timestamp` falls in the period. */
export function registrationRowsInPeriod(rows: Row[], period: ExpandedPeriod): Row[] {
  return rows.filter((r) => inPeriod(timestampMs(r[REG_TS_COL]), period));
}

export interface CountPctItem {
  name: string;
  count: number;
  pct: number;
}

/** Build [{name,count,pct}] from a plain count tally. */
function withPct(items: { name: string; count: number }[], total: number): CountPctItem[] {
  if (total === 0) return items.map((i) => ({ ...i, pct: 0 }));
  return items.map((i) => ({ ...i, pct: Math.round((i.count / total) * 1000) / 10 }));
}

function countTally(rows: Row[], col: string | undefined): { name: string; count: number }[] {
  if (!col) return [];
  const tally = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue;
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/* ---------------------------------------------------------------------------
 * Report shape
 * ------------------------------------------------------------------------ */

export interface MonthlyReport {
  period: ExpandedPeriod;
  chatMasuk: {
    total: number;
    byMekariTag: CountPctItem[];
  };
  closing: {
    total: number;
    byStatus: CountPctItem[];
  };
  pendaftar: {
    total: number;
    rows: {
      nama: string;
      whatsapp: string;
      source: string;
      pic: string;
      timestamp: string;
    }[];
  };
  asalChat: CountPctItem[];
  insights: {
    totalPendaftar: number;
    conDaftarChat: string;
    statusDist: CountPctItem[];
    picDist: { name: string; count: number }[];
    mekariTags: CountPctItem[];
    sumberDist: CountPctItem[];
    pending: number;
    followUp: number;
  };
}

export interface BuildMonthlyReportInput {
  waRows: Row[];
  registrationRows: Row[];
  period: string;
  now?: Date;
}

/** Build the whole monthly report dataset for a selected period. */
export function buildMonthlyReport({
  waRows,
  registrationRows,
  period,
  now = new Date(),
}: BuildMonthlyReportInput): MonthlyReport {
  const p = expandPeriod(period, now);
  const pw = waRowsInPeriod(waRows, p);
  const pr = registrationRowsInPeriod(registrationRows, p);

  const statusCol = resolveWaStatusCol(pw);
  const chatTotal = pw.length;
  const mekariRaw = withPct(
    mekariTagBreakdown(pw).map((s) => ({ name: s.name, count: s.n })),
    chatTotal,
  );

  const closingTotal = statusCol
    ? pw.filter((r) => isClosingStatus(r[statusCol as string])).length
    : 0;
  const byStatus = withPct(countTally(pw, statusCol), chatTotal);

  // Registration "Asal Chat" uses the WA Sumber column (chat channel).
  const sb = sourceBreakdown(pw);
  const asalChat = withPct(
    sb.sources.map((s) => ({ name: s.name, count: s.n })),
    chatTotal,
  );

  // Light pendaftar rows for the C table.
  const pendaftarRows = pr.map((r) => ({
    nama: String(r["Nama Lengkap"] ?? ""),
    whatsapp: String(r["Nomor Whatsapp"] ?? r["Nomor Handphone"] ?? ""),
    source: String(r["MENGETAHUI DUTA PERSADA DARI"] ?? ""),
    pic: String(r["PIC"] ?? ""),
    timestamp: String(r[REG_TS_COL] ?? ""),
  }));

  const needs = buildNeedsAttention(pr);
  const pendingCat = needs.find((c) => c.key === "belumPenjadwalan");
  const followUpCat = needs.find((c) => c.key === "interviewBelumHasil");

  const conDaftarChat =
    chatTotal === 0 ? "—" : `${Math.round((pr.length / chatTotal) * 1000) / 10}%`;

  return {
    period: p,
    chatMasuk: { total: chatTotal, byMekariTag: mekariRaw },
    closing: { total: closingTotal, byStatus },
    pendaftar: { total: pr.length, rows: pendaftarRows },
    asalChat,
    insights: {
      totalPendaftar: pr.length,
      conDaftarChat,
      statusDist: byStatus,
      picDist: picBreakdown(pw).map((s) => ({ name: s.name, count: s.n })),
      mekariTags: mekariRaw,
      sumberDist: asalChat,
      pending: pendingCat ? pendingCat.rows.length : 0,
      followUp: followUpCat ? followUpCat.rows.length : 0,
    },
  };
}

/** Report period column summary for the deliverable (debug/verification aid). */
export function reportColumnNotes(): { waDate: string; waMekari: string; waAsalSource: string; waStatus: string } {
  return {
    waDate: WA_DATE_COL,
    waMekari: WA_MEKARI_COL,
    waAsalSource: "Sumber (Ads/Organik/Sales)",
    waStatus: "Status \\n\\n(No Respon/Follow Up/Daftar/Interview/Closing)",
  };
}
