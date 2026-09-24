/**
 * Registration workspace — pure derivations for the /wa-admin Command Center.
 *
 * Input: normalized registration rows (Form Pendaftaran, SECOND spreadsheet)
 * from GET /api/registration/data, plus the WA Admin rows for the
 * registration↔WA-Admin match chip. Phase E rule: the browser computes ONLY
 * the derived counts/preparations; it never touches Sheets.
 *
 * STAGE SEMANTICS (verified against the live "Form Responses 1", 2026-09):
 *   - Stage columns hold `Sudah` (done) / `Belum` (not yet) — a case-insensitive
 *     exact match; blank/null is NOT a done stage (data-correctness rule).
 *   - "Hasil Interview\n(Diterima/Tidak)" holds `Ya` (diterima) / `Tidak`.
 *   - Source column: "MENGETAHUI DUTA PERSADA DARI".
 *   - Year is extracted from the `Timestamp` column (M/D/YYYY with time).
 * All predicates are built ONLY from these real distinct values; no invented
 * stage tokens.
 */
import type { Row } from "@/server/adapter/source";
import { normalizePhone } from "@/server/utils/helpers";

/** Exact registration stage/source column names. */
const COL_TS = "Timestamp";
const COL_NAMA = "Nama Lengkap";
const COL_WHATSAPP = "Nomor Whatsapp";
const COL_HANDPHONE = "Nomor Handphone";
const COL_EMAIL = "Email";
const COL_SOURCE = "MENGETAHUI DUTA PERSADA DARI";
const COL_PENJADWALAN = "Penjadwalan Interview";
const COL_INTERVIEW = "Interview";
const COL_HASIL = "Hasil Interview\n(Diterima/Tidak)";
const COL_JUKNIS = "Pengiriman Juknis";
const COL_PAYMENT = "Pembayaran";
const COL_GRUP = "Invite Grup Pendaftar";
const COL_PIC = "PIC";

/** `Sudah` (case-insensitive exact, after trim) marks a stage as reached. */
export function stageReached(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "SUDAH";
}

/** `Ya` in the Hasil column means Diterima (accepted). */
export function hasilDiterima(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "YA";
}

/** `Tidak` in the Hasil column means rejected (not counted as diterima). */
export function hasilTidak(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "TIDAK";
}

/** Extract an ISO-8601-ish year from a Timestamp cell (M/D/YYYY … / YYYY-MM-DD …). */
export function yearOfTimestamp(value: unknown): number | null {
  const s = String(value ?? "").trim();
  const m = s.match(/(\d{4})/);
  if (m) {
    const y = Number(m[1]);
    if (y >= 2000 && y <= 2100) return y; // registration data is 2021+
  }
  return null;
}

/** Distinct years present in `Timestamp`, descending. Empty rows ignored. */
export function registrationYears(rows: Row[]): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const y = yearOfTimestamp(r[COL_TS]);
    if (y !== null) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

/** Keep only rows whose Timestamp year equals `year`. */
export function filterByYear(rows: Row[], year: number): Row[] {
  return rows.filter((r) => yearOfTimestamp(r[COL_TS]) === year);
}

/* ---------------------------------------------------------------------------
 * Stage predicates (the 6-stage funnel: Pendaftar → Interview → Diterima →
 * Juknis → Pembayaran → Grup).
 * ------------------------------------------------------------------------ */

/** Pendaftar (Total) — every registration row (already year-filtered). */
export function countPendaftar(rows: Row[]): number {
  return rows.length;
}

/** Interview reached = "Interview" == Sudah. */
export function interviewRows(rows: Row[]): Row[] {
  return rows.filter((r) => stageReached(r[COL_INTERVIEW]));
}
export function countInterview(rows: Row[]): number {
  return interviewRows(rows).length;
}

/** Diterima (accepted) = "Hasil Interview" == Ya. */
export function diterimaRows(rows: Row[]): Row[] {
  return rows.filter((r) => hasilDiterima(r[COL_HASIL]));
}
export function countDiterima(rows: Row[]): number {
  return diterimaRows(rows).length;
}

/** Juknis sent = "Pengiriman Juknis" == Sudah. */
export function juknisRows(rows: Row[]): Row[] {
  return rows.filter((r) => stageReached(r[COL_JUKNIS]));
}
export function countJuknis(rows: Row[]): number {
  return juknisRows(rows).length;
}

