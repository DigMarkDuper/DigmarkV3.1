"use client";
/**
 * Sidebar — the app shell's primary navigation (Phase 2 Sneat shell).
 *
 * Replaces the old WorkspaceNav pill row: the shell sidebar is now the single
 * navigation surface, so the module registry is not rendered twice on a
 * workspace page. Three layout facts drive the geometry:
 *
 *  1. Width comes from ONE var, --dm-shell-pad, which AppShell re-points at
 *     --dm-shell-pad-rail when collapsed. The sidebar reads it and so does the
 *     content column's padding-left, so they can never drift.
 *  2. On >=lg a collapsed rail hover-expands to 260px as a FIXED OVERLAY
 *     (group-hover width + elevation, no padding change anywhere). This is
 *     deliberate: an in-flow width change would re-measure wide content such as
 *     the /wa-admin treemap and re-flow four tables mid-interaction.
 *  3. Below lg the same component is an off-canvas drawer; AppShell supplies the
 *     scrim, scroll lock, focus handling and the Escape/route close rules.
 *
 * Nav state is purely presentational from usePathname — no data fetching.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApi, postJson } from "@/lib/api-client";
import { MODULES } from "@/config/constants";
import { Brand } from "@/components/layout/Brand";

/**
 * Social Media sub-destinations. UI-only by design: the module registry in
 * src/config/constants.ts stays flat and its order is a tested contract, so the
 * two extra /sosmed routes live here rather than mutating MODULES.
 */
const SOSMED_CHILDREN = [
  { href: "/sosmed", label: "Landing", icon: "🏠" },
  { href: "/sosmed/planning", label: "Perencanaan", icon: "📅" },
  { href: "/sosmed/reporting", label: "Pelaporan", icon: "📈" },
];

interface AuthMe {
  ok: boolean;
  identity: string;
  role: string;
}

/** The Sneat section label, or a rule-only stand-in when the rail is collapsed. */
function SectionLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  if (collapsed) return <div className="mx-3 my-3 border-t border-divider" />;
  return (
    <div className="px-3 pb-2 pt-5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">
      {children}
    </div>
  );
}

function NavRow({
  href,
  icon,
  label,
  active,
  onNavigate,
  title,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onNavigate?: () => void;
  title?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={title}
      onClick={onNavigate}
      className={
        "group relative flex h-10 items-center gap-3 rounded-[8px] px-3 text-[0.875rem] font-semibold transition-colors duration-150 " +
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none " +
        (active ? "bg-sidebar-active text-brand" : "text-nav hover:bg-sidebar-hover hover:text-ink")
      }
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-[2px] bg-brand"
        />
      ) : null}
      <span aria-hidden className="w-5 shrink-0 text-center text-[1.0625rem] leading-none">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const me = useApi<AuthMe>("/api/auth/me");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const identity = me.status === "ready" ? me.data?.identity ?? "" : "";
  const role = me.status === "ready" ? me.data?.role ?? "" : "";
  const initial = identity.trim().charAt(0).toUpperCase();

  async function logout() {
    // The logout controller takes no body; postJson requires one, so send null.
    await postJson("/api/auth/logout", null);
    router.push("/login");
    router.refresh();
  }

  return (
    // `group-hover`/`group-focus-within` widen THIS element inside the fixed
    // wrapper, so a hover-expand is a pure overlay: no sibling is re-measured.
    <aside className="flex h-full w-full flex-col border-r border-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:w-[var(--dm-shell-pad)] lg:group-hover:w-[260px] lg:group-focus-within:w-[260px] lg:group-hover:shadow-[var(--dm-shadow-lift)]">
      {/* Brand + collapse toggle */}
      <div className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-b border-divider px-4">
        <Brand className="min-w-0 truncate" />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Ciutkan sidebar"
          aria-expanded={!collapsed}
          className="hidden h-8 w-8 items-center justify-center rounded-[6px] text-muted hover:bg-sidebar-hover hover:text-ink lg:inline-flex"
        >
          <span aria-hidden>{collapsed ? "»" : "«"}</span>
        </button>
      </div>

      <nav aria-label="Modul workspace" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <SectionLabel collapsed={collapsed}>NAVIGASI</SectionLabel>
        <NavRow href="/" icon="🏠" label="Beranda" active={isActive("/")} onNavigate={onNavigate} />

        <SectionLabel collapsed={collapsed}>MODUL</SectionLabel>
        {MODULES.map((m) => {
          const href = `/${m.url}`;
          const active = isActive(href);
          const showChildren = m.url === "sosmed" && pathname.startsWith("/sosmed");
          return (
            <div key={m.url}>
              <NavRow
                href={href}
                icon={m.icon}
                label={m.title}
                active={active}
                onNavigate={onNavigate}
              />
              {showChildren ? (
                <div className="ml-[27px] mt-1 border-l border-divider pb-1 pl-3">
                  {SOSMED_CHILDREN.map((c) => (
                    <Link
                      key={c.href}
                      href={c.href}
                      aria-current={isActive(c.href) && c.href !== "/sosmed" ? "page" : undefined}
                      onClick={onNavigate}
                      className={
                        "flex h-9 items-center gap-3 rounded-[8px] px-3 text-[0.8125rem] font-semibold transition-colors duration-150 " +
                        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none " +
                        (isActive(c.href) && c.href !== "/sosmed"
                          ? "bg-sidebar-active text-brand"
                          : "text-nav hover:bg-sidebar-hover hover:text-ink")
                      }
                    >
                      <span className="truncate">{c.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Identity + sign out */}
      <div className={"shrink-0 border-t border-divider p-3" + (collapsed ? " lg:hidden" : "")}>
        {me.status === "ready" ? (
          <div className="flex items-center gap-3 px-3 pb-1">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white"
            >
              {initial || "?"}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">{identity}</span>
              <span className="block truncate text-[0.6875rem] text-muted">{role}</span>
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="mt-1 flex h-9 w-full items-center gap-3 rounded-[8px] px-3 text-[0.875rem] font-semibold text-muted hover:bg-danger/10 hover:text-danger"
        >
          <span aria-hidden>⎋</span>
          <span>Keluar</span>
        </button>
      </div>
    </aside>
  );
}