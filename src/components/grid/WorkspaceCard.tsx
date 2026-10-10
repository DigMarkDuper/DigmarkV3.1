/**
 * WorkspaceCard — one module glass card (UI_DESIGN_SPEC.md §C.8). The whole
 * card is a single link (icon..desc) to `/{url}`; a text affordance echoes it.
 */
import Link from "next/link";
import { type ModuleDef } from "@/config/constants";

export function WorkspaceCard({ module }: { module: ModuleDef }) {
  return (
    <Link
      href={`/${module.url}`}
      aria-label={module.title}
      className="group dm-workspace-card relative flex flex-col overflow-hidden rounded-[10px] border border-border bg-surface p-5 pb-4 shadow-[var(--dm-shadow)] transition-all duration-200 hover:-translate-y-1.5 hover:bg-surface-strong hover:shadow-[var(--dm-shadow-lift)] motion-reduce:hover:translate-y-0 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      {/* Hover top bar (blue→yellow) revealed on hover */}
      <span aria-hidden className="absolute left-0 right-0 top-0 h-[3px] bg-brand opacity-0 group-hover:opacity-100" />

      <div className="mt-4 flex items-center justify-between">
        <span aria-hidden className="flex h-[52px] w-[52px] items-center justify-center rounded-[8px] bg-blue-glow text-[1.5rem] shadow-[var(--dm-shadow-xs-b6)]">
          {module.icon}
        </span>
        <span className="rounded-full bg-brand px-2.5 text-[0.68rem] font-bold tracking-[0.04em] text-white shadow-[var(--dm-shadow-xs)]">
          WORKSPACE
        </span>
      </div>

      <h3 className="mt-3 text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">{module.title}</h3>
      <p className="mt-1 text-[0.86rem] leading-[1.45] text-muted">{module.desc}</p>

      <span className="mt-3 text-[0.78rem] font-bold text-brand-hover">Open Workspace →</span>
    </Link>
  );
}