/** Pembayaran = "Pembayaran" == Sudah. */
export function paymentRows(rows: Row[]): Row[] {
  return rows.filter((r) => stageReached(r[COL_PAYMENT]));
}
export function countPayment(rows: Row[]): number {
  return paymentRows(rows).length;
}

/** Grup invite sent = "Invite Grup Pendaftar" == Sudah. */
export function grupRows(rows: Row[]): Row[] {
  return rows.filter((r) => stageReached(r[COL_GRUP]));
}
export function countGrup(rows: Row[]): number {
  return grupRows(rows).length;
}

/* ---------------------------------------------------------------------------
 * Funnel (6 steps + step-to-step conversion).
 * ------------------------------------------------------------------------ */
export interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

/** Funnel in order Pendaftar → Interview → Diterima → Juknis → Pembayaran → Grup. */
export const FUNNEL_KEYS = ["pendaftar", "interview", "diterima", "juknis", "payment", "grup"];

export function buildFunnel(rows: Row[]): FunnelStep[] {
  const counts: Record<string, number> = {
    pendaftar: countPendaftar(rows),
    interview: countInterview(rows),
    diterima: countDiterima(rows),
    juknis: countJuknis(rows),
    payment: countPayment(rows),
    grup: countGrup(rows),
  };
  const labels: Record<string, string> = {
    pendaftar: "Pendaftar",
    interview: "Interview",
    diterima: "Diterima",
    juknis: "Juknis",
    payment: "Pembayaran",
    grup: "Grup",
  };
  return FUNNEL_KEYS.map((key) => ({ key, label: labels[key], count: counts[key] }));
}

/** Step-to-step conversion % (next/current*100, one decimal) or "—" when no base. */
export function conversionPct(cur: number, next: number): string {
  if (cur === 0) return "—";
  return `${((next / cur) * 100).toFixed(1)}%`;
}

/* ---------------------------------------------------------------------------
 * Needs Attention (5 categories) — compact operator panel.
 * ------------------------------------------------------------------------ */
export interface NeedsCategory {
  key: string;
  label: string;
  color: string;
  rows: Row[];
  /** One-line helper the UI may use (empty hint). */
  emptyHint: string;
}
export const NEEDS_COLORS: Record<string, string> = {
  belumPenjadwalan: "warning",
  interviewBelumHasil: "warning",
  diterimaJuknisBelum: "brand",
  juknisBelumPayment: "brand",
  paymentBelumGrup: "success",
};

/**
 * 5 needs-attention categories. A row satisfies multi categories — the UI
 * dedupes the total pill across them (a pendaftar needing action appears in
 * the union exactly once). Blank is NOT a done stage, so "Belum …" = not Sudah.
 */
export function buildNeedsAttention(rows: Row[]): NeedsCategory[] {
  const belumPenjadwalan = rows.filter((r) => !stageReached(r[COL_PENJADWALAN]));
  const interviewBelumHasil = rows.filter(
    (r) => stageReached(r[COL_INTERVIEW]) && !hasilDiterima(r[COL_HASIL]) && !hasilTidak(r[COL_HASIL]),
  );
  const diterimaJuknisBelum = diterimaRows(rows).filter((r) => !stageReached(r[COL_JUKNIS]));
  const juknisBelumPayment = juknisRows(rows).filter((r) => !stageReached(r[COL_PAYMENT]));
  const paymentBelumGrup = paymentRows(rows).filter((r) => !stageReached(r[COL_GRUP]));
  return [
    { key: "belumPenjadwalan", label: "Belum Dijadwalkan Interview", color: "warning", rows: belumPenjadwalan, emptyHint: "Belum ada pendaftar di kategori ini." },
    { key: "interviewBelumHasil", label: "Interview Belum Diisi Hasil", color: "warning", rows: interviewBelumHasil, emptyHint: "Belum ada pendaftar di kategori ini." },
    { key: "diterimaJuknisBelum", label: "Diterima, Juknis Belum Dikirim", color: "brand", rows: diterimaJuknisBelum, emptyHint: "Belum ada pendaftar di kategori ini." },
    { key: "juknisBelumPayment", label: "Juknis Dikirim, Belum Pembayaran", color: "brand", rows: juknisBelumPayment, emptyHint: "Belum ada pendaftar di kategori ini." },
    { key: "paymentBelumGrup", label: "Sudah Pembayaran, Belum Invite Grup", color: "success", rows: paymentBelumGrup, emptyHint: "Belum ada pendaftar di kategori ini." },
  ];
}

