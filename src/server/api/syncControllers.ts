/**
 * Sync API controller (POST /api/sync/wa-to-crm).
 *
 * Thin wrapper around the EXISTING Phase B `source.syncWaToCrm()` business
 * logic (junk filter, phone normalization, dedupe, header-based mapping, B1
 * fix) — no duplicate business logic here. Editor role required. Audited.
 */

import { requireRole, type Session } from "@/lib/auth";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { record, type AuditLog } from "@/lib/audit";
import type { ApiSource } from "./types";

/**
 * POST /api/sync/wa-to-crm — editor. Run the WA->CRM sync and return a summary.
 */
export async function syncController(
  session: Session | null,
  source: ApiSource,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    const summary = await source.syncWaToCrm();
    record(auditLog, {
      actor: session!.identity,
      operation: "sync",
      tableKey: "crm",
      targetResource: "wa_admin -> crm",
      success: summary.ok,
      summary: summary.message,
    });
    if (!summary.ok) {
      // Business-level failure (e.g. no data / missing 'No Hp') — 422-style
      // but constrained to our error contract: map to VALIDATION_FAILED.
      throw apiError(ErrorCodes.VALIDATION_FAILED, summary.message);
    }
    return new Response(
      JSON.stringify({
        ok: true,
        message: summary.message,
        added: summary.added,
        skipped: summary.skipped,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}