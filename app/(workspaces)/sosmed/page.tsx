"use client";
/**
 * /sosmed — landing route (thin shell). Auth gate only; the landing body is
 * static (SosmedLanding, two choice cards). No table data fetch on the
 * landing (docs/sosmed_split_ui_spec.md §1.2/§2).
 */
import { useSosmedWorkspace } from "@/workspaces/useSosmedWorkspace";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { SosmedLanding } from "@/workspaces/SosmedLanding";
import { GateSkeleton } from "@/workspaces/SosmedGates";

export default function SosmedPage() {
  const w = useSosmedWorkspace();
  if (!w.gateReady) return <GateSkeleton gateOpen={w.gateOpen} />;
  return (
    <>
      <Topbar />
      {/* Match /website ready-branch placement: nav stays inside the capped body container. */}
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="sosmed" />
      </div>
      <SosmedLanding />
      <Footer />
    </>
  );
}