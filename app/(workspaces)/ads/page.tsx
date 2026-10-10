"use client";
/**
 * Ads workspace — route at /ads. Phase E port of pages/7_Ads.py.
 * This shell owns the session gate + data access:
 *   - GET /api/auth/me          -> role (clear controls need editor)
 *   - GET /api/ads/metrics      -> ROI scalars (server-side roi())
 *   - GET /api/tables/{ads_tiktok|ads_meta|mekari|wa_admin}
 * The presentational body (ROI Overview, tabs, KPIs, import, guarded clear,
 * refresh) lives in @/workspaces/AdsDashboard.
 *
 * The destructive clear + all writes go ONLY through the API and are never
 * performed in the browser (server enforces editor role, confirm:true, and the
 * exact schema tab title, then the adapter re-guards).
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { columnsFor } from "@/server/adapter/schema";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { WorkspaceBody } from "@/components/layout/WorkspaceBody";
import { AdsDashboard, type AdsMetrics } from "@/workspaces/AdsDashboard";

interface AuthMe { ok: boolean; identity: string; role: string }
interface TableApi { ok: boolean; table: string; rows: Record<string, unknown>[] }
interface MetricsApi { ok: boolean; metrics: AdsMetrics }

function isAuthFailure(f?: ApiFailure): boolean {
  return f?.code === "AUTH_FAILED" || f?.code === "FORBIDDEN";
}

function AuthGate() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-surface p-8 shadow-[var(--dm-shadow)]">
        <div className="text-[1.35rem] font-extrabold text-ink">Sign in to continue</div>
        <p className="mt-2 text-[0.95rem] leading-[1.5] text-muted">
          Signed-in session required to view the Ads workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function AdsPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const metrics = useApi<MetricsApi>("/api/ads/metrics", (d) =>
    d.metrics.spend === 0 && d.metrics.leads === 0 && d.metrics.closing === 0);
  const tiktok = useApi<TableApi>("/api/tables/ads_tiktok", (d) => d.rows.length === 0);
  const meta = useApi<TableApi>("/api/tables/ads_meta", (d) => d.rows.length === 0);
  const mekari = useApi<TableApi>("/api/tables/mekari", (d) => d.rows.length === 0);
  const wa = useApi<TableApi>("/api/tables/wa_admin", (d) => d.rows.length === 0);

  const authed = auth.status === "ready";
  const gateOpen = auth.status === "error" && isAuthFailure(auth.error);

  // Session still resolving -> full-page spinner.
  if (auth.status === "loading" || (!authed && !gateOpen)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40">
        <div className="w-72 rounded-[10px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
          <LoadingState variant="card" />
        </div>
      </div>
    );
  }
  // 401/403 -> sign-in prompt.
  if (gateOpen) {
    return <AuthGate />;
  }

  // Data error (any table or metrics) -> ErrorState with retry.
  const anyError =
    tiktok.status === "error" || meta.status === "error" ||
    mekari.status === "error" || wa.status === "error" || metrics.status === "error";
  const firstError =
    (tiktok.error ?? meta.error ?? mekari.error ?? wa.error ?? metrics.error);
  if (anyError && firstError) {
    return (
      <WorkspaceBody>
        <ErrorState failure={firstError} onRetry={metrics.refetch} />
      </WorkspaceBody>
    );
  }

  // Data loading -> skeleton body.
  const loading =
    metrics.status === "loading" || tiktok.status === "loading" ||
    meta.status === "loading" || mekari.status === "loading" || wa.status === "loading";
  if (loading) {
    return (
      <WorkspaceBody>
        <LoadingState variant="card" />
      </WorkspaceBody>
    );
  }

  const role = auth.data?.role ?? "viewer";
  const metricsScalar = metrics.data?.metrics;

  // The shell (sidebar/topbar/gutter/footer) is owned by
  // app/(workspaces)/layout.tsx; AdsDashboard already owns its width container.
  return (
    <AdsDashboard
          tiktokRows={tiktok.data?.rows ?? []}
          metaRows={meta.data?.rows ?? []}
          mekariRows={mekari.data?.rows ?? []}
          waRows={wa.data?.rows ?? []}
          metrics={metricsScalar ?? null}
          columns={{
            tiktok: columnsFor("ads_tiktok"),
            meta: columnsFor("ads_meta"),
            mekari: columnsFor("mekari"),
          }}
          role={role}
      onRefresh={() => { tiktok.refetch(); meta.refetch(); mekari.refetch(); wa.refetch(); metrics.refetch(); }}
    />
  );
}