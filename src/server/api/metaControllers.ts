/**
 * Metadata API controller (GET /api/meta/tabs).
 *
 * Returns safe tab metadata (appKey, title, gid, drift) for drift monitoring.
 * Never returns credentials or auth internals.
 */

import type { SheetSource } from "@/server/adapter/source";
import { requireAuth, type Session } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";

/**
 * GET /api/meta/tabs — viewer. Return tab metadata + aggregate drift flag.
 */
export async function tabsMetaController(session: Session | null, source: SheetSource): Promise<Response> {
  try {
    requireAuth(session);
    const tabs = await source.listTabs();
    const safeTabs = tabs.map((t) => ({
      appKey: t.appKey,
      title: t.title,
      gid: t.gid,
      drift: t.drift,
    }));
    return new Response(
      JSON.stringify({ ok: true, tabs: safeTabs, drift: safeTabs.some((t) => t.drift) }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}