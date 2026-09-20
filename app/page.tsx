"use client";
/**
 * Overview / Command Center (UI_DESIGN_SPEC.md §D) — Phase D.
 *
 * Rendering order (fixed, matches V3 1_Overview.py):
 *   topbar → Hero(command-center w/ visual panel) → divider →
 *   "Explore Your Workspace" module grid → divider →
 *   "Quick Insight" stat band → footer.
 *
 * Data-access (spec §D.2): the browser NEVER touches Sheets and NEVER computes
 * business metrics. All scalars arrive from the Phase C API:
 *   - GET /api/auth/me            -> auth gate (full-page spinner, then shell)
 *   - GET /api/overview/metrics   -> hero closing/ROAS + Quick Insight scalars
 *   - GET /api/meta/tabs          -> drift banner (hidden until resolved)
 * Widgets render from the static MODULES registry, not an API call.
 * States handled per section: loading skeletons / empty "—" / ErrorState+Retry.
 */
import { MODULES } from "@/config/constants";
import { useApi, type ApiFailure } from "@/lib/api-client";
import {
  formatCount,
  formatPercent,
  formatRoas,
  formatRupiah,
} from "@/components/ui-common";
import { Topbar } from "@/components/layout/Topbar";
import { Hero } from "@/components/layout/Hero";
import { Footer } from "@/components/layout/Footer";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/grid/WorkspaceSection";
import { SectionHead } from "@/components/sections/SectionHead";
import { SalesFunnelCard } from "@/components/metrics/SalesFunnelCard";
import { LoadingState } from "@/components/sections/LoadingState";
import { EmptyState } from "@/components/sections/EmptyState";
import { ErrorState } from "@/components/sections/ErrorState";
import { ProspectMapSection } from "@/components/metrics/ProspectMapSection";

interface AuthMe { ok: boolean; identity: string; role: string }
interface FunnelPayload {
  reach: number; views: number; linkClick: number; interaction: number; profileVisit: number;
  lead: number; daftar: number; closing: number; spend: number;
  reachToClickRate: number | null; clickToLeadRate: number | null;
  leadToDaftarRate: number | null; daftarToClosingRate: number | null; overallRate: number | null;
}
interface Metrics {
  leads: number; closing: number; conversion: number;
  spend: number; cac: number; roas: number; omzet: number;
}
interface MetricsApi { ok: boolean; metrics: Metrics; funnel: FunnelPayload }
interface MetaTabs { ok: boolean; tabs: { drift: boolean }[]; drift: boolean }
interface TableApi<T> { ok: boolean; table: string; rows: T[] }

const SECTION_SUB = "Ringkasan angka penting, live dari data.";

/** True when the failure is an auth/session problem (445-byte contract code). */
function isAuthFailure(f?: ApiFailure): boolean {
  return f?.code === "AUTH_FAILED" || f?.code === "FORBIDDEN";
}

function DriftBanner({ drift }: { drift: boolean }) {
  if (!drift) return null;
  return (
    <div role="status" className="mx-auto mt-3 flex max-w-[1180px] items-start gap-2 rounded-[12px] border border-warning/40 bg-warning/10 px-4 py-2 text-[0.86rem] font-semibold text-warning">
      <span aria-hidden>⚠</span>
      <span>Několiko tab telah mengubah struktur — data mungkin stale.</span>
    </div>
  );
}

