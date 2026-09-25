/**
 * Registration API controller (GET /api/registration/data).
 *
 * Returns normalized registration rows (Form Pendaftaran, SECOND spreadsheet)
 * to the /wa-admin command center. Registration is read-only (viewer) — the
 * command center never writes to the registration workbook.
 *
 * `source` is a LAZY factory so an unauthenticated request returns 401 BEFORE we
 * attempt to construct the (env-dependent) registration source; a missing
 * REGISTRATION_SPREADSHEET_KEY must never preempt the auth gate.
 */

import type { RegistrationSource } from "@/server/adapter/sheets/registration";
import { REGISTRATION_COLUMNS } from "@/server/adapter/registrationSchema";
import { requireAuth, requireRole, type Session } from "@/lib/auth";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { assertRowIndex, assertScalarValue } from "@/lib/validation";
import { record, type AuditLog } from "@/lib/audit";

/**
 * GET /api/registration/data — viewer. Return normalized registration rows.
 */
export async function getRegistrationController(
  session: Session | null,
  source: () => RegistrationSource,
): Promise<Response> {
  try {
    requireAuth(session);
    const src = source();
    const rows = await src.fetch();
    return new Response(JSON.stringify({ ok: true, table: "registration", rows }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Validate a column name against the live registration schema headers. */
function assertRegistrationColumn(column: unknown): string {
  if (typeof column !== "string" || column.trim() === "") {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "column must be a non-empty string.");
  }
  if (!REGISTRATION_COLUMNS.includes(column)) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, `Unknown column '${column}' for table 'registration'.`);
  }
  return column;
}

/**
 * PATCH /api/registration/data — editor. Update one cell in the registration
 * workbook (Form Responses 1) by exact column header. Mirrors
 * `updateCellController` but is bound to the REGISTRATION source instead of
 * the master TAB_SCHEMAS, so the registration column set is validated against
 * REGISTRATION_COLUMNS (never TAB_SCHEMAS — registration is a separate source).
 *
 * `source` is a LAZY factory (like the GET controller) so an unauthenticated /
 * unauthorized request errors out BEFORE we construct the env-dependent
 * registration source.
 */
export async function updateRegistrationCellController(
  session: Session | null,
  source: () => RegistrationSource,
  body: { rowIndex?: unknown; column?: unknown; value?: unknown } | null | undefined,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Request body must be a JSON object.");
    }
    const rowIndex = assertRowIndex(body.rowIndex);
    const column = assertRegistrationColumn(body.column);
    const value = assertScalarValue(body.value);
    const src = source();
    const res = await src.updateCell(rowIndex, column, value);
    if (!res.ok) {
      const message = res.code === "COLUMN_NOT_FOUND" ? `Unknown column '${column}'.` : "Sheet operation failed.";
      throw apiError(ErrorCodes.ADAPTER_FAILED, message, { code: res.code, message: res.message });
    }
    record(auditLog, {
      actor: session!.identity,
      operation: "update",
      tableKey: "registration",
      targetResource: `registration.${column}@row${rowIndex}`,
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