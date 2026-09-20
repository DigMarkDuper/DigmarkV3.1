/**
 * Insight File Upload — encoding-aware file parser.
 *
 * Reads a raw buffer (+ filename) and returns a normalized, structure-agnostic
 * table plus the detected file *shape*:
 *   - `instagram-per-metric`: Excel/IG per-metric export — a `sep=,` preamble
 *     line, a single-cell metric title line, then a `Date,Primary` header and
 *     ISO-timestamp rows (UTF-16 in practice).
 *   - `generic`: a normal multi-column CSV/XLSX with a header row (TikTok
 *     Overview / FollowerHistory).
 *
 * The module is deliberately NOT platform-aware (that belongs to the platform
 * detector). It only normalizes bytes into rows and classifies the file shape.
 */

import * as XLSX from "xlsx";
import { parseCsvBytes } from "@/lib/csv";
import { normalizeHeader } from "@/lib/validation";

export type InsightFileKind = "instagram-per-metric" | "generic";

export interface ParsedInsightFile {
  /** File shape, used by the platform detector to classify the source. */
  kind: InsightFileKind;
  /** For instagram-per-metric: the single-cell metric title (e.g. `Views`). */
  title: string | null;
  /** Space-collapsed, lowercased header names (for generic files). */
  headers: string[];
  /** Data rows as objects keyed by nominal header (`date`/`primary` for IG). */
  rows: Record<string, string>[];
  /** Original filename (for platform-detection fallback + error messages). */
  filename: string;
  rowCount: number;
}

const ALLOWED_EXT = [".csv", ".xlsx", ".xls"];

/** True when the file header looks like Instagram's `Date,Primary` pair. */
function isIgMetricHeader(headers: string[]): boolean {
  const n = headers.map((h) => normalizeHeader(h));
  return n.length >= 2 && n[0] === "date" && n[1] === "primary";
}

/** Detect the file kind from the raw CSV array-of-arrays. */
function classifyCsv(aoa: string[][]): {
  kind: InsightFileKind;
  title: string | null;
  headers: string[];
  rows: Record<string, string>[];
} {
  let rows = aoa;
  let offset = 0;

  // Strip a leading `sep=,` / `sep=\t` preamble if present.
  if (rows[0] && /^sep=/i.test(String(rows[0][0] ?? "").trim())) {
    offset++;
    rows = aoa.slice(offset);
  }

  // Instagram per-metric: a single-cell metric title line followed by
  // a `Date,Primary` header. (Second header cell is literally "Primary".)
  if (
    rows.length >= 2 &&
    rows[0].filter((c) => (c ?? "").trim() !== "").length === 1 &&
    isIgMetricHeader(rows[1])
  ) {
    const title = String(rows[0][0] ?? "").trim() || null;
    const headers = ["date", "primary"];
    const data = rows.slice(2);
    return {
      kind: "instagram-per-metric",
      title,
      headers,
      rows: data.map((r) => ({ date: String(r[0] ?? ""), primary: String(r[1] ?? "") })),
    };
  }

  // Generic: first non-empty row is the header.
  const headerRow = rows.find((r) => r.some((c) => (c ?? "").trim() !== "")) ?? [];
  const headers = headerRow.map((h) => normalizeHeader(h));
  if (headers.length === 0 || headers[0] === "") {
    return { kind: "generic", title: null, headers: [], rows: [] };
  }
  const dataIdx = rows.indexOf(headerRow) + 1;
  const data = rows.slice(dataIdx);
  return {
    kind: "generic",
    title: null,
    headers,
    rows: data.map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => {
        o[h] = String(r[i] ?? "");
      });
      return o;
    }),
  };
}

/** Classify an XLSX workbook's first sheet into a parsed table. */
function classifyXlsx(wb: XLSX.WorkBook): {
  kind: InsightFileKind;
  title: string | null;
  headers: string[];
  rows: Record<string, string>[];
} {
  const sheetName = wb.SheetNames[0];
  const aoa = sheetName
    ? (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: true,
        defval: "",
      }) as unknown[][])
    : [];
  const strAoa = aoa.map((r) => r.map((c) => (c === undefined || c === null ? "" : String(c))));
  return classifyCsv(strAoa);
}

/**
 * Parse a raw insight file buffer + filename. Throws API-shaped errors on
 * unsupported extensions / unparseable workbook. Never throws for empty or
 * headerless content — that surfaces as an empty/unsupported table for the
 * platform detector + validator to flag with a clear message.
 */
export function parseInsightFile(filename: string, buffer: Buffer): ParsedInsightFile {
  const lower = filename.toLowerCase();
  const ext = "." + (lower.split(".").pop() ?? "");
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error("Unsupported file type. Only CSV and XLS are allowed."); // mapped to 400 upstream
  }

  let kind: InsightFileKind;
  let title: string | null;
  let headers: string[];
  let rows: Record<string, string>[];

  if (ext === ".csv") {
    // Encoding-aware, strip `sep=,` preamble. The IG per-metric title line +
    // `Date,Primary` header are detected by classifyCsv below.
    const aoa = parseCsvBytes(buffer, { stripSepPreamble: true });
    const cls = classifyCsv(aoa);
    kind = cls.kind;
    title = cls.title;
    headers = cls.headers;
    rows = cls.rows;
  } else {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    } catch {
      throw new Error("Could not parse XLSX file.");
    }
    const cls = classifyXlsx(wb);
    kind = cls.kind;
    title = cls.title;
    headers = cls.headers;
    rows = cls.rows;
  }

  return { kind, title, headers, rows, filename, rowCount: rows.length };
}