/** Distinct pendaftar needing action across all 5 categories (union count). */
export function needsAttentionTotal(categories: NeedsCategory[]): number {
  const ids = new Set<Row>();
  for (const cat of categories) {
    for (const r of cat.rows) ids.add(r);
  }
  return ids.size;
}

/* ---------------------------------------------------------------------------
 * Source breakdown — per source value (MENGETAHUI DUTA PERSADA DARI):
 * Pendaftar / Diterima / Pembayaran figures.
 * ------------------------------------------------------------------------ */
export interface SourceRegStat {
  name: string;
  pendaftar: number;
  diterima: number;
  pembayaran: number;
}

/** Group rows by source value; exclude empty/null/"nan". Count-descending. */
export function sourceBreakdownReg(rows: Row[]): SourceRegStat[] {
  const tally = new Map<string, Row[]>();
  for (const r of rows) {
    const v = String(r[COL_SOURCE] ?? "").trim();
    if (v === "" || v.toLowerCase() === "nan") continue;
    if (!tally.has(v)) tally.set(v, []);
    tally.get(v)!.push(r);
  }
  const out: SourceRegStat[] = [];
  for (const [name, group] of tally) {
    out.push({
      name,
      pendaftar: group.length,
      diterima: countDiterima(group),
      pembayaran: countPayment(group),
    });
  }
  return out.sort((a, b) => b.pendaftar - a.pendaftar);
}

/* ---------------------------------------------------------------------------
 * PIC breakdown — per PIC value: Pendaftar / Pembayaran figures.
 * Rows with blank/undefined PIC are excluded from per-PIC analysis.
 * ------------------------------------------------------------------------ */
export interface PicStat {
  pic: string;
  total: number;
  sudah: number;
  belum: number;
  pct: number;
}

/** Group rows by PIC (case-insensitive key); exclude blank. Total-desc, pic-asc. */
export function picAnalysis(rows: Row[]): PicStat[] {
  const tally = new Map<string, { pic: string; group: Row[] }>();
  for (const r of rows) {
    const v = String(r[COL_PIC] ?? "").trim();
    if (v === "") continue;
    const key = v.toLowerCase();
    const entry = tally.get(key);
    if (entry) entry.group.push(r);
    else tally.set(key, { pic: v, group: [r] });
  }
  const out: PicStat[] = [];
  for (const { pic, group } of tally.values()) {
    const total = group.length;
    const sudah = group.filter((r) => stageReached(r[COL_PAYMENT])).length;
    out.push({
      pic,
      total,
      sudah,
      belum: total - sudah,
      pct: total > 0 ? Math.round((sudah / total) * 1000) / 10 : 0,
    });
  }
  return out.sort((a, b) => b.total - a.total || a.pic.localeCompare(b.pic));
}

/* ---------------------------------------------------------------------------
 * Pendaftar Terbaru — recent rows (newest Timestamp first) with detail.
 * ------------------------------------------------------------------------ */

/** Parse a Timestamp cell to a numeric sort key (epoch ms) or null. */
export function timestampMs(value: unknown): number | null {
  const s = String(value ?? "").trim();
  // M/D/YYYY h:mm:ss
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, mo, d, y, h = 0, mi = 0, se = 0] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  return null;
}

/** Recent pendaftar, newest Timestamp first (unparseable dates sink last). */
export function recentPendaftar(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const ta = timestampMs(a[COL_TS]);
    const tb = timestampMs(b[COL_TS]);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}

/** Readable value or "—" for a missing cell (table display). */
export function cellOrDash(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "" ? "—" : s;
}

/* ---------------------------------------------------------------------------
 * Registration stage label (for the match chip): the furthest reached stage.
 * Labels match the spec's examples: "Diterima", "Sudah Pembayaran", "Juknis".
 * ------------------------------------------------------------------------ */
export function registrationStageLabel(row: Row): string {
  if (stageReached(row[COL_GRUP])) return "Invite Grup";
  if (stageReached(row[COL_PAYMENT])) return "Sudah Pembayaran";
  if (stageReached(row[COL_JUKNIS])) return "Juknis";
  if (hasilDiterima(row[COL_HASIL])) return "Diterima";
  if (stageReached(row[COL_INTERVIEW])) return "Interview";
  if (stageReached(row[COL_PENJADWALAN])) return "Penjadwalan Interview";
  return "Pendaftar";
}

