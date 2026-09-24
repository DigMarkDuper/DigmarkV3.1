"use client";
/**
 * SosmedReportingDashboard — reporting body for /sosmed/reporting
 * (docs/sosmed_split_ui_spec.md §4). Focus: monitoring production + team
 * work analysis ("what happened"). NO planner/calendar/Master explorer here.
 *
 * Props { rows, isEditor, onRefresh } (no planRows — no planner on this page).
 * One global filter bar (Periode · PIC · Platform · Status · Format — NO
 * Pillar), driving every section below. Uses the shared presentational module.
 */
import { useMemo, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { Divider } from "@/components/ui/Divider";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { PALETTE } from "@/components/ui-common";
import {
  actionRequired,
  contentStrategy,
  deadlineMonitor,
  distinctValues,
  filterRows,
  latestDeadlineMonthSet,
  outputTrend,
  picOptions,
  picWorkload,
  productionFunnel,
  productionOverview,
  publishingTracker,
  sosmedMetrics,
  sosmedMonths,
  statusBreakdown,
} from "@/workspaces/sosmed";
import {
  str,
  compactRow,
  splitRow,
  countChip,
  ActionItemRow,
  WorkloadBars,
  PicCapacityRows,
  FunnelBars,
  InteractiveOutputTrend,
  StrategyBar,
  MultiSelectDropdown,
  SosmedSubNav,
} from "@/workspaces/sosmedUiShared";

export interface SosmedReportingDashboardProps {
  rows: Row[];
  isEditor: boolean;
  onRefresh?: () => void;
}

/** Today, resolved once per mount — passed to derivations for deterministic date math. */
const TODAY = new Date();

export function SosmedReportingDashboard({ rows, isEditor, onRefresh }: SosmedReportingDashboardProps) {
  // Reporting has no editor controls (spec §4.5 no planner/explorer); the
  // isEditor prop is part of the required contract but unused on this page.
  void isEditor;
  const months = useMemo(() => sosmedMonths(rows), [rows]);
  const pics = useMemo(() => picOptions(rows), [rows]);
  const statusOptions = useMemo(() => ["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"], []);
  const platformOptions = useMemo(() => distinctValues(rows, "Platform"), [rows]);
  const formatOptions = useMemo(() => distinctValues(rows, "Output"), [rows]);

  // --- §4.2 global filter (dims: Periode/PIC/Platform/Status/Format — NO Pillar) ---
  const [picSel, setPicSel] = useState<Set<string>>(() => new Set(pics));
  const [monthSel, setMonthSel] = useState<Set<string>>(() => latestDeadlineMonthSet(months, rows));
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set(statusOptions));
  const [platformSel, setPlatformSel] = useState<Set<string>>(() => new Set(platformOptions));
  const [formatSel, setFormatSel] = useState<Set<string>>(() => new Set(formatOptions));
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const resetAll = () => {
    setPicSel(new Set(pics)); setMonthSel(latestDeadlineMonthSet(months, rows)); setStatusSel(new Set(statusOptions));
    setPlatformSel(new Set(platformOptions)); setFormatSel(new Set(formatOptions));
    setOpenMenu(null);
  };

  const filterDims: {
    name: string; label: string; hint?: string; className?: string; options: string[]; selected: Set<string>; set: (s: Set<string>) => void;
  }[] = [
    { name: "pic", label: "PIC", className: "md:col-span-1 xl:col-span-2", options: pics, selected: picSel, set: setPicSel },
    { name: "month", label: "Periode", hint: "deadline", options: months, selected: monthSel, set: setMonthSel },
    { name: "platform", label: "Platform", options: platformOptions, selected: platformSel, set: setPlatformSel },
    { name: "status", label: "Status", options: statusOptions, selected: statusSel, set: setStatusSel },
    { name: "format", label: "Format", options: formatOptions, selected: formatSel, set: setFormatSel },
  ];
  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const filtered = useMemo(
    () => filterRows(rows, { pics: picSel, months: monthSel, statuses: statusSel, platforms: platformSel, pillars: new Set(), formats: formatSel }),
    [rows, picSel, monthSel, statusSel, platformSel, formatSel],
  );
  const metrics = useMemo(() => sosmedMetrics(filtered), [filtered]);
  const overview = useMemo(() => productionOverview(filtered, TODAY), [filtered]);
  const funnel = useMemo(() => productionFunnel(filtered), [filtered]);
  const breakdown = useMemo(() => statusBreakdown(filtered), [filtered]);
  const deadlines = useMemo(() => deadlineMonitor(filtered, TODAY), [filtered]);
  const picLoad = useMemo(() => picWorkload(filtered, TODAY), [filtered]);
  const publishing = useMemo(() => publishingTracker(filtered), [filtered]);
  const strategy = useMemo(() => contentStrategy(filtered), [filtered]);
  const trend = useMemo(() => outputTrend(filtered), [filtered]);
  const actions = useMemo(() => actionRequired(filtered, TODAY), [filtered]);

  const originalIndex = (r: Row): number => {
    const i = rows.indexOf(r);
    if (i >= 0) return i;
    return typeof r.__rowIndex === "number" ? r.__rowIndex : -1;
  };

  const hasProses = useMemo(() => {
    if (rows.length === 0) return false;
    return Object.prototype.hasOwnProperty.call(rows[0], "PROSES");
  }, [rows]);
  const empty = rows.length === 0 || !hasProses;
  const activeFilterCount =
    (picSel.size !== pics.length ? 1 : 0) + (monthSel.size !== months.length ? 1 : 0) +
    (statusSel.size !== statusOptions.length ? 1 : 0) + (platformSel.size !== platformOptions.length ? 1 : 0) +
    (formatSel.size !== formatOptions.length ? 1 : 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {empty ? (
          <>
            <ModuleHero icon="📱" title="Social Media"
              desc="Produksi konten, workload per PIC, publishing, dan monitoring operasional." />
            <EmptyState title="Data sosmed tidak tersedia atau kosong." />
          </>
        ) : (
          <>
            <SosmedSubNav />

            {/* Page header + refresh (no + Content Plan here) */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media · Reporting</h1>
                <p className="mt-1 text-[0.92rem] text-muted">Monitoring produksi dan hasil yang sudah terjadi: overview, deadline, funnel, workload, publishing, dan trend.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => onRefresh?.()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover">🔄 Refresh Data</button>
              </div>
            </header>

            {/* §1 Global filter bar (Periode/PIC/Platform/Status/Format — NO Pillar) */}
            <div className="relative z-20 mb-6 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="mb-2 flex items-center gap-2 text-[0.82rem] font-semibold text-muted">
                  <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 3h8M14 3v2M4 9h8M14 9v2M4 15a2 2 0 0 1 1 3h7" />
                  </svg>
                  <span>Filter Data{activeFilterCount > 0 ? ` (${activeFilterCount} aktif)` : ""}</span>
                </span>
                <button type="button" onClick={resetAll} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover">↩ Reset</button>
              </div>
              <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-2 xl:grid-cols-5 md:gap-4">
                {filterDims.map((d) => (
                  <MultiSelectDropdown key={d.name} name={d.name} label={d.label} hint={d.hint} className={d.className ?? "md:col-span-1"}
                    options={d.options} selected={d.selected} onToggle={(v) => toggle(d.selected, v, d.set)} onReplace={(vals) => d.set(new Set(vals))}
                    openMenu={openMenu} setOpenMenu={setOpenMenu} />
                ))}
              </div>
              {activeFilterCount > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                  <span className="text-[0.82rem] font-semibold text-muted">Filter Aktif:</span>
                  {filterDims.map((d) =>
                    d.options.length > 0 && d.selected.size !== d.options.length
                      ? d.options.filter((o) => !d.selected.has(o)).map((o) => (
                          <button key={`${d.name}:${o}`} type="button" onClick={() => toggle(d.selected, o, d.set)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-surface-strong px-2.5 py-1 text-[0.8rem] font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand-hover">
                            {o}<span aria-hidden className="text-[0.95rem] leading-none text-muted">×</span>
                          </button>
                        ))
                      : null)}
                  <button type="button" onClick={resetAll} className="text-[0.82rem] font-semibold text-brand hover:text-brand-hover hover:underline">Hapus Semua</button>
                </div>
              ) : null}
            </div>

            {/* §2 Production Overview — compact 5-across + legacy KPI row (R1 keep) */}
            <SectionHeader title="Production Overview" subtitle="Ringkasan produksi: planned, done, in-progress, overdue, dan completion-rate." />
            <div className={compactRow}>
              <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
              <MetricCard icon="✅" label="Total Done" value={String(overview.done)} />
              <MetricCard icon="⏳" label="In Progress" value={String(overview.inProgress)} />
              <MetricCard icon="🚨" label="Overdue" value={String(overview.overdue)} />
              <MetricCard icon="🎯" label="Completion Rate" value={String(overview.completionRate === null ? "—" : `${overview.completionRate.toFixed(1)}%`)} />
            </div>
            {/* Legacy KPI row (Video/Design Selesai + Hutang IG/TikTok/YT) — preserved (R1) */}
            <div className={`mt-3 ${compactRow}`}>
              <MetricCard icon="🎬" label="Video Selesai" value={metrics.videoLabel} />
              <MetricCard icon="🎨" label="Design Selesai" value={metrics.designLabel} />
              <MetricCard icon="📸" label="Hutang Post IG" value={String(metrics.hutangIg)} />
              <MetricCard icon="🎵" label="Hutang Post TikTok" value={String(metrics.hutangTiktok)} />
              <MetricCard icon="▶️" label="Hutang Post YT" value={String(metrics.hutangYt)} />
            </div>

            <Divider />

            {/* §3 Deadline Monitoring */}
            <SectionHeader title="Deadline Monitoring" subtitle="Prioritas utama: Overdue, jatuh tempo hari ini/minggu ini, dan selesai." />
            <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[8px]">
              <div className="grid gap-3 md:grid-cols-4">
                {countChip("🚨 Overdue", deadlines.overdueCount, "border-danger/30 bg-danger/10")}
                {countChip("📅 Due Today", deadlines.dueTodayCount, "border-warning/30 bg-warning/10")}
                {countChip("🗓️ Due This Week", deadlines.dueThisWeekCount, "border-brand/30 bg-brand/10")}
                {countChip("✅ Completed", deadlines.completedCount, "border-success/30 bg-success/10")}
              </div>
              {deadlines.overdue.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[0.82rem] font-semibold text-muted">Overdue-content ({deadlines.overdueCount})</p>
                  <div className="rounded-[12px] border border-danger/30 bg-surface/70">
                    {deadlines.overdue.map((r) => <ActionItemRow key={originalIndex(r)} item={{ title: str(r["Judul Konten"]), pic: str(r["PIC"]), deadline: str(r["Tanggal Deadline"]), platform: "", status: str(r["PROSES"]) }} />)}
                  </div>
                </div>
              ) : null}
            </div>

            <Divider />

            {/* §4 Production Funnel | Status Breakdown — 50/50 */}
            <SectionHeader title="Production Funnel & Status Breakdown" subtitle="Funnel produksi (Planned → Production → Review → Revision → Done → Published) dan berapa konten di setiap fase." />
            <div className={splitRow}>
              <ChartContainer heightClass="h-auto" data={funnel} label="Funnel produksi (berdasarkan PROSES)">
                <FunnelBars stages={funnel} />
              </ChartContainer>
              <div className="flex flex-col rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
                <p className="mb-3 text-[0.85rem] font-semibold text-muted">Berapa konten di setiap fase</p>
                <div className="grid flex-1 content-start gap-2 sm:grid-cols-2 auto-rows-fr">
                  {breakdown.map((s) => {
                    const tone = s.key === "published" ? "border-brand/30 bg-brand/10"
                      : s.key === "done" ? "border-success/30 bg-success/10"
                        : s.key === "revision" ? "border-danger/30 bg-danger/10"
                          : s.key === "inProduction" ? "border-warning/30 bg-warning/10"
                            : "border-border bg-surface/60";
                    return (
                      <div key={s.key} className={`flex items-center justify-between rounded-[12px] border ${tone} p-2.5`}>
                        <span className="text-[0.82rem] font-semibold text-ink">{s.label}</span>
                        <span className="text-[0.95rem] font-extrabold text-ink">{s.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Divider />

            {/* §5 Action Required (standalone quad grid) */}
            <SectionHeader title="Action Required" subtitle="Tugas operasional: overdue, menunggu review, dalam revisi, dan selesai-belum diposting." />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-[16px] border border-danger/30 bg-surface/70">
                <p className="px-3 py-2 text-[0.88rem] font-bold text-danger">🚨 Overdue ({actions.overdue.length})</p>
                {actions.overdue.length ? actions.overdue.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
              </div>
              <div className="rounded-[16px] border border-warning/30 bg-surface/70">
                <p className="px-3 py-2 text-[0.88rem] font-bold text-warning">👀 Menunggu Review ({actions.reviewNeeded.length})</p>
                {actions.reviewNeeded.length ? actions.reviewNeeded.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
              </div>
              <div className="rounded-[16px] border border-brand/20 bg-surface/70">
                <p className="px-3 py-2 text-[0.88rem] font-bold text-brand-hover">🔁 Dalam Revisi ({actions.inRevision.length})</p>
                {actions.inRevision.length ? actions.inRevision.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada (status tidak tersedia di data).</p>}
              </div>
              <div className="rounded-[16px] border border-brand/20 bg-surface/70">
                <p className="px-3 py-2 text-[0.88rem] font-bold text-brand-hover">📤 Selesai, belum dipublikasi ({actions.finishedNotPublished.length})</p>
                {actions.finishedNotPublished.length ? actions.finishedNotPublished.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
              </div>
            </div>

            <Divider />

            {/* §6 Workload per PIC | PIC Detail Table — 50/50 */}
            <SectionHeader title="Workload per PIC" subtitle="Monitoring dan kapasitas per PIC — bukan ranking." />
            <div className={splitRow}>
              <ChartContainer heightClass="h-auto" data={picLoad} label="Done (hijau) vs Pending (kuning) dengan overdue">
                <WorkloadBars items={picLoad.map((p) => ({ pic: p.pic, selesai: p.done, hutang: p.pending }))} />
              </ChartContainer>
              {picLoad.length > 0 ? <PicCapacityRows items={picLoad} /> : <EmptyState title="Belum ada data workload." />}
            </div>

            <Divider />

            {/* §7 Publishing Tracker — compact 5-across */}
            <SectionHeader title="Publishing Tracker" subtitle="IG / TikTok / YT dipublikasi, cross-platform, dan selesai-belum dipublikasi." />
            <div className={compactRow}>
              <MetricCard icon="📸" label="Instagram Published" value={String(publishing.ig)} />
              <MetricCard icon="🎵" label="TikTok Published" value={String(publishing.tiktok)} />
              <MetricCard icon="▶️" label="YouTube Published" value={String(publishing.yt)} />
              <MetricCard icon="🔀" label="Cross-platform" value={String(publishing.crossPlatform)} />
              <MetricCard icon="📤" label="Finished, Unpublished" value={String(publishing.finishedNotPublished)} />
            </div>

            <Divider />

            {/* §8 Content Strategy — actual distribution, 3-across */}
            <SectionHeader title="Content Strategy" subtitle="Distribusi per Content Pillar, Format dan Platform (berdasarkan nilai aktual)." />
            <div className="grid gap-4 md:grid-cols-3">
              <ChartContainer data={strategy.pillars} label="Content Pillar">
                {strategy.pillars.length ? (
                  <div className="flex flex-col gap-2">{strategy.pillars.map((b, i) => (
                    <StrategyBar key={b.value} value={b.value} count={b.count} sharePct={b.sharePct} fill={[PALETTE.catBlue, PALETTE.catGreen, PALETTE.catOrange, PALETTE.catPurple, PALETTE.catTeal, PALETTE.catPink, PALETTE.catSlate, PALETTE.catSand][i % 8]} />
                  ))}</div>
                ) : <EmptyState title="Tidak ada data content pillar." />}
              </ChartContainer>
              <ChartContainer data={strategy.formats} label="Format">
                {strategy.formats.length ? (
                  <div className="flex flex-col gap-2">{strategy.formats.map((b, i) => (
                    <StrategyBar key={b.value} value={b.value} count={b.count} sharePct={b.sharePct} fill={[PALETTE.catGreen, PALETTE.catBlue, PALETTE.catOrange][i % 3]} />
                  ))}</div>
                ) : <EmptyState title="Tidak ada data format." />}
              </ChartContainer>
              <ChartContainer data={strategy.platforms} label="Platform">
                {strategy.platforms.length ? (
                  <div className="flex flex-col gap-2">{strategy.platforms.map((b, i) => (
                    <StrategyBar key={b.value} value={b.value} count={b.count} sharePct={b.sharePct} fill={[PALETTE.catOrange, PALETTE.catTeal, PALETTE.catPurple][i % 3]} />
                  ))}</div>
                ) : <EmptyState title="Tidak ada data platform." />}
              </ChartContainer>
            </div>

            <Divider />

            {/* §9 Output Trend — interactive dependency-free SVG */}
            <SectionHeader title="Output Trend" subtitle="Produksi per minggu (planned vs done) berdasarkan minggu deadline." />
            {trend.length ? (
              <InteractiveOutputTrend points={trend} />
            ) : (
              <div className="relative rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
                <EmptyState title="Belum ada data deadline untuk tren." />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
