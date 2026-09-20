"use client";
import { useEffect, useState } from "react";
/**
 * Insight workspace (read-only analytics) — route at /insight
 * Sourced from the INSIGHT tab of Master Data (GET /api/tables/insight).
 * This shell owns the session gate + data access + shell layout; the presentational
 * body (filters, KPI, funnel, comparison, trend, period, detail) lives in
 * @/workspaces/InsightDashboard. No write path on this page.
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { InsightDashboard } from "@/workspaces/InsightDashboard";

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
          Signed-in session required to view the Social Media Insight workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function InsightPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/insight", (d) => d.rows.length === 0);

  // lastRows buffer — the most recent successful rows. A refresh (e.g. the
  // Upload card's onRefresh after a successful import) re-fetches /api/tables/
  // insight: without a buffer that refetch flips `status` back to "loading" and
  // this page would swap the whole dashboard (and the Upload card) for a
  // LoadingState, unmounting the card and losing its result banner. With the
  // buffer we keep rendering the dashboard from the last-good rows while the
  // refetch runs and update the buffer when the fresh rows land. The read-only
  // analytics are unchanged: before any import the buffer simply mirrors the
  // first successful fetch. (Deferred setState avoids set-state-in-effect.)
  const [lastRows, setLastRows] = useState<Record<string, unknown>[] | null>(null);
  useEffect(() => {
    if (table.status === "ready" && table.data) {
      const next = table.data.rows;
      const t = setTimeout(() => setLastRows(next), 0);
      return () => clearTimeout(t);
    }
  }, [table.status, table.data]);

  const authed = auth.status === "ready";
  const gateOpen = auth.status === "error" && isAuthFailure(auth.error);

  if (auth.status === "loading" || (!authed && !gateOpen)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md">
        <div className="w-72 rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
          <LoadingState variant="card" />
        </div>
      </div>
    );
  }
  if (gateOpen) {
    return <AuthGate />;
  }

  const status = table.status;

  // Render the buffered rows while a refetch runs, so the dashboard + card
  // stay mounted behind the refresh. Only show Loading/Error when we have NO
  // buffered data at all (a genuine first load / unrecoverable error).
  const buffered = lastRows && lastRows.length > 0;
  const rows = table.data?.rows ?? (buffered ? lastRows! : []);

  if (status === "error" && table.error && !buffered) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="insight" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <ErrorState failure={table.error} onRetry={table.refetch} />
        </main>
        <Footer />
      </div>
    );
  }

  if (!buffered && (status === "loading" || (status === "ready" && !table.data))) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="insight" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <LoadingState variant="card" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Topbar />
      <div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="insight" />
      </div>
      <InsightDashboard rows={rows} onRefresh={table.refetch} />
      <Footer />
    </>
  );
}