/* ---------------------------------------------------------------------------
 * Registration ↔ WA-Admin matching.
 * Priority: Whatsapp → Handphone → Email → Nama (first non-empty field that
 * hits a WA Admin record). Visual-only — no cross-table writes.
 * ------------------------------------------------------------------------ */

/** Normalized match key for a phone-like cell (empty → null). */
function phoneKey(v: unknown): string | null {
  const n = normalizePhone(v);
  return n === "" ? null : n;
}

/** Normalized (trimmed, case-folded) name key (empty → null). */
function nameKey(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "" || s === "nan" ? null : s;
}

/**
 * Match one registration row to a WA Admin record. Priority Whatsapp →
 * Handphone → Email → Nama. Returns the matched WA row + the registration's
 * furthest stage label, or null when no match.
 */
export interface RegistrationMatch {
  waRow: Row;
  stageLabel: string;
}

export function matchRegistrationToWa(
  regRow: Row,
  waRows: Row[],
): RegistrationMatch | null {
  const wantPhone = phoneKey(regRow[COL_WHATSAPP]);
  const wantHp = phoneKey(regRow[COL_HANDPHONE]);
  const wantEmail = (() => {
    const s = String(regRow[COL_EMAIL] ?? "").trim().toLowerCase();
    return s === "" || s === "nan" ? null : s;
  })();
  const wantName = nameKey(regRow[COL_NAMA]);

  // Global priority: try the highest-priority match key across ALL WA rows
  // before the next key (spec §5: Whatsapp → Handphone → Email → Nama).
  const waWhatsappOf = (wa: Row) => phoneKey(wa["Nomor Whatsapp"] ?? wa["No Hp"] ?? "");
  const waHpOf = (wa: Row) => phoneKey(wa["No Hp"] ?? wa["Nomor Handphone"]);
  const waEmailOf = (wa: Row) => {
    const s = String(wa["Email Address"] ?? wa["Email"] ?? "").trim().toLowerCase();
    return s === "" || s === "nan" ? null : s;
  };
  const waNameOf = (wa: Row) => nameKey(wa["Nama"]);

  let best: Row | null = null;
  if (wantPhone) {
    best = (waRows.find((wa) => waWhatsappOf(wa) === wantPhone) ?? waRows.find((wa) => waHpOf(wa) === wantPhone)) ?? null;
  }
  if (!best && wantHp) {
    best = (waRows.find((wa) => waWhatsappOf(wa) === wantHp) ?? waRows.find((wa) => waHpOf(wa) === wantHp)) ?? null;
  }
  if (!best && wantEmail) {
    best = waRows.find((wa) => waEmailOf(wa) === wantEmail) ?? null;
  }
  if (!best && wantName) {
    best = waRows.find((wa) => waNameOf(wa) === wantName) ?? null;
  }
  if (!best) return null;
  return { waRow: best, stageLabel: registrationStageLabel(regRow) };
}

/** Map every registration row (by reference) to its WA match, if any. */
export function buildRegMatches(
  regRows: Row[],
  waRows: Row[],
): Map<Row, RegistrationMatch> {
  const map = new Map<Row, RegistrationMatch>();
  for (const r of regRows) {
    const m = matchRegistrationToWa(r, waRows);
    if (m) map.set(r, m);
  }
  return map;
}

/* ---------------------------------------------------------------------------
 * Aggregate state the dashboard consumes.
 * ------------------------------------------------------------------------ */
export interface RegistrationStats {
  rows: Row[];
  years: number[];
  funnel: FunnelStep[];
  needs: NeedsCategory[];
  needsTotal: number;
  sources: SourceRegStat[];
  pics: PicStat[];
  recent: Row[];
  matches: Map<Row, RegistrationMatch>;
}

/**
 * All derived state for the registration command center for one selected year
 * (or all rows when `year` is null). `matches` cross-references WA Admin rows.
 */
export function deriveRegistrationStats(
  rows: Row[],
  year: number | null,
  waRows: Row[] = [],
): RegistrationStats {
  const yearRows = year === null ? rows : filterByYear(rows, year);
  const needs = buildNeedsAttention(yearRows);
  return {
    rows: yearRows,
    years: registrationYears(rows),
    funnel: buildFunnel(yearRows),
    needs,
    needsTotal: needsAttentionTotal(needs),
    sources: sourceBreakdownReg(yearRows),
    pics: picAnalysis(yearRows),
    recent: recentPendaftar(yearRows),
    matches: buildRegMatches(yearRows, waRows),
  };
}