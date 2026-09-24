"use client";
/**
 * useSosmedWorkspace — shared route-shell auth + data hook for all three
 * /sosmed routes (docs/sosmed_split_ui_spec.md §1.1).
 *
 * Owns: session gate (GET /api/auth/me), two reads (GET /api/tables/sosmed +
 * GET /api/tables/content_plan via useApi), the buffered-refresh contract
 * (lastRows/lastPlanRows so a refetch that momentarily reports loading does
 * NOT unmount the body and its open modal/drawer/toast), AuthGate detection,
 * and `onRefresh` (refetches both, buffering before refetch). Pure route-shell
 * concern, workspace-owned — avoids re-typing the same gate/data logic in each
 * of the three thin page shells.
 *
 * Each page.tsx renders <GateSkeleton .../> while `gateReady` is false, then
 * the layout + <DataGates {...w}>{...body}</DataGates> + Footer.
 */
import { useState } from "react";
import { useApi, type ApiFailure } from "@/lib/api-client";

interface AuthMe { ok: boolean; identity: string; role: string }
interface TableApi { ok: boolean; table: string; rows: Record<string, unknown>[] }

function isAuthFailure(f?: ApiFailure): boolean {
  return f?.code === "AUTH_FAILED" || f?.code === "FORBIDDEN";
}

export function useSosmedWorkspace() {
  const auth = useApi<AuthMe>("/api/auth/me");
  const table = useApi<TableApi>("/api/tables/sosmed", (d) => d.rows.length === 0);
  const plan = useApi<TableApi>("/api/tables/content_plan", (d) => d.rows.length === 0);

  // Buffered last-loaded rows so a refetch that momentarily reports loading does
  // NOT unmount the dashboard (and its open modal/drawer/toast) mid-save (§1.1).
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
  // True when the session is resolved and the route may render its layout.
  const gateReady = auth.status === "loading" ? false : authed || gateOpen;

  const isEditor = auth.data?.role === "editor";

  return {
    auth,
    table,
    plan,
    rows,
    planRows,
    isEditor,
    onRefresh,
    authed,
    gateOpen,
    gateReady,
  };
}
