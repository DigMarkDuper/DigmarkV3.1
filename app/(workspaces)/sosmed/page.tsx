"use client";
/**
 * Sosmed workspace (read + inline PATCH editor) — route at /sosmed
 * (V3 pages/2_Sosmed.py). This shell owns the session gate + data access
 * (GET /api/tables/sosmed via useApi) + a second read of the new
 * content_plan tab (spec §1.2), + shell layout; the presentational body
 * (filters, metrics, workload, Content Planner, Master Content Explorer,
 * inline editor) lives in @/workspaces/SosmedDashboard.
 *
 * isEditor is derived from GET /api/auth/me (role === editor) so the Dashboard
 * renders the Save control only for editors; the server also 403s a viewer PATCH.
 *
 * Buffered-refresh (§6.1): both refetches (sosmed + plan) are buffered so a
 * refetch that flips to `loading` does NOT unmount the dashboard (and its open
 * modal/drawer/toast) mid-save. Full LoadingState/ErrorState render only when
 * nothing has ever loaded.
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { SosmedDashboard } from "@/workspaces/SosmedDashboard";

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
          Signed-in session required to view the Social Media workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function SosmedPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/sosmed", (d) => d.rows.length === 0);
  const plan = useApi<TableApi>("/api/tables/content_plan", (d) => d.rows.length === 0);

  // Buffered last-loaded rows so a refetch that momentarily reports loading does
  // NOT unmount the dashboard (and its open modal/drawer/toast) mid-save (§6.1).
  // Populated in the event-handler refetch wrapper (never during render), then
  // read here so full LoadingState/ErrorState render only when nothing has loaded.
  const [lastRows, setLastRows] = useState<Record<string, unknown>[]>([]);
  const [lastPlanRows, setLastPlanRows] = useState<Record<string, unknown>[]>([]);

  const rows = table.data && table.data.rows.length ? table.data.rows : lastRows;
  const planRows = plan.data && plan.data.rows.length ? plan.data.rows : lastPlanRows;
  const onRefresh = () => {
    if (table.data && table.data.rows.length) setLastRows(table.data.rows);
    if (plan.data && plan.data.rows.length) setLastPlanRows(plan.data.rows);
    table.refetch();
    plan.refetch();
  };

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

  // Data error with nothing buffered -> ErrorState with retry.
  if (table.status === "error" && table.error && rows.length === 0) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="sosmed" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <ErrorState failure={table.error} onRetry={onRefresh} />
        </main>
        <Footer />
      </div>
    );
  }

  // Loading with nothing buffered -> skeleton body.
  if (table.status === "loading" && rows.length === 0) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="sosmed" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <LoadingState variant="card" />
        </main>
        <Footer />
      </div>
    );
  }

  const isEditor = auth.data?.role === "editor";
  return (
    <>
      <Topbar />
      {/* Match /website ready-branch placement: nav stays inside the capped body container. */}
      <div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="sosmed" />
      </div>
      <SosmedDashboard rows={rows} planRows={planRows} isEditor={isEditor} onRefresh={onRefresh} />
      <Footer />
    </>
  );
}