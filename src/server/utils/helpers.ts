/**
 * Pure helper functions — port of `utils/helpers.py`. No I/O, unit-testable.
 * Semantics preserved byte-for-byte from the Python source.
 */

/** Missing/sentinel values that normalize to empty in Python.
 *  Mirrors: s.lower() in ("nan","none","nat","null",""). */
const EMPTY_STRINGS = new Set(["nan", "none", "nat", "null", ""]);

/**
 * Normalize an Indonesian phone number to the `62...` international form.
 * Handles floats sneaked in by pandas (e.g. 628123.0), leading `0`,
 * leading `8`, and strips all non-digit characters. Returns "" if invalid.
 */
export function normalizePhone(value: unknown): string {
  let s = String(value).trim();
  if (EMPTY_STRINGS.has(s.toLowerCase())) {
    return "";
  }
  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }
  const digits = s.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("0")) {
    return "62" + digits.slice(1);
  }
  if (digits.startsWith("8")) {
    return "62" + digits;
  }
  return digits;
}

/**
 * Parse an IDR cost string like 'Rp 5.000.000,00' or '5,000,000' to a number.
 * Numeric values are returned as-is (Python float(value)); booleans and
 * unparseable strings fall through to the string path -> 0.
 */
export function cleanIdr(value: unknown): number {
  if (typeof value === "number") {
    return value; // Python returns float(value) for int/float inputs
  }
  let s = String(value).toUpperCase().replace(/RP/g, "").replace(/IDR/g, "").trim();
  if (s === "" || s === "NAN" || s === "NONE") {
    return 0;
  }
  if (s.endsWith(",00")) {
    s = s.slice(0, -3);
  }
  if (s.endsWith(".00")) {
    s = s.slice(0, -3);
  }
  s = s.replace(/\./g, "").replace(/,/g, "");
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * PDF/export-safe text: strips control chars, missing values -> '-'.
 */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  const s = String(value).trim();
  if (EMPTY_STRINGS.has(s.toLowerCase())) {
    return "-";
  }
  let out = "";
  for (const ch of s) {
    // ord(ch) >= 32 OR ch in "\n\t" — mirrors the Python filter exactly.
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 || ch === "\n" || ch === "\t") {
      out += ch;
    }
  }
  return out;
}

/**
 * Parse a date value, day-first (DD/MM/YYYY), coercing errors to null.
 * Port of pandas `pd.to_datetime(series, dayfirst=True, errors="coerce")`
 * for a single value. Also accepts ISO YYYY-MM-DD (dates stored that way in
 * some sheets). Returns null when unparseable.
 */
export function toDatetime(value: unknown, dayFirst = true): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = String(value).trim();
  if (EMPTY_STRINGS.has(s.toLowerCase())) {
    return null;
  }
  // ISO / YYYY-MM-DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT].*)?$/);
  if (m) {
    const [, y, mo, d] = m;
    return makeDate(Number(y), Number(mo), Number(d));
  }
  // day-first DD/MM/YYYY (or DD-MM-YYYY)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[\sT].*)?$/);
  if (m) {
    const [, d, mo, yRaw] = m;
    let y = Number(yRaw);
    if (y < 100) {
      y += 2000;
    }
    return makeDate(y, Number(mo), Number(d));
  }
  return null;
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(year, month - 1, day);
  // Reject rollover dates like 31/02 -> Mar 3.
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

/**
 * Make records display/Arrow-safe: coerce columns that mix types (e.g.
 * str + float) to string. Only mixed-dtype object columns are touched.
 * Port of `sanitize_mixed`. Operates on an array of record rows.
 */
export function sanitizeMixed(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (!rows.length) {
    return rows;
  }
  const cols = columnNames(rows);
  const mixedCols = new Set<string>();
  for (const c of cols) {
    const seen = new Set<string>();
    for (const row of rows) {
      const v = row[c];
      if (v !== null && v !== undefined && v !== "") {
        seen.add(typeof v);
      }
    }
    if (seen.size > 1) {
      mixedCols.add(c);
    }
  }
  if (!mixedCols.size) {
    return rows;
  }
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const c of mixedCols) {
      const v = row[c];
      out[c] = v === null || v === undefined || v === "" ? "" : String(v);
    }
    return out;
  });
}

/** Distinct column names in first-appearance order across all rows. */
export function columnNames(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = [];
  const set = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!set.has(key)) {
        set.add(key);
        seen.push(key);
      }
    }
  }
  return seen;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format a date to 'Month Years' labels (null -> '').
 * Port of pandas `series.dt.strftime("%B %Y").fillna("")`.
 */
export function monthLabel(value: unknown, fmt = "%B %Y"): string {
  const d = toDatetime(value);
  if (!d) {
    return "";
  }
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  if (fmt === "%B %Y") {
    return `${month} ${year}`;
  }
  // Best-effort fallback for other formats (not parity-critical).
  return fmt.replace("%B", month).replace("%Y", String(year));
}

/**
 * Resolve the WA admin status column — the SINGLE source of truth.
 *
 * Returns the LAST column whose lowercased name contains "status" and does
 * NOT contain "mekari". This is the documented correct resolver (previously
 * duplicated as metrics.ts::statusCol and write.ts::waStatusColumn, both
 * "last non-mekari"; ads.ts::waStatusCol used FIRST-match — converging to
 * LAST-match is a no-op on real wa_admin data since only one column matches,
 * but unification removes drift). Returns undefined when none.
 */
export function resolveWaStatusCol(rows: Record<string, unknown>[]): string | undefined {
  const cols = columnNames(rows);
  const matches = cols.filter(
    (c) => c.toLowerCase().includes("status") && !c.toLowerCase().includes("mekari"),
  );
  return matches.length ? matches[matches.length - 1] : undefined;
}

/**
 * The canonical WA closing predicate: trimmed, lowercased value EXACTLY
 * equals "closing". NO substring matching — "closed", "closing process",
 * "closed - registered" must NOT count. This is the exact definition used by
 * waAdmin.ts::closingCount/closingRows (pre-junk). Shared across the app so
 * the Hero landing page, the WA Admin page and the source-of-truth derivations
 * cannot disagree.
 */
export function isClosingStatus(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "closing";
}

const DEFAULT_DONE_KEYWORDS = ["DONE", "V", "1", "TRUE", "YES"];

/**
 * True for values that mark a task as complete.
 * Port of `is_done`: str(series).upper().strip().isin(keywords).
 */
export function isDone(value: unknown, keywords: string[] = DEFAULT_DONE_KEYWORDS): boolean {
  const s = String(value).toUpperCase().trim();
  return keywords.includes(s);
}