/**
 * Workspace route group layout — hosts the Sneat app shell (Phase 2).
 *
 * Route groups are path-less, so "/" (app/(workspaces)/page.tsx) and every
 * /<module> route get this layout while /login, which sits outside the group,
 * stays sidebar-free. The body is intentionally just <AppShell>: all shell
 * state (collapse preference, off-canvas drawer, breadcrumb) lives there.
 *
 * Server component — AppShell is the client boundary.
 *
 * NOTE: the prop type is spelled out rather than using the generated
 * LayoutProps<"/">: a route group emits no URL segment, so that generated type
 * is ambiguous across groups and resolves to the wrong signature.
 */
import { AppShell } from "@/components/layout/AppShell";

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}