"use client";
/**
 * SosmedGates — workspace-owned gate / loading / error cluster shared by the
 * three /sosmed route shells (docs/sosmed_split_ui_spec.md §1.1/§1.2).
 *
 * - `<GateSkeleton gateOpen>` — full-page spinner while the session resolves,
 *   or the `AuthGate` sign-in prompt on a 401/403. Rendered by a page shell
 *   whenever `useSosmedWorkspace().gateReady === false`.
 * - `<DataGates {...w}>{(rows, planRows, isEditor, onRefresh) => ...}</DataGates>`
 *   — renders a full ErrorState (retry) or skeleton LoadingState when nothing
 *   has ever loaded, otherwise renders the body via the render-prop. Any ready
 *   branch (buffered rows exist) renders the body so a refetch never unmounts
 *   an open modal/drawer/toast.
 *
 * Shared app components (LoadingState, ErrorState, Button, Topbar, WorkspaceNav,
 * Footer) are used unchanged — never edited.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/sections/LoadingState";
import { ErrorState } from "@/components/sections/ErrorState";
import type { Row } from "@/server/adapter/source";
import type { ApiFailure } from "@/lib/api-client";

/** 401/403 sign-in prompt (parity with the pre-split shell AuthGate). */
export function AuthGate() {
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

/** Full-page spinner shown while the session is still resolving. */
export function SessionSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 backdrop-blur-md">
      <div className="w-72 rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
        <LoadingState variant="card" />
      </div>
    </div>
  );
}

/** Rendered by a shell when the session gate is not yet ready. */
export function GateSkeleton({ gateOpen }: { gateOpen: boolean }) {
  if (gateOpen) return <AuthGate />;
  return <SessionSpinner />;
}

interface DataGatesProps {
  table: { status: string; error?: ApiFailure | null };
  rows: Row[];
  planRows: Row[];
  isEditor: boolean;
  onRefresh: () => void;
  children: (rows: Row[], planRows: Row[], isEditor: boolean, onRefresh: () => void) => ReactNode;
}

/** Renders error/loading only when nothing has loaded, then the body. */
export function DataGates({ table, rows, planRows, isEditor, onRefresh, children }: DataGatesProps) {
  // Data error with nothing buffered -> ErrorState with retry.
  if (table.status === "error" && table.error && rows.length === 0) {
    return (
      <main className="mx-auto mt-6 max-w-[1220px]">
        <ErrorState failure={table.error} onRetry={onRefresh} />
      </main>
    );
  }
  // Loading with nothing buffered -> skeleton body.
  if (table.status === "loading" && rows.length === 0) {
    return (
      <main className="mx-auto mt-6 max-w-[1220px]">
        <LoadingState variant="card" />
      </main>
    );
  }
  return <>{children(rows, planRows, isEditor, onRefresh)}</>;
}
