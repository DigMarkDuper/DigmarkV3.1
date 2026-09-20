/**
 * WebsiteDashboard — presentational body of the Website workspace
 * (read-only). Given normalized rows from GET /api/tables/website, it renders
 * the V3 3_Website.py layout with Phase D design-system components only.
 *
 * Pure presentational: NO fetches in here. The route shell (app/(workspaces)/
 * website/page.tsx) owns useApi + auth + refetch. Kept server-renderable so
 * tests can assert derived counts via react-dom/server.
 */
"use client";
import { useState } from "react";
import type { Row } from "@/server/adapter/source";
import { DataTable } from "@/components/grid/DataTable";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { EmptyState } from "@/components/sections/EmptyState";
import { PALETTE } from "@/components/ui-common";
import {
  deriveWebsiteStats,
  websiteMonths,
  type PillarStat,
} from "@/workspaces/website";

const LIVE_COLOR = PALETTE.success;
const PENDING_COLOR = PALETTE.warning;

/** Accordion chevron — rotates on group-open via the summary styles. */
function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

/** Grouped pillar icon — matches the same regex family as website.ts stats. */
function pillarIcon(pillar: string): string {
  const p = String(pillar ?? "").toLowerCase();
  if (p.includes("article")) return "📄";
  if (/news|berita/.test(p)) return "📰";
  if (/galer|gallery|album/.test(p)) return "🖼️";
  if (p.includes("linkedin")) return "🔗";
  return "📑";
}

export interface WebsiteDashboardProps {
  rows: Row[];
  /** Declared schema columns (order for the Master Database table). */
  columns: string[];
  onRefresh?: () => void;
}

/**
 * Dependency-free SVG donut: Live (success) vs Pending (warn), V3 px.pie(hole=0.6).
 * Two stroked circle arcs on a 100px radius track; starts at top, clockwise.
 * Renders with an inline legend so the chart reads at a glance.
 */
function LivePendingDonut({ live, pending }: { live: number; pending: number }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  const total = Math.max(live + pending, 1);
  const liveFrac = live / total;
  const liveLen = liveFrac * c;
  const pendLen = (pending / total) * c;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[220px]">
        <svg
          viewBox="0 0 200 200"
          role="img"
          aria-label={`Live ${live}, Pending ${pending}`}
          className="mx-auto block h-auto w-full"
        >
          {/* track */}
          <circle cx="100" cy="100" r={r} fill="none" stroke={PALETTE.grid} strokeWidth="26" />
          {/* Live arc from 12 o'clock */}
          {liveLen > 0 ? (
            <circle
              cx="100" cy="100" r={r} fill="none"
              stroke={LIVE_COLOR} strokeWidth="26" strokeLinecap="butt"
              strokeDasharray={`${liveLen} ${c}`} transform="rotate(-90 100 100)"
            />
          ) : null}
          {/* Pending arc following Live */}
          {pendLen > 0 ? (
            <circle
              cx="100" cy="100" r={r} fill="none"
              stroke={PENDING_COLOR} strokeWidth="26" strokeLinecap="butt"
              strokeDasharray={`${pendLen} ${c}`} strokeDashoffset={-liveLen}
              transform="rotate(-90 100 100)"
            />
          ) : null}
          {/* center hole: total */}
          <text x="100" y="102" textAnchor="middle" fontSize="40" fontWeight="800" fill={PALETTE.ink}>
            {String(total)}
          </text>
          <text x="100" y="120" textAnchor="middle" fontSize="13" fontWeight="600" fill={PALETTE.muted}>
            tugas
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-divider pt-3">
        <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-muted">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LIVE_COLOR }} />
          Live <b className="text-ink">{live}</b>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-muted">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PENDING_COLOR }} />
          Pending <b className="text-ink">{pending}</b>
        </span>
      </div>
    </div>
  );
}

