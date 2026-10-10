"use client";
/**
 * CRM workspace (read + WA→CRM sync + client-side import + Mekari export) —
 * route at /crm (V3 pages/5_CRM.py). This shell owns the session gate + data
 * access (GET /api/tables/crm via useApi) + shell layout; the presentational
 * body (sync/import, filters, metrics, table, export, refresh) lives in
 * @/workspaces/CrmDashboard.
 *
 * Empty state is handled INSIDE the dashboard (V3 renders sync/import, then
 * empty_state + footer and stops) — so empty rows still flow into the dashboard.
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { columnsFor } from "@/server/adapter/schema";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { WorkspaceBody } from "@/components/layout/WorkspaceBody";
import { CrmDashboard } from "@/workspaces/CrmDashboard";

interface AuthMe { ok: boolean; identity: string; role: string }
interface TableApi { ok: boolean; table: string; rows: Record<string, unknown>[] }

function isAuthFailure(f?: ApiFailure): boolean {
  return f?.code === "AUTH_FAILED" || f?.code === "FORBIDDEN";
}

function AuthGate() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 shadow-[var(--dm-shadow)]">
        <div className="text-[1.35rem] font-extrabold text-ink">Sign in to continue</div>
        <p className="mt-2 text-[0.95rem] leading-[1.5] text-muted">
          Signed-in session required to view the CRM workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function CrmPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/crm", (d) => d.rows.length === 0);

  const authed = auth.status === "ready";
  const gateOpen = auth.status === "error" && isAuthFailure(auth.error);

  // Session still resolving -> full-page spinner.
  if (auth.status === "loading" || (!authed && !gateOpen)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md">
        <div className="w-72 rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
          <LoadingState variant="card" />
        </div>
      </div>
    );
  }
  // 401/403 -> sign-in prompt.
  if (gateOpen) {
    return <AuthGate />;
  }

  const status = table.status;

  // Data error -> ErrorState with retry.
  if (status === "error" && table.error) {
    return (
      <WorkspaceBody>
          <ErrorState failure={table.error} onRetry={table.refetch} />
      </WorkspaceBody>
    );
  }

  // Data loading -> skeleton body.
  if (status === "loading" || (status === "ready" && !table.data)) {
    return (
      <WorkspaceBody>
          <LoadingState variant="card" />
      </WorkspaceBody>
    );
  }

  // Empty OR ready -> dashboard (empty rows render sync/import + empty state).
  const rows = table.data?.rows ?? [];
  return (
      <CrmDashboard
        rows={rows}
        columns={columnsFor("crm")}
        onRefresh={table.refetch}
      />
  );
}