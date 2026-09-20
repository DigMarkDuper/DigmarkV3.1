/**
 * WorkspaceNav — compact sibling-module pill row (UI_DESIGN_SPEC.md §C.2,
 * additive [CHANGED]) rendered ONLY on workspace pages (not on "/").
 *
 * Replaces the native Streamlit multipage escape-hatch that V3.1 loses:
 * a horizontal row of the module registry as pills, active state matching the
 * section-tabs active-tab look (ink weight 700 + blue). Workspace pages are
 * Phase E; this component is the ready-to-use nav for them.
 */
import Link from "next/link";
import { MODULES } from "@/config/constants";

export function WorkspaceNav({ activeUrl }: { activeUrl?: string }) {
  return (
    <nav aria-label="Workspaces" className="flex flex-wrap items-center gap-2">
      {MODULES.map((m) => (
        <Link
          key={m.url}
          href={`/${m.url}`}
          aria-current={m.url === activeUrl ? "page" : undefined}
          className={
            "rounded-full px-3 py-1 text-[0.82rem] font-semibold transition-colors duration-150 " +
            (m.url === activeUrl
              ? "bg-surface-strong text-ink font-bold"
              : "bg-surface text-muted hover:text-brand-hover")
          }
        >
          {m.icon} {m.title}
        </Link>
      ))}
    </nav>
  );
}