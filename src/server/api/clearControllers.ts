/**
 * Clear API controller (POST /api/clear/[key]) — DESTRUCTIVE.
 *
 * Layered server-side guards before the guarded adapter clear:
 *  1. Editor role required (403 for viewers) — enforced here.
 *  2. Body must carry `confirm: true` AND `tabTitle` matching the table's
 *     declared schema tab (400 otherwise).
 *  3. The adapter's own `clearSheet` re-guards (confirmed + appKey/tabTitle
 *     match) as defense-in-depth; it cannot be bypassed from the browser.
 * Audit entry records who initiated + which table.
 */

import type { SheetSource } from "@/server/adapter/source";
import { TAB_SCHEMAS } from "@/server/adapter/schema";
import { requireRole, type Session } from "@/lib/auth";
import { assertKnownTableKey } from "@/lib/validation";
import { apiError, ErrorCodes, toErrorResponse } from "@/lib/errors";
import { record, type AuditLog } from "@/lib/audit";

interface ClearBody {
  confirm?: unknown;
  tabTitle?: unknown;
}

/**
 * POST /api/clear/[key] — editor. Clear a table with explicit confirmation.
 */
export async function clearController(
  session: Session | null,
  source: SheetSource,
  key: string,
  body: ClearBody | null | undefined,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    const s = requireRole(session, "editor");
    assertKnownTableKey(key);
    const schema = TAB_SCHEMAS[key];
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Request body must be a JSON object.");
    }
    if (body.confirm !== true) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Clearing a table requires `confirm: true`.");
    }
    if (typeof body.tabTitle !== "string" || body.tabTitle !== schema.tab) {
      throw apiError(
        ErrorCodes.VALIDATION_FAILED,
        `tabTitle must exactly match the declared tab '${schema.tab}'.`,
      );
    }
    const res = await source.clearTable(key, {
      appKey: key,
      tabTitle: schema.tab,
      confirmed: true,
      actor: s.identity,
    });
    record(auditLog, {
      actor: s.identity,
      operation: "clear",
      tableKey: key,
      targetResource: schema.tab,
      success: res.ok,
      summary: res.ok ? `Cleared '${schema.tab}'.` : `Clear failed: ${res.message ?? "unknown"}`,
    });
    if (!res.ok) {
      throw apiError(ErrorCodes.ADAPTER_FAILED, "Clear failed.", { code: res.code, message: res.message });
    }
    return new Response(
      JSON.stringify({ ok: true, message: `Cleared '${schema.tab}'.` }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}