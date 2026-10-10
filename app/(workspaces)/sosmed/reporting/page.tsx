"use client";
/**
 * /sosmed/reporting — reporting sub-page shell (docs/sosmed_split_ui_spec.md §1.1).
 * Thin wrapper: shared route-shell hook + layout + DataGates → SosmedReportingDashboard.
 */
import { useSosmedWorkspace } from "@/workspaces/useSosmedWorkspace";
import { SosmedReportingDashboard } from "@/workspaces/SosmedReportingDashboard";
import { GateSkeleton, DataGates } from "@/workspaces/SosmedGates";

export default function ReportingPage() {
  const w = useSosmedWorkspace();
  if (!w.gateReady) return <GateSkeleton gateOpen={w.gateOpen} />;
  // The shell (sidebar/topbar/gutter/footer) is owned by
  // app/(workspaces)/layout.tsx; the page renders its content only.
  return (
    <DataGates table={w.table} rows={w.rows} planRows={[]} isEditor={w.isEditor} onRefresh={w.onRefresh}>
      {(rows, planRows, isEditor, onRefresh) => (
        <SosmedReportingDashboard rows={rows} isEditor={isEditor} onRefresh={onRefresh} />
      )}
    </DataGates>
  );
}