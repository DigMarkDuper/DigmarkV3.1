/**
 * Topbar — the in-shell sticky topbar (Phase 2 Sneat shell).
 *
 * Presentational only: no pathname, no client state. AppShell owns every piece
 * of shell state (drawer, collapse preference) and passes the breadcrumb label
 * plus the hamburger callback down. Branding, search, notifications, the theme
 * toggle and the user/logout affordance all moved to the Sidebar — this bar now
 * carries exactly two things: the <lg hamburger and the breadcrumb.
 */
import Link from "next/link";
import type { RefObject } from "react";

export function Topbar({
  crumb,
  onToggleSidebar,
  menuOpen = false,
  buttonRef,
}: {
  crumb: string;
  onToggleSidebar: () => void;
  menuOpen?: boolean;
  /** AppShell focuses this on drawer close so focus returns to the hamburger. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-3 border-b border-divider bg-surface px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        ref={buttonRef}
        aria-label="Buka menu"
        aria-expanded={menuOpen}
        onClick={onToggleSidebar}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-sidebar-hover hover:text-ink lg:hidden"
      >
        <span aria-hidden>☰</span>
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
        <Link href="/" className="shrink-0 text-muted hover:text-brand">
          Beranda
        </Link>
        <span aria-hidden className="text-grid">
          /
        </span>
        <span className="truncate font-semibold text-ink">{crumb}</span>
      </nav>
    </header>
  );
}