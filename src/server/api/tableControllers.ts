/**
 * Table API controllers (GET fetch / POST append / PATCH updateCell).
 * Framework-free: (session, source, ...params) => Response. Thin route handlers.
 */

import type { SheetSource } from "@/server/adapter/source";
import { requireAuth, requireRole, type Session } from "@/lib/auth";
import {
  assertKnownColumn,
  assertKnownTableKey,
  assertRowIndex,
  assertScalarValue,
  buildCellRows,
} from "@/lib/validation";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { record, type AuditLog } from "@/lib/audit";

function adapterResultToError(res: { ok: boolean; code?: string; message?: string }): void {
  if (!res.ok) {
    const detail = { code: res.code, message: res.message };
    const message = res.code === "UNKNOWN_TAB" ? `Unknown table.` : "Sheet operation failed.";
    throw apiError(ErrorCodes.ADAPTER_FAILED, message, detail);
  }
}

/**
 * GET /api/tables/[key] — viewer. Return normalized cached rows for a table.
 */
export async function getTableController(
  session: Session | null,
  source: SheetSource,
  key: string,
): Promise<Response> {
  try {
    requireAuth(session);
    assertKnownTableKey(key);
    const rows = await source.fetchTable(key);
    return new Response(JSON.stringify({ ok: true, table: key, rows }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/tables/[key] — editor. Validate + append object rows via adapter.
 * `key` is re-validated so a non-string dynamic segment cannot be abused.
 */
export async function appendTableController(
  session: Session | null,
  source: SheetSource,
  key: string,
  payload: unknown,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    assertKnownTableKey(key);
    const cells = buildCellRows(key, payload);
    const res = await source.appendRows(key, cells);
    adapterResultToError(res);
    record(auditLog, {
      actor: session!.identity,
      operation: "append",
      tableKey: key,
      targetResource: key,
      success: true,
      summary: `Appended ${res.affected ?? cells.length} row(s).`,
    });
    return new Response(JSON.stringify({ ok: true, affected: res.affected ?? cells.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/tables/[key] — editor. Update one cell by declared column name.
 * Never trusts client column positions; resolves by header name via schema.
 */
export async function updateCellController(
  session: Session | null,
  source: SheetSource,
  key: string,
  body: { rowIndex?: unknown; column?: unknown; value?: unknown } | null | undefined,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    assertKnownTableKey(key);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Request body must be a JSON object.");
    }
    const rowIndex = assertRowIndex(body.rowIndex);
    const column = assertKnownColumn(key, body.column);
    const value = assertScalarValue(body.value);
    const res = await source.updateCell(key, rowIndex, column, value);
    adapterResultToError(res);
    record(auditLog, {
      actor: session!.identity,
      operation: "update",
      tableKey: key,
      targetResource: `${key}.${column}@row${rowIndex}`,
      success: true,
      summary: `Updated ${column} at row ${rowIndex}.`,
    });
    return new Response(
      JSON.stringify({ ok: true, rowIndex, column, affected: res.affected ?? 1 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}