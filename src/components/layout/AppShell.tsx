"use client";
/**
 * AppShell — the single owner of all workspace shell state (Phase 2).
 *
 * Hosted by app/(workspaces)/layout.tsx, so every workspace route gets the
 * sidebar + topbar for free and its page file only decides what to show.
 *
 * Three concerns live here and nowhere else:
 *
 *  - COLLAPSE (>=lg). A tri-state preference in localStorage["dm.sidebar"]:
 *    "auto" | "expanded" | "collapsed". In "auto" a small set of wide routes
 *    (/wa-admin — four wide tables + treemap) force the rail, which is the
 *    Sneat behaviour; the toggle writes an explicit value, so an explicit
 *    choice wins forever over the route heuristic.
 *  - DRAWER (<lg). Off-canvas with scrim, scroll lock, focus move/restore, and
 *    close on route change, Escape, scrim click and nav link click.
 *  - GEOMETRY. --dm-shell-pad on the root is re-pointed at the rail token when
 *    collapsed, and BOTH the sidebar width and the content column's
 *    padding-left read that one var, so they can never drift.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { MODULES } from "@/config/constants";
import { Footer } from "@/components/layout/Footer";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

/** Routes that force the rail while the preference is still "auto". */
const WIDE_ROUTES = new Set(["/wa-admin"]);

const PREF_KEY = "dm.sidebar";
type Pref = "auto" | "expanded" | "collapsed";

function isPref(v: string | null): v is Pref {
  return v === "auto" || v === "expanded" || v === "collapsed";
}

/** Breadcrumb label from the pathname; module titles come from the registry. */
function crumbFor(pathname: string): string {
  if (pathname === "/") return "Ringkasan";
  const mod = MODULES.find((m) => pathname === `/${m.url}` || pathname.startsWith(`/${m.url}/`));
  if (!mod) return "Workspace";
  if (pathname.startsWith("/sosmed/planning")) return "Social Media / Perencanaan";
  if (pathname.startsWith("/sosmed/reporting")) return "Social Media / Pelaporan";
  if (pathname.startsWith("/sosmed")) return "Social Media";
  return mod.title;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [pref, setPref] = useState<Pref>("auto");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);

  // Collapse preference is client-only (localStorage); read it after mount so
  // the server render and the first client render agree. The setState is
  // deferred on a macrotask (the repo's set-state-in-effect convention) so the
  // mount pass does not synchronously cascade a second render.
  useEffect(() => {
    const t = setTimeout(() => {
      const stored = window.localStorage.getItem(PREF_KEY);
      setPref(isPref(stored) ? stored : "auto");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Track the lg breakpoint so the role="dialog" wrapper exists only below it
  // and desktop never gets a stray modal role.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const collapsed = pref === "auto" ? WIDE_ROUTES.has(pathname) : pref === "collapsed";

  const toggleCollapsed = useCallback(() => {
    const next: Pref = collapsed ? "expanded" : "collapsed";
    setPref(next);
    try {
      window.localStorage.setItem(PREF_KEY, next);
    } catch {
      /* storage unavailable (private mode) — the in-memory pref still applies */
    }
  }, [collapsed]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close the drawer on route change. Deferred so this is not a synchronous
  // setState inside the effect (repo convention, see the pref read above).
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    const t = setTimeout(() => setDrawerOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Scroll lock + focus move into the drawer / restore to the hamburger.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Capture the node now: the cleanup may run after React has swapped it.
    const opener = hamburgerRef.current;
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.body.style.overflow = prev;
      opener?.focus();
    };
  }, [drawerOpen]);

  const rootStyle = {
    // One live var drives BOTH the sidebar width and the content offset.
    // Expanded points at the full-width alias, never at --dm-shell-pad itself:
    // a self-referential custom property is invalid at computed-value time,
    // which silently collapses every reader back to auto width.
    "--dm-shell-pad": collapsed ? "var(--dm-shell-pad-rail)" : "var(--dm-shell-pad-full)",
  } as CSSProperties;

  /**
   * The `group` wrapper's own width is fixed; only the aside inside it grows on
   * hover (group-hover → 260px). That keeps the expanded overlay out of
   * document flow, so hovering a collapsed rail can never re-measure wide
   * content such as the /wa-admin treemap mid-interaction.
   */
  const sidebar = (
    <div
      className={
        "group h-full w-[var(--dm-drawer-w)] transition-transform duration-200 motion-reduce:transition-none " +
        "fixed inset-y-0 left-0 z-50 lg:z-40 lg:h-screen lg:w-[var(--dm-shell-pad)] lg:translate-x-0 " +
        (drawerOpen ? "translate-x-0" : "-translate-x-full")
      }
    >
      {drawerOpen && !isDesktop ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
          ref={drawerRef}
          className="h-full"
        >
          <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onNavigate={closeDrawer} />
        </div>
      ) : (
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      )}
    </div>
  );

  return (
    <div style={rootStyle} className="flex min-h-screen">
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      ) : null}

      {sidebar}

      {/* Content column — offset by the same --dm-shell-pad the sidebar reads. */}
      <div className="flex min-w-0 flex-1 flex-col transition-[width,padding] duration-200 ease-out motion-reduce:transition-none lg:pl-[var(--dm-shell-pad)]">
        <Topbar
          crumb={crumbFor(pathname)}
          menuOpen={drawerOpen}
          buttonRef={hamburgerRef}
          onToggleSidebar={() => setDrawerOpen((v) => !v)}
        />
        <main className="flex-1 min-w-0">{children}</main>
        <Footer />
      </div>
    </div>
  );
}