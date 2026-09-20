/**
 * Overview metrics controller (Phase D + Quick Insight Sales Funnel revision).
 *
 * The Overview must receive FINAL scalar values — the funnel/ROI math runs
 * SERVER-SIDE only (spec §D.2), reusing the pure functions in
 * src/server/metrics/metrics.ts and the workspace derivations. The browser
 * never computes business metrics.
 *
 *   GET /api/overview/metrics — viewer.
 *   Reads the source tabs the pure metric layer needs (wa_admin, insight +
 *   the ad-cost tabs tiktok/meta/mekari) plus the SECOND spreadsheet's
 *   registration rows (via a lazy factory) and returns the scalar KPI set for
 *   the Overview hero + the Quick Insight Sales Funnel band.
 *
 * Auth gate runs FIRST (before the registration factory is ever invoked) so a
 * missing REGISTRATION_SPREADSHEET_KEY can never preempt a 401.
 */
import type { RegistrationSource } from "@/server/adapter/sheets/registration";
import type { SheetSource } from "@/server/adapter/source";
import { requireAuth, type Session } from "@/lib/auth";
import { toErrorResponse } from "@/lib/errors";
import { roi } from "@/server/metrics/metrics";
import { deriveWaAdminStats } from "@/workspaces/waAdmin";
import { sumMetrics } from "@/workspaces/insight";
import { countPendaftar, filterByYear, registrationYears } from "@/workspaces/registration";

export interface OverviewFunnelPayload {
  reach: number;
  views: number;
  linkClick: number;
  interaction: number;
  profileVisit: number;
  lead: number;
  daftar: number;
  closing: number;
  spend: number;
  /** How `closing` is measured. Always "status==closing pre-junk" (the shared
   *  exact predicate over source rows, matching /wa-admin). */
  closingDefinition: string;
  /** Reach → Click (linkClick/reach*100); null when reach is 0. */
  reachToClickRate: number | null;
  /** Click → Lead (lead/linkClick*100); null when linkClick is 0. */
  clickToLeadRate: number | null;
  /** Lead → Daftar (daftar/lead*100); null when lead is 0. */
  leadToDaftarRate: number | null;
  /** Daftar → Closing (closing/daftar*100); null when daftar is 0. */
  daftarToClosingRate: number | null;
  /** Overall Lead → Closing (closing/lead*100); null when lead is 0. */
  overallRate: number | null;
}

export interface OverviewMetricsPayload {
  ok: boolean;
  metrics: {
    leads: number;
    closing: number;
    conversion: number;
    spend: number;
    cac: number;
    roas: number;
    omzet: number;
  };
  funnel: OverviewFunnelPayload;
}

/** Linear stage rate (numerator/denominator*100), or null on a zero denominator. */
function linearRate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return (n / d) * 100;
}

export async function overviewMetricsController(
  session: Session | null,
  source: SheetSource,
  registrationSource: () => RegistrationSource,
): Promise<Response> {
  try {
    requireAuth(session);
    const [wa, tiktok, meta, mekari, ins] = await Promise.all([
      source.fetchTable("wa_admin"),
      source.fetchTable("ads_tiktok"),
      source.fetchTable("ads_meta"),
      source.fetchTable("mekari"),
      source.fetchTable("insight"),
    ]);
    const regRows = await registrationSource().fetch();

    const waStats = deriveWaAdminStats(wa);
    // Hero/scalar source of truth = the WA Admin derivations: leads = post-junk
    // total, closing = EXACT "closing" measured over SOURCE (pre-junk) rows.
    // roi(wa, ...) therefore receives the RAW wa rows so its internal closing
    // (and the derived omzet/cac/roas) is the SAME pre-junk exact value — the
    // metrics.funnel+metrics block and /wa-admin can never disagree.
    const r = roi(wa, tiktok, meta, mekari);
    const im = sumMetrics(ins);

    // Daftar = countPendaftar of the LATEST year (owner decision), not all-time.
    const years = registrationYears(regRows);
    const latestYear = years.length ? Math.max(...years) : null;
    const daftar = latestYear === null ? 0 : countPendaftar(filterByYear(regRows, latestYear));

    const lead = waStats.total; // /admin-wa "Total Pesan", post-junk
    const closing = waStats.closing; // STATUS == "closing", EXACT, pre-junk
    const conversion = lead ? (closing / lead) * 100 : 0;

    const payload: OverviewMetricsPayload = {
      ok: true,
      metrics: {
        leads: lead,
        closing,
        conversion,
        spend: r.spend,
        cac: r.cac,
        roas: r.roas,
        omzet: r.omzet,
      },
      funnel: {
        reach: im.reach,
        views: im.views,
        linkClick: im.linkClicks,
        interaction: im.contentInteraction,
        profileVisit: im.profileVisit,
        lead,
        daftar,
        closing,
        spend: r.spend,
        closingDefinition: "status==closing pre-junk",
        reachToClickRate: linearRate(im.linkClicks, im.reach),
        clickToLeadRate: linearRate(lead, im.linkClicks),
        leadToDaftarRate: linearRate(daftar, lead),
        daftarToClosingRate: linearRate(closing, daftar),
        overallRate: linearRate(closing, lead),
      },
    };
    return Response.json(payload, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}