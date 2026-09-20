/**
 * InterviewDashboard — presentational body of the Interview workspace (read-only).
 * Given normalized rows from GET /api/tables/interview, it renders the V3
 * 8_Interview.py layout with Phase D design-system components.
 *
 * Pure presentational: NO fetches in here. The route shell (app/(workspaces)/
 * interview/page.tsx) owns useApi + auth + refetch. Kept server-renderable so
 * tests can assert derived counts via react-dom/server.
 *
 * Empty state (V3 8_Interview.py): hero + "Metrik Kunci"/"Belum ada data." with
 * a MetricRow of zeroed KPI cards, then refresh footer, stop.
 */
"use client";
import { useMemo, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { DataTable } from "@/components/grid/DataTable";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ModuleHero } from "@/components/layout/ModuleHero";
import {
  deriveKpis,
  applyFilters,
  interviewFilterColumns,
  COL_PIC,
  COL_STATUS,
  COL_HASIL,
} from "@/workspaces/interview";

export interface InterviewDashboardProps {
  rows: Row[];
  /** Declared schema columns for the interview tab (rendering fallback). */
  columns: string[];
  onRefresh?: () => void;
}

/** Column label shown above each multiselect — V3 `multiselect("PIC", ...)`, etc. */
const FILTER_LABELS: Partial<Record<string, string>> = {
  [COL_PIC]: "PIC",
  [COL_STATUS]: "Status Follow-Up",
  [COL_HASIL]: "Hasil Interview",
};

/**
 * Small dependency-free multiselect (V3 `st.multiselect`). Header button toggles
 * a checkbox list; each option toggles membership in the selection set.
 */
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <label className="block text-[0.82rem] font-semibold text-muted">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-1 w-full rounded-[12px] border border-border bg-surface px-3 py-2 text-left text-[0.9rem] font-semibold text-ink shadow-[var(--dm-shadow-xs)] outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {selected.size ? `${selected.size} terpilih` : "— Semua —"}
        <span className="ml-auto float-right text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-[12px] border border-border bg-surface shadow-[var(--dm-shadow)]">
          {options.length ? options.map((o) => {
            const checked = selected.has(o);
            return (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[0.85rem] text-ink hover:bg-surface-strong">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(o)}
                  className="h-4 w-4 rounded border-border accent-brand"
                />
                <span className="truncate" title={o}>{o}</span>
              </label>
            );
          }) : (
            <div className="px-2.5 py-1.5 text-[0.82rem] text-muted">Belum ada data.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InterviewDashboard({ rows, columns, onRefresh }: InterviewDashboardProps) {
  const kpis = useMemo(() => deriveKpis(rows), [rows]);
  const filters = useMemo(() => interviewFilterColumns(rows), [rows]);

  // Selected per-column values (independent filters, V3 three multiselects).
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});

  const toggle = (col: string, value: string) => {
    const next = new Set(selection[col] ?? []);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSelection({ ...selection, [col]: next });
  };

  // Filtered rows after all active selections applied.
  const filtered = useMemo(() => applyFilters(rows, selection), [rows, selection]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {kpis.total === 0 ? (
          <>
            {/* Empty (V3): ModuleHero + zeroed KPI row, then footer, stop. */}
            <ModuleHero
              icon="🎤"
              title="Interview"
              desc="Progres kandidat per follow-up dan hasil interview."
            />
            <SectionHeader title="Metrik Kunci" subtitle="Belum ada data." />
            <MetricRow>
              <MetricCard icon="👤" label="Total Kandidat" value="0" />
              <MetricCard icon="⏳" label="Menunggu Follow-up" value="0" />
              <MetricCard icon="✅" label="Interview Selesai" value="0" />
              <MetricCard icon="🏆" label="Lolos Seleksi" value="0" />
            </MetricRow>
          </>
        ) : (
          <>
            {/* Page header + primary action (reference anatomy) */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
                  Interview
                </h1>
                <p className="mt-1 text-[0.92rem] text-muted">
                  Progres kandidat per follow-up dan hasil interview.
                </p>
              </div>
              <Button variant="secondary" onClick={onRefresh} className="shrink-0">
                🔄 Refresh Data
              </Button>
            </header>

            {/* Key metrics */}
            <SectionHeader title="Metrik Kunci" subtitle="Ringkasan kandidat dan hasil seleksi." />
            <MetricRow>
              <MetricCard icon="👤" label="Total Kandidat" value={String(kpis.total)} />
              <MetricCard icon="⏳" label="Menunggu Follow-up" value={String(kpis.menunggu)} />
              <MetricCard icon="✅" label="Interview Selesai" value={String(kpis.selesai)} />
              <MetricCard icon="🏆" label="Lolos Seleksi" value={String(kpis.lolos)} />
            </MetricRow>

            <Divider />

            {/* Filters */}
            <SectionHeader title="Filter Kandidat" subtitle="Difilter list per PIC, follow-up, dan hasil." />
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              {filters.map(({ col, options }) => (
                <MultiSelect
                  key={col}
                  label={FILTER_LABELS[col] ?? col}
                  options={options}
                  selected={selection[col] ?? new Set<string>()}
                  onToggle={(v) => toggle(col, v)}
                />
              ))}
            </div>

            <Divider />

            {/* Filter result metric + full filtered table */}
            <MetricRow>
              <MetricCard icon="🎯" label="Hasil Filter" value={String(filtered.length)} />
            </MetricRow>
            {columns.length ? (
              <DataTable
                rows={filtered}
                columns={columns}
                emptyTitle="Belum ada data."
                emptyHint="Filter mengembalikan hasil kosong — periksa PIC/follow-up/hasil."
              />
            ) : null}
          </>
        )}

        {kpis.total === 0 ? (
          <>
            <Divider />
            {/* Refresh (only affordance on the empty state — data path uses the top-right action) */}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onRefresh}>
                🔄 Refresh Data
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}