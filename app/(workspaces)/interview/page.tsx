"use client";
/**
 * Interview workspace (read-only) — route at /interview.
 * Phase E port of pages/8_Interview.py. This shell owns the session gate +
 * data access (GET /api/tables/interview via useApi) + shell layout; the
 * presentational body lives in @/workspaces/InterviewDashboard.
 *
 * Empty state (V3): the dashboard itself renders "Metrik Kunci"/"Belum ada data."
 * with a zeroed KPI row, then the refresh footer, and stops — so unlike the
 * website/wa-admin shells, empty rows still flow into the dashboard.
 */
import { useApi, type ApiFailure } from "@/lib/api-client";
import { columnsFor } from "@/server/adapter/schema";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import { InterviewDashboard } from "@/workspaces/InterviewDashboard";

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
          Signed-in session required to view the Interview workspace.
        </p>
        <Button variant="primary" href="/login" className="mt-5 w-full">
          Sign in →
        </Button>
      </div>
    </div>
  );
}

export default function InterviewPage() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/interview", (d) => d.rows.length === 0);

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
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="interview" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <ErrorState failure={table.error} onRetry={table.refetch} />
        </main>
        <Footer />
      </div>
    );
  }

  // Data loading -> skeleton body.
  if (status === "loading" || (status === "ready" && !table.data)) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
        <Topbar />
        <WorkspaceNav activeUrl="interview" />
        <main className="mx-auto mt-6 max-w-[1220px]">
          <LoadingState variant="card" />
        </main>
        <Footer />
      </div>
    );
  }

  // Empty OR ready -> dashboard (empty rows render the V3 zeroed-KPI empty state).
  const rows = table.data?.rows ?? [];
  return (
    <>
      <Topbar />
      <div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="interview" />
      </div>
      <InterviewDashboard
        rows={rows}
        columns={columnsFor("interview")}
        onRefresh={table.refetch}
      />
      <Footer />
    </>
  );
}