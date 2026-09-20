/**
 * Ads metrics controller (Phase E — workspace 5).
 *
 * Mirrors the Phase D overview route: the browser must NOT reimplement `roi()`.
 * All ROI math runs SERVER-SIDE by reusing the pure `roi()` from
 * src/server/metrics/metrics.ts. The controller reads the four source tabs the
 * pure function needs (wa_admin + the ad-cost tabs tiktok/meta/mekari) and
 * returns the final scalar set for the Ads "ROI Overview" band.
 *
 *   GET /api/ads/metrics — viewer.
 *
 * Per-platform KPIs (spend/leads/closing/CPL for TikTok & Meta, Mekari
 * interaction/biaya) stay as pure derivations in src/workspaces/ads.ts operating
 * on the rows the page already fetched via GET /api/tables/* — that mirrors V3
 * page logic exactly and is NOT a reimplementation of roi.
 */
import type { SheetSource } from "@/server/adapter/source";
import { requireAuth, type Session } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { roi } from "@/server/metrics/metrics";

export interface AdsMetricsPayload {
  ok: boolean;
  metrics: {
    spend: number;
    leads: number;
    closing: number;
    cac: number;
    roas: number;
    omzet: number;
  };
}

export async function adsMetricsController(
  session: Session | null,
  source: SheetSource,
): Promise<Response> {
  try {
    requireAuth(session);
    const [wa, tiktok, meta, mekari] = await Promise.all([
      source.fetchTable("wa_admin"),
      source.fetchTable("ads_tiktok"),
      source.fetchTable("ads_meta"),
      source.fetchTable("mekari"),
    ]);
    const r = roi(wa, tiktok, meta, mekari);
    const payload: AdsMetricsPayload = {
      ok: true,
      metrics: {
        spend: r.spend,
        leads: r.leads,
        closing: r.closing,
        cac: r.cac,
        roas: r.roas,
        omzet: r.omzet,
      },
    };
    return Response.json(payload, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}