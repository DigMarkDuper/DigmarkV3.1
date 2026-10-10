"use client";
/**
 * /sosmed — landing route (thin shell). Auth gate only; the landing body is
 * static (SosmedLanding, two choice cards). No table data fetch on the
 * landing (docs/sosmed_split_ui_spec.md §1.2/§2).
 */
import { useSosmedWorkspace } from "@/workspaces/useSosmedWorkspace";
import { SosmedLanding } from "@/workspaces/SosmedLanding";
import { GateSkeleton } from "@/workspaces/SosmedGates";

export default function SosmedPage() {
  const w = useSosmedWorkspace();
  if (!w.gateReady) return <GateSkeleton gateOpen={w.gateOpen} />;
  // The shell (sidebar/topbar/gutter/footer) is owned by
  // app/(workspaces)/layout.tsx; the page renders its content only.
  return <SosmedLanding />;
}