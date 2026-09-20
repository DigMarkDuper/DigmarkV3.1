import { NextRequest } from "next/server";
import { insightImportController } from "@/server/api/insightImportControllers";
import { getMasterSource, getDefaultAuditLog } from "@/server/api/context";
import { getSession } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/**
 * POST /api/insight/import — editor.
 *
 * Body: { files: [{ name, contentB64 }], platform?: 'Instagram'|'TikTok',
 *        confirm?: boolean, mode?: 'new'|'all' }
 * confirm=false (default) returns a preview + counts with NO write.
 * confirm=true appends the chosen set to the Insight tab + audit-logs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await insightImportController(getSession(request), getMasterSource(), body, getDefaultAuditLog());
  } catch (err) {
    return toErrorResponse(err);
  }
}