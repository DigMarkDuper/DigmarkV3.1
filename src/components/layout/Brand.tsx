/**
 * Brand — the DIGMARK mark primitives (UI_DESIGN_SPEC.md §C.1).
 *
 * Extracted VERBATIM from the former standalone Topbar so the 15px brand dot +
 * 9px accent dot geometry is byte-identical to the pre-shell rendering; the
 * topbar no longer carries branding (the sidebar does), but /login still needs
 * a brand header, and the sidebar needs the same mark in its own 60px block.
 */
import Link from "next/link";

/** The 15px brand dot + 9px accent dot branding primitive (C.1). */
function DotBig() {
  return <span aria-hidden className="h-[15px] w-[15px] rounded-full bg-[linear-gradient(135deg,brand,brand-hover)]" />;
}
function DotSmall() {
  return <span aria-hidden className="h-[9px] w-[9px] rounded-full bg-accent" />;
}

/**
 * The DIGMARK lockup. `className` lets the sidebar tighten the wordmark inside
 * its rail without re-deriving the mark geometry.
 */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="DIGMARK home" className={"flex items-center gap-2 " + className}>
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
  );
}