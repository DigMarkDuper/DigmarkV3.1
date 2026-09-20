/**
 * Request validation (Phase C).
 *
 * Every API input is validated against the declarative schema (src/server/
 * adapter/schema.ts) BEFORE it reaches the data adapter. Column positions are
 * never trusted from the client: object rows are projected into the schema's
 * declared column order, and column/table names are resolved by name only.
 */

import { columnsFor, TAB_SCHEMAS } from "@/server/adapter/schema";
import type { Cell } from "@/server/adapter/source";
import { apiError, ErrorCodes } from "./errors";

/** True for a real (non-array, non-null) object. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a table key. Unknown keys => 404 NOT_FOUND (absent resource).
 * Returns the validated key.
 */
export function assertKnownTableKey(key: unknown): string {
  if (typeof key !== "string" || key.trim() === "") {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "Table key is required.");
  }
  if (!(key in TAB_SCHEMAS)) {
    throw apiError(ErrorCodes.NOT_FOUND, `Unknown table '${key}'.`);
  }
  return key;
}

/** Validate a column name against a table's declared schema (400 on miss). */
export function assertKnownColumn(appKey: string, column: unknown): string {
  if (typeof column !== "string" || column.trim() === "") {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "column must be a non-empty string.");
  }
  if (!columnsFor(appKey).includes(column)) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, `Unknown column '${column}' for table '${appKey}'.`);
  }
  return column;
}

/** Validate a 0-based, non-negative integer row index (400 otherwise). */
export function assertRowIndex(rowIndex: unknown): number {
  if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || rowIndex < 0) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "rowIndex must be a non-negative integer.");
  }
  return rowIndex;
}

/** Validate a cell value for an update: only JSON scalars are accepted. */
export function assertScalarValue(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "value must be a scalar (string, number, boolean, or null).");
  }
  return value;
}

/**
 * Convert an append payload (a single row-object or an array of row-objects)
 * into Cell[][] in the table's DECLARED column order.
 *
 * Each row MUST be an object whose keys are all known columns of the table's
 * schema; any unknown column is rejected (400) rather than trusted by position.
 */
export function buildCellRows(appKey: string, payload: unknown): Cell[][] {
  const cols = columnsFor(appKey);
  const rawRows = Array.isArray(payload) ? payload : [payload];
  if (rawRows.length === 0) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "Append payload must contain at least one row.");
  }
  return rawRows.map((row, i) => {
    if (!isPlainObject(row)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, `Append row ${i} must be an object.`);
    }
    const unknown = Object.keys(row).find((k) => !cols.includes(k));
    if (unknown !== undefined) {
      throw apiError(
        ErrorCodes.VALIDATION_FAILED,
        `Unknown column '${unknown}' for table '${appKey}' (accepted columns: ${cols.join(", ")}).`,
      );
    }
    // Project into declared column order; missing keys default to empty string.
    return cols.map((c) => {
      const v = row[c];
      return v === undefined ? "" : v;
    });
  });
}

/** Normalise a header for tolerant column matching (trim, lowercase, collapse ws). */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** True when a row contains no non-empty cell (i.e. an empty import row). */
export function rowIsEmpty(cells: unknown[]): boolean {
  return cells.every((c) => c === "" || c === null || c === undefined);
}