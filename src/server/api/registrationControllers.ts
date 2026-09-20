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
import { requireAuth, type Session } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

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