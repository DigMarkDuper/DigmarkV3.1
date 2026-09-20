"use client";
/**
 * WhatsApp Admin workspace (read-only) — route at /wa-admin.
 * Phase E port of pages/4_WA_Admin.py. This shell owns the session gate +
 * data access (GET /api/tables/wa_admin via useApi) + shell layout; the
 * presentational body lives in @/workspaces/WaAdminDashboard.
 *
 * Empty state (V3): topbar + hero + EmptyState "Data WA Admin tidak tersedia.", stop.
 * The post-JUNK-filter empty state ("Semua data berisi kategori...") is handled
 * inside the dashboard once rows resolve non-empty.
 */
import { useState } from "react";
import { useApi, type ApiFailure } from "@/lib/api-client";
import { columnsFor } from "@/server/adapter/schema";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/sections/EmptyState";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { WaAdminDashboard } from "@/workspaces/WaAdminDashboard";

interface AuthMe { ok: boolean; identity: string; role: string }
interface TableApi { ok: boolean; table: string; rows: Record<string, unknown>[] }
interface RegistrationApi { ok: boolean; table: string; rows: Record<string, unknown>[] }

function isAuthFailure(f?: ApiFailure): boolean {
  return f?.code === "AUTH_FAILED" || f?.code === "FORBIDDEN";
}

function AuthGate() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-md px-4">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8 shadow-[var(--dm-shadow)]">
        <div className="text-[1.35rem] font-extrabold text-ink">Sign in to continue</div>
        <p className="mt-2 text-[0.95rem] leading-[1.5] text-muted">
          Signed-in session required to view the WhatsApp Admin workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function WaAdminPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/wa_admin", (d) => d.rows.length === 0);
  const registration = useApi<RegistrationApi>("/api/registration/data", (d) => d.rows.length === 0);

  // Buffer the last successfully-loaded rows so a refetch (status -> "loading",
  // data -> undefined) never unmounts the dashboard. This keeps the WaAdminEditData
  // modal + its success toast mounted across onRefresh after a save. New rows are
  // buffered via the render-time "adjust state when a fresh payload lands" pattern
  // (no effect, so react-hooks/set-state-in-effect stays satisfied).
  const [lastRows, setLastRows] = useState<Record<string, unknown>[] | null>(null);
  const [prevTable, setPrevTable] = useState<TableApi | undefined>(table.data);
  if (table.status === "ready" && table.data?.rows?.length && table.data !== prevTable) {
    setPrevTable(table.data);
    setLastRows(table.data.rows);
  }

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
      <div className="mx-auto w-full min-w-0 max-w-[1720px] px-4 sm:px-6 lg:px-8">
        <Topbar />
        <WorkspaceNav activeUrl="wa-admin" />
        <main className="mx-auto mt-6 max-w-[1700px]">
          <ErrorState failure={table.error} onRetry={table.refetch} />
        </main>
        <Footer />
      </div>
    );
  }

  // Data loading with NO prior data (initial fetch) -> skeleton body. When stale
    // rows are buffered, a refetch falls through to the dashboard so the edit modal
    // + success toast stay mounted.
    const initialLoading =
        (status === "loading" || (status === "ready" && !table.data)) && !lastRows;
    if (initialLoading) {
      return (
        <div className="mx-auto w-full min-w-0 max-w-[1720px] px-4 sm:px-6 lg:px-8">
          <Topbar />
          <WorkspaceNav activeUrl="wa-admin" />
          <main className="mx-auto mt-6 max-w-[1700px]">
            <LoadingState variant="card" />
          </main>
          <Footer />
        </div>
      );
    }

    // Empty / no data (with nothing stale to show) -> V3 empty state, stop.
    if ((status === "empty" || !table.data) && !lastRows) {
      return (
        <div className="mx-auto w-full min-w-0 max-w-[1720px] px-4 sm:px-6 lg:px-8">
          <Topbar />
          <WorkspaceNav activeUrl="wa-admin" />
          <main className="mx-auto mt-6 max-w-[1700px]">
            <ModuleHero
              icon="💬"
              title="WhatsApp Admin"
              desc="Leads masuk, funnel closing, dan distribusi status."
            />
            <EmptyState title="Data WA Admin tidak tersedia." hint="Periksa source data atau filter." />
          </main>
          <Footer />
        </div>
      );
    }

    // Ready (or refetching against buffered rows) -> presentational dashboard
    // (includes its own layout container). New rows land via the lastRows buffer.
    const rows = table.data?.rows ?? lastRows ?? [];
    return (
      <>
        <Topbar />
        <div className="mx-auto w-full max-w-[1720px] px-4 pt-5 sm:px-6 lg:px-8">
          <WorkspaceNav activeUrl="wa-admin" />
        </div>
        <WaAdminDashboard
          rows={rows}
          columns={columnsFor("wa_admin")}
          registrationRows={registration.status === "ready" && registration.data ? registration.data.rows : []}
          onRefresh={table.refetch}
        />
        <Footer />
      </>
    );
  }