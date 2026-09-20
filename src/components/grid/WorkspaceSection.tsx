/**
 * WorkspaceSection — "Explore Your Workspace" homepage section
 * (UI_DESIGN_SPEC.md §C.8). Renders the MODULES registry as a responsive
 * auto-fill grid (minmax 250px) — this grid IS the navigation (C.2). The card
 * set comes from the registry, never hardcoded.
 */
import { MODULES, type ModuleDef } from "@/config/constants";
import { WorkspaceCard } from "./WorkspaceCard";

export interface WorkspaceSectionProps {
  /** Override the registry (fixtures only — prod always uses MODULES). */
  modules?: ModuleDef[];
  id?: string;
}

export function WorkspaceSection({ modules = MODULES, id = "workspace" }: WorkspaceSectionProps) {
  return (
    <section className="my-6" id={id}>
      <h2 className="text-[1.9rem] font-extrabold tracking-tight text-ink">Explore Your Workspace</h2>
      <p className="mt-2 text-[1rem] text-muted">Pilih modul untuk membuka workspace digital marketing Anda.</p>
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
        {modules.map((m) => <WorkspaceCard key={m.url} module={m} />)}
      </div>
    </section>
  );
}