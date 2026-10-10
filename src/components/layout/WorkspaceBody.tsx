/**
 * WorkspaceBody — the shared content container for a workspace page.
 *
 * Every workspace route owns its own width container so its dashboard can keep
 * the exact max-w string its tests assert (WaAdminDashboard 1720, Website 1240).
 * That means the ~20 non-ready early-return branches (loading spinner, auth
 * gate, error, empty) had each grown their own duplicated padding wrapper.
 * They all use this instead, so a change to the shell gutter lands once.
 *
 * Server component (no "use client") — usable from both page types.
 */
import type { ReactNode } from "react";

export function WorkspaceBody({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        "mx-auto w-full min-w-0 px-4 pt-6 sm:px-6 lg:px-8 " +
        (wide ? "max-w-[1720px]" : "max-w-[1240px]")
      }
    >
      {children}
    </div>
  );
}