/** Full-page glass gate shown while the session is unauthenticated. */
function AuthGate() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 shadow-[var(--dm-shadow)]">
        <div className="text-[1.35rem] font-extrabold text-ink">Sign in to continue</div>
        <p className="mt-2 text-[0.95rem] leading-[1.5] text-muted">
          DIGMARK runs on live data from Google Sheets. Sign in with your team credentials to open the Command Center.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function Overview() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const metrics = useApi<MetricsApi>("/api/overview/metrics", (m) =>
    m.metrics.leads === 0 && m.metrics.closing === 0 && m.metrics.spend === 0);
  const meta = useApi<MetaTabs>("/api/meta/tabs", (t) => !t.drift);
  const waAdmin = useApi<TableApi<Record<string, unknown>>>(
    "/api/tables/wa_admin",
    (d) => !d.rows.length,
  );

  const authed = auth.status === "ready";
  const gateOpen = auth.status === "error" && isAuthFailure(auth.error);

  const metricStatus = metrics.status;
  const m = metrics.data?.metrics;
  const healthy = metricStatus === "ready" && m !== undefined;
  const empty = metricStatus === "empty";

  // Final scalar display strings (V3 formatting).
  const closingStr = healthy ? formatCount(m!.closing) : "—";
  const roasStr = healthy ? formatRoas(m!.roas, m!.spend > 0) : "—";
  const live = healthy || empty;

  // Quick Insight Sales Funnel — server-side scalars formatted for the card.
  // The component only renders these pre-formatted strings; when not healthy
  // (empty/zero) every slot shows the "—" fallback.
  const pctLabel = (v: number | null) => (v !== null ? formatPercent(v, true) : "—");
  const fun = healthy && metrics.data ? metrics.data.funnel : null;
  const funnelStages = [
    { name: "AWARENESS", value: fun ? formatCount(fun.reach) : "—", sub: fun ? `Views ${formatCount(fun.views)}` : undefined },
    { name: "INTENT", value: fun ? formatCount(fun.linkClick) : "—" },
    { name: "LEAD", value: fun ? formatCount(fun.lead) : "—" },
    { name: "DAFTAR", value: fun ? formatCount(fun.daftar) : "—" },
    { name: "CLOSING", value: fun ? formatCount(fun.closing) : "—" },
  ];
  const funnelConnectors = [
    { rate: fun ? pctLabel(fun.reachToClickRate) : "—" },
    { rate: fun ? pctLabel(fun.clickToLeadRate) : "—" },
    { rate: fun ? pctLabel(fun.leadToDaftarRate) : "—" },
    { rate: fun ? pctLabel(fun.daftarToClosingRate) : "—" },
  ];
  const funnelOverall = fun ? pctLabel(fun.overallRate) : "—";
  const funnelSupports = [
    { name: "Views", value: fun ? formatCount(fun.views) : "—" },
    { name: "Interaksi", value: fun ? formatCount(fun.interaction) : "—" },
    { name: "Profile Visit", value: fun ? formatCount(fun.profileVisit) : "—" },
    { name: "Ad Spend", value: fun ? formatRupiah(fun.spend) : "—" },
  ];

  return (
    <div className="mx-auto max-w-[1220px] px-4">
      <Topbar />

      {/* Drift banner (meta resolves async; hidden until ready). */}
      {meta.status === "ready" && meta.data ? <DriftBanner drift={meta.data.drift} /> : null}

      <main className="mx-auto max-w-[1180px]">
        {/* Hero — always renders brand first; stats degrade per spec D.2. */}
        <Hero
          closing={closingStr}
          roas={roasStr}
          moduleCount={MODULES.length}
          live={live}
          loading={metricStatus === "loading"}
        />

        <Divider />

        {/* Explore Your Workspace — static registry grid (no fetch → instant). */}
        <WorkspaceSection id="workspace" />

        <Divider />

        {/* Quick Insight — live stat band. */}
        <SectionHead
          title="Quick Insight"
          sub={SECTION_SUB}
        />

        {metrics.error && metricStatus === "error" ? (
          <div className="mt-6 p-2">
            <ErrorState failure={metrics.error} onRetry={metrics.refetch} />
          </div>
        ) : metricStatus === "loading" ? (
          <SalesFunnelCard
            loading
            stages={[]}
            connectors={[]}
            supports={[]}
          />
        ) : (
          <SalesFunnelCard
            stages={funnelStages}
            connectors={funnelConnectors}
            overall={funnelOverall}
            supports={funnelSupports}
          />
        )}

        {/* Cache-busting refresh (refetches metrics + tab health + wa_admin). */}
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={() => { metrics.refetch(); meta.refetch(); waAdmin.refetch(); }}>
            🔄 Refresh Data
          </Button>
        </div>

        {/* Persebaran Asal Prospek — wa_admin driven interactive Indonesia map. */}
        <div className="mt-10">
          <SectionHead
            title="Persebaran Asal Prospek"
            sub="Distribusi prospek berdasarkan asal wilayah di Indonesia, live dari data WA Admin."
          />
          <div className="mt-5">
            {waAdmin.status === "error" ? (
              <ErrorState failure={waAdmin.error!} onRetry={waAdmin.refetch} />
            ) : waAdmin.status === "loading" ? (
              <div className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)]">
                <LoadingState variant="card" />
              </div>
            ) : waAdmin.status === "empty" || !waAdmin.data?.rows.length ? (
              <EmptyState title="Belum ada data asal prospek" hint="Data wa_admin masih kosong pada periode ini." />
            ) : (
              <ProspectMapSection rows={waAdmin.data.rows} />
            )}
          </div>
        </div>

        <Footer />
      </main>

      {/* Auth gate: full-page spinner while resolving; prompt card when 401/403. */}
      {auth.status === "loading" || (!authed && !gateOpen) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md">
          <div className="w-72 rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
            <LoadingState variant="card" />
          </div>
        </div>
      ) : gateOpen ? (
        <AuthGate />
      ) : null}
    </div>
  );
}