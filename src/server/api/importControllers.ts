/**
 * Import API controller (POST /api/import/[key]).
 *
 * Accepts a CSV or XLSX file, parses it server-side, maps its header row to the
 * target table's schema columns (projection, never positional), validates, and
 * appends through the adapter (which preserves USER_ENTERED semantics and cache
 * invalidation). Never writes to Sheets directly.
 *
 * Unmatched file columns are DROPPED (counted in summary) rather than injected
 * by position — the same protection against B1-class offset drift used across
 * the adapter. If the file yields no importable columns -> 400.
 */

import * as XLSX from "xlsx";
import { requireRole, type Session } from "@/lib/auth";
import { assertKnownTableKey, normalizeHeader, rowIsEmpty } from "@/lib/validation";
import { parseCSV } from "@/lib/csv";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { record, type AuditLog } from "@/lib/audit";
import type { ApiSource } from "./types";

const ALLOWED_EXT = [".csv", ".xlsx", ".xls"];

/** Normalise one raw parsed cell for USER_ENTERED write semantics. */
function toCellValue(v: unknown): unknown {
  if (v === null || v === undefined) {
    return "";
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return v; // keep numbers/bools native (V3 `_to_cells` parity)
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) {
      return "";
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return String(v);
}

/**
 * Map a parsed spreadsheet/CSV (array-of-arrays: rows[0] = headers) onto a
 * table's declared schema columns, dropping unknown file columns and returning
 * cells in schema-declared order. `columnsFor` is injectable for tests.
 */
export function buildImportRows(
  appKey: string,
  aoa: unknown[][],
  columnsFor: (key: string) => string[],
): { rows: unknown[][]; schemaCols: string[]; skippedUnknownColumns: string[] } {
  if (aoa.length < 2) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "File must contain a header row and at least one data row.");
  }
  const schemaCols = columnsFor(appKey);
  if (schemaCols.length === 0) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, `No schema columns defined for table '${appKey}'.`);
  }

  // Tolerant header match: normalized (trim/lower/ws-collapse) file header ->
  // declared schema column (first match wins).
  const normToSchema: Record<string, string> = {};
  for (const col of schemaCols) {
    const n = normalizeHeader(col);
    if (n !== "" && normToSchema[n] === undefined) {
      normToSchema[n] = col;
    }
  }

  // Map each file header column to a schema index; collect unmatched names.
  const schemaIdxForFileCol: (number | undefined)[] = [];
  const skippedUnknownColumns: string[] = [];
  aoa[0].forEach((h) => {
    const n = normalizeHeader(h);
    if (n === "") {
      schemaIdxForFileCol.push(undefined);
      return;
    }
    const schemaCol = normToSchema[n];
    if (schemaCol === undefined) {
      skippedUnknownColumns.push(String(h));
      schemaIdxForFileCol.push(undefined);
      return;
    }
    schemaIdxForFileCol.push(schemaCols.indexOf(schemaCol));
  });

  if (schemaIdxForFileCol.every((i) => i === undefined)) {
    throw apiError(
      ErrorCodes.VALIDATION_FAILED,
      `File headers do not match any column of table '${appKey}' (recognised: ${schemaCols.join(", ")}).`,
    );
  }

  const rows: unknown[][] = [];
  for (let r = 1; r < aoa.length; r++) {
    const raw = aoa[r] ?? [];
    const out = new Array<unknown>(schemaCols.length).fill("");
    schemaIdxForFileCol.forEach((schemaIdx, fIdx) => {
      if (schemaIdx === undefined) {
        return;
      }
      out[schemaIdx] = toCellValue(raw[fIdx]);
    });
    if (rowIsEmpty(out)) {
      continue; // skip fully-empty rows
    }
    rows.push(out);
  }
  if (rows.length === 0) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "No importable rows found in file.");
  }
  return { rows, schemaCols, skippedUnknownColumns };
}

/** Parse a raw file buffer + filename into an array-of-arrays. */
export function parseImportFile(filename: string, buffer: Buffer): unknown[][] {
  const lower = filename.toLowerCase();
  const ext = "." + (lower.split(".").pop() ?? "");
  if (!ALLOWED_EXT.includes(ext)) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "Unsupported file type. Only CSV and XLSX are allowed.");
  }
  if (ext === ".csv") {
    return parseCSV(buffer.toString("utf8"));
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (err) {
    throw apiError(
      ErrorCodes.VALIDATION_FAILED,
      "Could not parse XLSX file.",
      err instanceof Error ? err.message : String(err),
    );
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName || !wb.Sheets[sheetName]) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "XLSX file contains no readable sheet.");
  }
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  });
}

export interface ImportSummary {
  fileRowCount: number;
  addedRows: number;
  skippedEmptyRows: number;
  skippedUnknownColumns: number;
}

/**
 * POST /api/import/[key] — editor. Import a CSV/XLSX file into a table.
 */
export async function importController(
  session: Session | null,
  source: ApiSource,
  key: string,
  filename: string,
  buffer: Buffer,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    assertKnownTableKey(key);
    const aoa = parseImportFile(filename, buffer);
    const { rows, skippedUnknownColumns } = buildImportRows(key, aoa, (k) => source.columnsFor(k));
    const res = await source.appendRows(key, rows);
    if (!res.ok) {
      throw apiError(
        ErrorCodes.ADAPTER_FAILED,
        res.code === "UNKNOWN_TAB" ? "Unknown table." : "Sheet operation failed.",
        { code: res.code, message: res.message },
      );
    }
    record(auditLog, {
      actor: session!.identity,
      operation: "import",
      tableKey: key,
      targetResource: `${key} (file: ${filename})`,
      success: true,
      summary: `Imported ${rows.length} row(s).`,
    });
    const fileRowCount = Math.max(0, aoa.length - 1);
    const skippedEmptyRows = Math.max(0, fileRowCount - rows.length);
    const summary: ImportSummary = {
      fileRowCount,
      addedRows: rows.length,
      skippedEmptyRows,
      skippedUnknownColumns: skippedUnknownColumns.length,
    };
    return new Response(
      JSON.stringify({
        ok: true,
        added: rows.length,
        skipped: skippedEmptyRows + skippedUnknownColumns.length,
        summary,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}