"use client";
/**
 * Website workspace (read-only) — route at /website.
 * Phase E port of pages/3_Website.py. This shell owns the session gate +
 * data access (GET /api/tables/website via useApi) + shell layout; the
 * presentational body lives in @/workspaces/WebsiteDashboard.
 *
 * Empty state (V3): topbar + hero + EmptyState "Data website tidak tersedia.", stop.
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { columnsFor } from "@/server/adapter/schema";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/sections/EmptyState";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { WorkspaceBody } from "@/components/layout/WorkspaceBody";
import { WebsiteDashboard } from "@/workspaces/WebsiteDashboard";

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
          Signed-in session required to view the Website workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function WebsitePage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/website", (d) => d.rows.length === 0);

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

  // Empty -> V3 empty state, stop.
  if (status === "empty" || !table.data) {
    return (
      <WorkspaceBody>
          <ModuleHero icon="🌐" title="Website / SEO" desc="Fulfilment konten per pilar & audit pending." />
          <EmptyState title="Data website tidak tersedia." hint="Import laporan untuk mulai." />
      </WorkspaceBody>
    );
  }

  // Ready -> presentational dashboard (includes its own layout container).
  return (
      <WebsiteDashboard rows={table.data.rows} columns={columnsFor("website")} onRefresh={table.refetch} />
  );
}