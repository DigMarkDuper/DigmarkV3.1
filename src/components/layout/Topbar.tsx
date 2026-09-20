/**
 * Topbar — persistent brand + Home affordance (UI_DESIGN_SPEC.md §C.1).
 *
 * No sidebar (V3 display:none is preserved: the workspace-card grid is the
 * navigation, so this topbar keeps only brand + Home). Sticky with a frosted
 * blur over content (spec B.8 z-40).
 */
import Link from "next/link";

/** The 15px blue-gradient dot + 9px yellow dot branding primitive (C.1). */
function DotBig() {
  return <span aria-hidden className="h-[15px] w-[15px] rounded-full bg-[linear-gradient(135deg,brand,brand-hover)]" />;
}
function DotSmall() {
  return <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-accent" />;
}

export function Topbar({ active = false }: { active?: boolean }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-divider">
      <div className="mx-auto flex max-w-[1220px] items-center justify-between px-4">
        {/* Brand */}
        <Link
          href="/"
          aria-label="DIGMARK home"
          className="flex items-center gap-2 px-2 py-3"
        >
          <span className="relative flex items-center">
            <DotBig />
            <span className="relative left-[10px] top-[-4px]">
              <DotSmall />
            </span>
          </span>
          <span className="font-sans text-[1.12rem] font-extrabold tracking-[0.05em] text-ink">
            DIGMARK
          </span>
        </Link>

        {/* Home pill */}
        <Link
          href="/"
          title="Kembali ke homepage"
          aria-current={active ? "page" : undefined}
          className={
            "dm-home inline-flex items-center gap-2 rounded-[12px] px-4 py-2 font-bold text-[0.86rem] " +
            "transition-all duration-150 shadow-[var(--dm-shadow-xs)] hover:-translate-y-[1px] " +
            "motion-reduce:hover:translate-y-0 " +
            (active
              ? "bg-[linear-gradient(135deg,brand,brand-hover)] text-white"
              : "bg-surface border border-border text-brand-hover")
          }
        >
          <span aria-hidden>🏠</span>
          <span>Home</span>
        </Link>
      </div>
    </header>
  );
}