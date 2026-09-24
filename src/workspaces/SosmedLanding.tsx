"use client";
/**
 * SosmedLanding — static landing/overview body for /sosmed
 * (docs/sosmed_split_ui_spec.md §2). Two large choice cards (Planning Social
 * Media / Reporting & Production), nothing heavy — no data fetch, no metrics.
 * The route shell handles the auth gate + layout; this body is static.
 */
import Link from "next/link";
import { SosmedSubNav } from "@/workspaces/sosmedUiShared";

const PLANNING_DESC = "+ Content Plan, Content Calendar, Content List, dan Master Content Data.";
const REPORTING_DESC = "Production Overview, Deadline Monitoring, Workload per PIC, Publishing, dan Output Trend.";

export function SosmedLanding() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        <SosmedSubNav />

        {/* Page header (reuse the pre-split header copy, no action cluster) */}
        <header className="mb-8 pt-8">
          <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
          <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media</h1>
          <p className="mt-1 text-[0.92rem] text-muted">Produksi konten, workload per PIC, publishing, dan monitoring operasional.</p>
        </header>

        {/* Two choice cards — responsive 2-across (md+), stacked below */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/sosmed/planning"
            aria-label="Planning Social Media — Perencanaan konten: content plan, calendar, list, dan master content data."
            className="group relative flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-6 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px] transition-colors hover:border-brand/40 hover:shadow-[var(--dm-shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span aria-hidden className="text-[2rem]">📋</span>
              <span aria-hidden className="ml-auto text-brand transition-transform group-hover:translate-x-1">→</span>
            </div>
            <h3 className="text-[1.25rem] font-extrabold text-ink">Planning Social Media</h3>
            <p className="text-[0.9rem] text-muted">{PLANNING_DESC}</p>
          </Link>

          <Link
            href="/sosmed/reporting"
            aria-label="Reporting &amp; Production — monitoring produksi: overview, deadline, workload, publishing, dan output trend."
            className="group relative flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-6 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px] transition-colors hover:border-brand/40 hover:shadow-[var(--dm-shadow)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span aria-hidden className="text-[2rem]">📊</span>
              <span aria-hidden className="ml-auto text-brand transition-transform group-hover:translate-x-1">→</span>
            </div>
            <h3 className="text-[1.25rem] font-extrabold text-ink">Reporting &amp; Production</h3>
            <p className="text-[0.9rem] text-muted">{REPORTING_DESC}</p>
          </Link>
        </div>

        {/* Intent statement distinguishing the two halves */}
        <p className="mt-5 text-[0.9rem] italic text-muted">
          Perencanaan: konten yang akan dibuat. Reporting: hasil yang sudah terjadi.
        </p>
      </main>
    </div>
  );
}
