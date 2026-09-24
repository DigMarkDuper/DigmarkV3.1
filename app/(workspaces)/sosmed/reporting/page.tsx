"use client";
/**
 * /sosmed/reporting — reporting sub-page shell (docs/sosmed_split_ui_spec.md §1.1).
 * Thin wrapper: shared route-shell hook + layout + DataGates → SosmedReportingDashboard.
 */
import { useSosmedWorkspace } from "@/workspaces/useSosmedWorkspace";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { SosmedReportingDashboard } from "@/workspaces/SosmedReportingDashboard";
import { GateSkeleton, DataGates } from "@/workspaces/SosmedGates";

export default function ReportingPage() {
  const w = useSosmedWorkspace();
  if (!w.gateReady) return <GateSkeleton gateOpen={w.gateOpen} />;
  return (
    <>
      <Topbar />
      <div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="sosmed" />
      </div>
      <DataGates table={w.table} rows={w.rows} planRows={[]} isEditor={w.isEditor} onRefresh={w.onRefresh}>
        {(rows, planRows, isEditor, onRefresh) => (
          <SosmedReportingDashboard rows={rows} isEditor={isEditor} onRefresh={onRefresh} />
        )}
      </DataGates>
      <Footer />
    </>
  );
}