/** Toggleable month chips (V3 st.multiselect, default all selected). */
function MonthFilter({
  months,
  selected,
  onToggle,
}: {
  months: string[];
  selected: Set<string>;
  onToggle: (month: string, enabled: boolean) => void;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
      <div className="mb-2 flex items-center gap-2 text-[0.82rem] font-semibold text-muted">
        <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3v2M14 3v2M4 8h12M5 5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        </svg>
        <span>Filter Bulan Deadline</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {months.map((m) => {
          const active = selected.has(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(m, !active)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[0.8rem] font-semibold transition-all duration-150 " +
                (active
                  ? "border-brand/30 bg-surface-strong text-ink shadow-[var(--dm-shadow-xs)]"
                  : "border-border bg-surface/60 text-muted hover:border-brand/30 hover:text-brand-hover")
              }
            >
              <span
                aria-hidden
                className={
                  "flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors " +
                  (active ? "border-brand bg-brand text-ink-on-brand" : "border-border bg-white/60 text-transparent")
                }
              >
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 6.5 2.2 2.2 4.8-5" />
                </svg>
              </span>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WebsiteDashboard({ rows, columns, onRefresh }: WebsiteDashboardProps) {
  const months = websiteMonths(rows);
  // V3 multiselect default = all months; when none derivable, no filter UI.
  const initial = months.length ? new Set(months) : new Set<string>();
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [tab, setTab] = useState(0);

  const stats = deriveWebsiteStats(rows, selected);
  const { filtered, total, live, pending, pillars, pendingGroups } = stats;
  const allDone = pending === 0;

  // Filter is only rendered when a month is derivable (V3: skip filter otherwise).
  const showFilter = months.length > 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {/* Page header + primary action */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
          <div className="min-w-0">
            <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
            <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              Website / SEO
            </h1>
            <p className="mt-1 text-[0.92rem] text-muted">
              Fulfilment konten per pilar dan audit pending halaman.
            </p>
          </div>
          <Button variant="secondary" onClick={onRefresh} className="shrink-0">
            🔄 Refresh Data
          </Button>
        </header>

        {showFilter ? (
          <div className="mb-6">
            <MonthFilter
              months={months}
              selected={selected}
              onToggle={(m, en) => {
                const next = new Set(selected);
                if (en) next.add(m); else next.delete(m);
                setSelected(next);
              }}
            />
          </div>
        ) : null}

        {/* Key metrics row */}
        <SectionHeader title="Metrik Kunci" subtitle="Ringkasan fulfilment dan halaman live." />
        <MetricRow>
          <MetricCard icon="📋" label="Total Task" value={String(total)} />
          <MetricCard icon="🌐" label="Live Pages" value={String(live)} />
          <MetricCard icon="⏳" label="Pending" value={String(pending)} />
        </MetricRow>

        <Divider />

        {/* Main viz: status donut + pillar grouping */}
        <SectionHeader title="Visualisasi" subtitle="Distribusi status dan sisa tugas per pilar." />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <ChartContainer data={filtered} heightClass="h-64" label="Distribusi Status">
            <LivePendingDonut live={live} pending={pending} />
          </ChartContainer>
          <div className="flex flex-col">
            <span className="mb-3 block text-[0.86rem] font-semibold text-muted">Sisa tugas per pilar</span>
            <MetricRow>
              {pillars.map((p: PillarStat) => (
                <MetricCard key={p.key} icon={p.icon} label={p.label} value={String(p.count)} />
              ))}
            </MetricRow>
          </div>
        </div>

        <Divider />

        {/* Detailed data: two tabs */}
        <SectionHeader title="Data Detail" subtitle="Audit pending dan master database lengkap." />
        <div role="tablist" aria-label="Data detail" className="mb-4 flex flex-wrap gap-2">
          {["📝 Audit Pending", "🗄️ Master Database"].map((label, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={tab === i}
              onClick={() => setTab(i)}
              className={
                "rounded-full border px-4 py-1.5 text-[0.9rem] font-semibold transition-all duration-150 " +
                (tab === i
                  ? "border-brand/30 bg-surface-strong text-ink shadow-[var(--dm-shadow-xs)]"
                  : "border-border bg-surface/60 text-muted hover:border-brand/30 hover:text-brand-hover")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 0 ? (
          allDone ? (
            <div role="status" className="rounded-[16px] border border-success/40 bg-success/10 p-5">
              <p className="font-semibold text-success">Semua tugas clear! 🎉</p>
            </div>
          ) : pendingGroups.length ? (
            <div className="flex flex-col gap-3">
              {pendingGroups.map((g) => (
                <details
                  key={g.pillar}
                  className="group rounded-[14px] border border-border bg-surface backdrop-blur-[8px] shadow-[var(--dm-shadow-xs)] transition-all duration-200 open:border-brand/30 open:bg-surface-strong"
                >
                  <summary className="flex cursor-pointer select-none items-center gap-3 rounded-[14px] px-4 py-3.5 transition-colors hover:bg-brand/[0.03]">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-brand/10 to-brand/16 text-[1rem]"
                    >
                      {pillarIcon(g.pillar)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold text-ink">
                      {g.pillar || "(no pillar)"}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted/10 px-2.5 py-0.5 text-[0.78rem] font-bold text-muted">
                      {g.rows.length} tugas
                    </span>
                    <Chevron />
                  </summary>
                  <div className="border-t border-divider p-2">
                    <DataTable
                      rows={g.rows}
                      columns={["Kode Konten", "Judul", "Deadline"]}
                      emptyTitle="Belum ada data."
                    />
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Belum ada data pending untuk audit."
              hint="Tidak ada tugas yang tertunda pada filter ini."
            />
          )
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            emptyTitle="Data website tidak tersedia."
            emptyHint="Tidak ada data pada filter ini."
          />
        )}
      </main>
    </div>
  );
}