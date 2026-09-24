/**
 * SosmedDashboard — presentational body of the Sosmed workspace (port of
 * pages/2_Sosmed.py), redesigned into the "Social Media Command Center"
 * per docs/sosmed_command_center_ui_spec.md (NEO spec, REX implementation).
 *
 * Given normalized rows from GET /api/tables/sosmed plus the new content_plan
 * rows (GET /api/tables/content_plan), renders 12 body sections:
 *   1 Filter Data (global filter card)          7 Workload per PIC
 *   2 Production Overview + legacy KPIs         8 Deadline Monitoring
 *   3 Content Planning (Kalender/Daftar + modal) 9 Publishing Tracker
 *   4 Production Funnel                         10 Content Strategy
 *   5 Status Breakdown                          11 Output Trend
 *   6 Action Required                           12 Master Content Data EXPLORER
 *
 * New capabilities:
 *   - header action cluster: "+ Content Plan" (opens §4.1 modal) + "Refresh Data"
 *   - Content Planner modal -> POST /api/tables/content_plan (one row)
 *   - Calendar + List views over the §1-filtered rows (Kalender / Daftar)
 *   - Content Plan Storage panel with "+ Tambah ke Produksi" (plan -> sosmed)
 *   - Master Content Data EXPLORER: debounced search, pagination (PAGE_SIZE 15),
 *     7 filters + Deadline single-select + Reset Filter, column management,
 *     fullscreen, row-detail drawer, inline editor + page-slice Save
 *
 * All derivations live in @/workspaces/sosmed (pure, unit-tested); this
 * component maps them to the design system. Writes go ONLY through
 * POST/PATCH /api/tables/<key> — never Sheets in the browser. The editor
 * contract (diffPatches + per-cell PATCH, real booleans) is unchanged.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { patchJson, postJson } from "@/lib/api-client";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { Select, Checkbox } from "@/components/ui/Field";
import { PALETTE, formatPercent } from "@/components/ui-common";
import {
  SOSMED_BOOL_COLS,
  SOSMED_TEXT_COLS,
  PROSES_OPTIONS,
  actionRequired,
  buildPlanPayload,
  buildProductionRow,
  calendarCells,
  calendarDefaultMonth,
  contentKode,
  contentStrategy,
  deadlineBucket,
  deadlineDate,
  deadlineMonitor,
  diffPatches,
  distinctValues,
  filterRows,
  latestDeadlineMonthSet,
  outputTrend,
  picOptions,
  picWorkload,
  productionFunnel,
  productionKodeExists,
  productionOverview,
  publishingTracker,
  searchContents,
  sosmedMetrics,
  sosmedMonths,
  statusBreakdown,
  truthy,
  paginationWindow,
  type ProdStage,
  type SosmedPatch,
  type DeadlineBucket,
  COLUMN_DEFS,
  EXPLORER_DEFAULT_COLS,
} from "@/workspaces/sosmed";

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** §5.2/§8.2 — compact 5-across grid (xl → 5 cards) for MetricCard chips. */
const compactRow = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3";

/** §7/§8.1 — 50/50 responsive 2-col grid (minmax(0,1fr) prevents horizontal overflow). */
const splitRow = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";

/** Pure trigger-state derivation for a dropdown — testable without rendering. */
export function selectionSummary(
  selected: Set<string>,
  options: string[],
): { chip: string; active: boolean; allChecked: boolean } {
  const all = options.length > 0 && selected.size === options.length;
  return {
    chip: all ? "Semua" : `${selected.size} dipilih`,
    active: selected.size !== options.length,
    allChecked: options.length > 0 && options.every((o) => selected.has(o)),
  };
}

/** Today, resolved once per mount — passed to derivations for deterministic date math. */
const TODAY = new Date();

/** PROSES status badge — gives DONE a real status treatment instead of plain text. */
function ProsesBadge({ status }: { status: string }) {
  const s = (status ?? "").trim().toUpperCase();
  const cls =
    s === "DONE"
      ? "bg-success/10 text-success border-success/30"
      : s === "PENDING"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-muted/10 text-muted border-border";
  const dot =
    s === "DONE" ? "bg-success" : s === "PENDING" ? "bg-warning" : "bg-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.75rem] font-semibold ${cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

/**
 * Plan Status Plan badge (§6.0): APPROVED/PLANNED/IDEA/DIPRODUKSI tones.
 */
function PlanStatusBadge({ status }: { status: string }) {
  const s = (status ?? "").trim().toUpperCase();
  let cls = "bg-muted/10 text-muted border-border";
  if (s === "APPROVED") cls = "bg-brand/10 text-brand-hover border-brand/30";
  else if (s === "PLANNED") cls = "bg-warning/10 text-warning border-warning/30";
  else if (s === "DIPRODUKSI") cls = "bg-success/10 text-success border-success/30";
  else cls = "bg-muted/10 text-muted border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold ${cls}`}>
      {s || "IDEA"}
    </span>
  );
}

/** §5.5 — mini progress bar for the optional "Process" column. */
function ProcessBar({ status }: { status: string }) {
  const s = (status ?? "").trim().toUpperCase();
  const pct = s === "DONE" ? 100 : s === "ON PROGRESS" ? 60 : 10;
  return (
    <span className="w-20 h-1.5 rounded-full bg-surface-strong overflow-hidden" role="img" aria-label={`Proses ${pct}%`}>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** §4.2 — Indonesian month title for the calendar cursor. */
function monthTitleText(d: Date): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** §4.2 — First day of the current month (calendar cursor initial state). */
function firstOfToday(): Date {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
}

/** Immutable month shift of a 1st-of-month cursor. */
function shiftMonth(c: Date, delta: number): Date {
  return new Date(c.getFullYear(), c.getMonth() + delta, 1);
}

/**
 * Compact searchable multi-select dropdown — parity with the previous filter
 * card. Selection round-trips through `selected`/`onToggle`/`onReplace`; the
 * panel never holds a copy. Single-open enforced via the shared `openMenu`.
 */
function MultiSelectDropdown({
  name, label, options, selected, onToggle, onReplace, hint, placeholder = "Cari…", className = "", openMenu, setOpenMenu,
}: {
  name: string; label: string; options: string[]; selected: Set<string>;
  onToggle: (value: string) => void; onReplace: (values: Iterable<string>) => void;
  hint?: string; placeholder?: string; className?: string; openMenu: string | null; setOpenMenu: (n: string | null) => void;
}) {
  const open = openMenu === name;
  const [query, setQuery] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, setOpenMenu]);

  const choiceList = Array.from(new Set([...options, ...Array.from(selected)]));
  const q = query.trim().toLowerCase();
  const filtered = q ? choiceList.filter((o) => String(o).toLowerCase().includes(q)) : choiceList;
  const sum = selectionSummary(selected, options);

  const toggleAll = () => {
    if (sum.allChecked) onReplace([]);
    else onReplace(options);
  };

  return (
    <div ref={wrapRef} className={`relative min-w-0 w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setQuery("");
          if (open) { setOpenMenu(null); return; }
          if (wrapRef.current) {
            const r = wrapRef.current.getBoundingClientRect();
            const grid = wrapRef.current.parentElement;
            const edge = grid ? grid.getBoundingClientRect().right : window.innerWidth - 8;
            setAlignRight(r.left + 256 > edge);
          }
          setOpenMenu(name);
        }}
        className={
          "inline-flex w-full items-center gap-2 rounded-[12px] border bg-surface-input px-3 py-2 text-[0.82rem] font-semibold transition-colors " +
          (sum.active ? "border-brand/40 text-brand" : "border-border text-ink hover:border-brand/30 hover:text-brand-hover")
        }
      >
        <span className="flex min-w-0 items-center gap-1 truncate">
          <span className="truncate">{label}</span>
          {hint ? <span className="hidden text-[0.75rem] text-muted/70 xl:inline">({hint})</span> : null}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface-strong px-2.5 py-0.5 text-[0.75rem] font-medium text-muted">
          {sum.chip}
        </span>
        <svg aria-hidden viewBox="0 0 12 8" className={`h-2 w-2.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m1.5 1.5 4.5 4.5 4.5-4.5" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={`Pilih ${label}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpenMenu(null); triggerRef.current?.focus(); }
          }}
          className={`absolute z-30 mt-2 ${alignRight ? "right-0" : "left-0"} w-64 min-w-0 rounded-[12px] border border-border bg-surface p-2 shadow-[var(--dm-shadow-panel)]`}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="w-full rounded-[8px] border border-border bg-surface-input px-2.5 py-1.5 text-[0.82rem] text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none"
          />
          <label className="mt-1 flex cursor-pointer items-center gap-2 border-b border-divider py-1.5 text-[0.82rem] font-medium text-ink">
            <input type="checkbox" checked={sum.allChecked} onChange={toggleAll} className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand" />
            Pilih Semua
          </label>
          <div className="max-h-[220px] overflow-y-auto pt-1">
            {filtered.length === 0 ? (
              <span className="block py-1 text-[0.8rem] text-muted">Tidak ada opsi.</span>
            ) : (
              filtered.map((o) => {
                const checked = selected.has(o);
                return (
                  <label key={o} className="flex cursor-pointer items-center gap-2 py-0.5 text-[0.82rem] font-medium text-ink">
                    <input type="checkbox" checked={checked} onChange={() => onToggle(o)} className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand" />
                    <span className="min-w-0 truncate">{o}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Dependency-free stacked horizontal bar (V3 px.bar barmode="stack"). */
function WorkloadBars({ items }: { items: { pic: string; selesai: number; hutang: number }[] }) {
  const max = Math.max(...items.map((i) => i.selesai + i.hutang), 1);
  const rowH = 46;
  const chartH = Math.max(items.length * rowH + 24, 72);
  return (
    <div style={{ height: `${chartH}px` }}>
      <svg viewBox={`0 0 400 ${chartH}`} role="img" aria-label="Workload per PIC" className="h-full w-full">
        {items.map((it, i) => {
          const y = i * rowH + 8;
          const rowW = 400 - 100;
          const selesaiW = (it.selesai / max) * rowW;
          const totalW = ((it.selesai + it.hutang) / max) * rowW;
          return (
            <g key={it.pic}>
              <text x="0" y={y + 20} textAnchor="start" fontSize="13" fontWeight="600" fill={PALETTE.muted}>{it.pic}</text>
              <rect x="100" y={y} width={rowW} height="24" rx="6" fill={PALETTE.grid} />
              {selesaiW > 0 ? <rect x="100" y={y} width={selesaiW} height="24" rx="6" fill={PALETTE.success} /> : null}
              {totalW > selesaiW ? <rect x={100 + selesaiW} y={y} width={totalW - selesaiW} height="24" rx="6" fill={PALETTE.warning} /> : null}
              <text x="396" y={y + 20} textAnchor="end" fontSize="12" fontWeight="700" fill={PALETTE.ink}>{it.selesai}/{it.selesai + it.hutang}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Operational per-PIC workload table (capacity monitoring, NOT a ranking). */
function PicCapacityRows({ items }: { items: { pic: string; total: number; done: number; pending: number; overdue: number; completionPct: number | null }[] }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-border bg-surface/70">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-divider bg-white/80 text-[0.74rem] uppercase tracking-[0.02em] text-muted">
          <tr>
            <th className="px-3 py-2 text-left">PIC</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Done</th>
            <th className="px-3 py-2 text-right">Pending</th>
            <th className="px-3 py-2 text-right">Hutang</th>
            <th className="px-3 py-2 text-right">Overdue</th>
            <th className="px-3 py-2 text-right">Completion %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.pic} className="border-b border-divider">
              <td className="px-3 py-2 text-[0.9rem] font-semibold text-ink">{it.pic}</td>
              <td className="px-3 py-2 text-right text-[0.9rem] text-ink">{it.total}</td>
              <td className="px-3 py-2 text-right text-[0.9rem] text-success">{it.done}</td>
              <td className="px-3 py-2 text-right text-[0.9rem] text-warning">{it.pending}</td>
              <td className="px-3 py-2 text-right text-[0.9rem] text-warning">{it.total - it.done}</td>
              <td className={`px-3 py-2 text-right text-[0.9rem] ${it.overdue > 0 ? "text-danger" : "text-muted"}`}>{it.overdue}</td>
              <td className="px-3 py-2 text-right text-[0.9rem] text-ink">{formatPercent(it.completionPct ?? 0, it.completionPct !== null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dependency-free funnel bars: Planned → … → Published. */
function FunnelBars({ stages }: { stages: { key: ProdStage; label: string; count: number }[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  const rowH = 42;
  const chartH = Math.max(stages.length * rowH + 24, 96);
  const fillFor: Record<ProdStage, string> = {
    notStarted: PALETTE.grid, inProduction: PALETTE.catBlue, review: PALETTE.catTeal, revision: PALETTE.catOrange, done: PALETTE.success, published: PALETTE.brand,
  };
  return (
    <div style={{ height: `${chartH}px` }}>
      <svg viewBox={`0 0 400 ${chartH}`} role="img" aria-label="Production Funnel" className="h-full w-full">
        {stages.map((s, i) => {
          const y = i * rowH + 8;
          const rowW = 400 - 96;
          const w = Math.max((s.count / max) * rowW, s.count > 0 ? 6 : 0);
          return (
            <g key={s.key}>
              <text x="0" y={y + 20} textAnchor="start" fontSize="12.5" fontWeight="600" fill={PALETTE.muted}>{s.label}</text>
              <rect x="120" y={y} width={rowW - 140} height="22" rx="6" fill={PALETTE.grid} opacity="0.35" />
              {s.count > 0 ? <rect x="120" y={y} width={w} height="22" rx="6" fill={fillFor[s.key]} /> : null}
              <text x="396" y={y + 20} textAnchor="end" fontSize="12.5" fontWeight="700" fill={PALETTE.ink}>{String(s.count)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * §1/§10 — Interactive Output Trend (dependency-free hand-rolled SVG).
 * Series: Planned (line+area, PALETTE.muted/grid) and Done (line+area,
 * PALETTE.success). Interactions required by the brief: hover tooltip (HTML,
 * Indonesian: Rencana/Selesai/Delta + crosshair), wheel AND +/− zoom (scale
 * 1..8 around the hovered/focused week), drag pan (clamped), Reset View, and
 * legend toggles (at least one series always visible). Zero charting library.
 * `outputTrend()` derivation in sosmed.ts is untouched.
 */
function InteractiveOutputTrend({ points }: { points: { label: string; planned: number; done: number }[] }) {
  const n = points.length;
  const [scale, setScale] = useState(1);
  const [windowStart, setWindowStart] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [showPlanned, setShowPlanned] = useState(true);
  const [showDone, setShowDone] = useState(true);
  const [dragging, setDragging] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startStart: number } | null>(null);

  // One source of truth: {scale, windowStart} → derived visible slice.
  const windowWidth = Math.max(1, Math.ceil(n / scale));
  const maxStart = Math.max(0, n - windowWidth);
  const start = Math.min(windowStart, maxStart);
  const visible = points.slice(start, start + windowWidth);
  const yMax = Math.max(...visible.map((p) => p.planned), 1);
  // Right-size the card to content (scale with visible weeks, capped, no dead footer).
  const plotH = Math.max(180, Math.min(320, 40 * windowWidth));
  const plotInnerBottom = plotH - 8;
  const plotInnerH = plotInnerBottom - 8;
  const vbW = Math.max(120, windowWidth * 120);
  const slotW = vbW / windowWidth;
  const x = (k: number) => (k + 0.5) * slotW; // local slot index 0..windowWidth-1
  const y = (v: number) => plotInnerBottom - (v / yMax) * plotInnerH;

  const plannedVisible = visible.some((p) => p.planned > 0);
  const doneVisible = visible.some((p) => p.done > 0);

  const flatten = (keyIn: "planned" | "done"): string => {
    if (visible.length === 0) return "";
    return visible.map((p, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(2)},${y(p[keyIn]).toFixed(2)}`).join(" ");
  };
  const areaPathOf = (keyIn: "planned" | "done"): string => {
    if (visible.length === 0) return "";
    const seg = flatten(keyIn);
    return `${seg} L${x(visible.length - 1).toFixed(2)},${plotInnerBottom.toFixed(2)} L${x(0).toFixed(2)},${plotInnerBottom.toFixed(2)} Z`;
  };

  const clampStart = (s: number) => Math.max(0, Math.min(s, maxStart));

  const zoomAt = (clientX: number, factor: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    const frac = rect && rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const anchor = hover ?? clampStart(start + Math.floor(frac * windowWidth));
    const newScale = Math.min(8, Math.max(1, scale * factor));
    const newWidth = Math.max(1, Math.ceil(n / newScale));
    setScale(newScale);
    setWindowStart(clampStart(Math.round(anchor - frac * newWidth)));
  };
  const zoomCenter = (factor: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    zoomAt(rect ? rect.left + rect.width / 2 : 0, factor);
  };
  const reset = () => { setScale(1); setWindowStart(0); setHover(null); };

  const isTransformDefault = scale === 1 && start === 0;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startStart: start };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(clampStart(start + Math.floor(frac * windowWidth)));
    if (dragRef.current) {
      const dw = Math.round(((e.clientX - dragRef.current.startX) / rect.width) * windowWidth);
      setWindowStart(clampStart(dragRef.current.startStart - dw));
    }
  };
  const stopDrag = () => { dragRef.current = null; setDragging(false); };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => { e.preventDefault(); zoomAt(e.clientX, e.deltaY < 0 ? 1.4 : 1 / 1.4); };

  const hoverPt = hover !== null ? points[hover] : null;
  const hoverFrac = hover !== null && start <= hover && hover < start + windowWidth ? (hover - start + 0.5) / windowWidth : null;
  const hoverYTick = hoverPt ? y(showPlanned ? hoverPt.planned : hoverPt.done) : plotInnerBottom;
  const tipLeft = Math.min(Math.max(hoverFrac !== null ? hoverFrac * 100 : 50, 14), 86);

  return (
    <div className="relative rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
      {/* Legend row (Rencana / Selesai) + toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={showPlanned}
            aria-label="Tampilkan atau sembunyikan seri Rencana"
            onClick={() => setShowPlanned((s) => (s && !showDone ? s : !s))}
            className={`inline-flex items-center gap-2 rounded-[10px] border px-2.5 py-1 text-[0.82rem] font-semibold transition-colors ${showPlanned ? "border-border bg-surface-input text-ink" : "border-border/60 bg-transparent text-muted/60"}`}
          >
            <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: showPlanned && plannedVisible ? PALETTE.muted : "rgba(0,0,0,0.25)" }} />
            Rencana{showPlanned ? `: ${hoverPt ? hoverPt.planned : visible.reduce((s, p) => s + p.planned, 0)}` : ""}
          </button>
          <button
            type="button"
            aria-pressed={showDone}
            aria-label="Tampilkan atau sembunyikan seri Selesai"
            onClick={() => setShowDone((s) => (s && !showPlanned ? s : !s))}
            className={`inline-flex items-center gap-2 rounded-[10px] border px-2.5 py-1 text-[0.82rem] font-semibold transition-colors ${showDone ? "border-border bg-surface-input text-ink" : "border-border/60 bg-transparent text-muted/60"}`}
          >
            <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: showDone && doneVisible ? PALETTE.success : "rgba(0,0,0,0.25)" }} />
            Selesai{showDone ? `: ${hoverPt ? hoverPt.done : visible.reduce((s, p) => s + p.done, 0)}` : ""}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isTransformDefault ? (
            <button type="button" onClick={reset} aria-label="Reset tampilan tren"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface-input px-2.5 py-1 text-[0.8rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover">
              ⤺ Reset View
            </button>
          ) : null}
          <span className="text-[0.72rem] tabular-nums text-muted">Skala {scale.toFixed(1)}×</span>
          <button type="button" onClick={() => zoomCenter(1.5)} aria-label="Perbesar tren" className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-surface-input text-ink hover:border-brand/40">＋</button>
          <button type="button" onClick={() => zoomCenter(1 / 1.5)} aria-label="Perkecil tren" className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border bg-surface-input text-ink hover:border-brand/40">−</button>
        </div>
      </div>

      {/* Plot surface — pan = pointer drag, zoom = wheel, hover = snap to week */}
      <div
        ref={plotRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
        onWheel={onWheel}
        role="img"
        aria-label="Tren output per minggu — seri Rencana dan Selesai"
        className={`relative touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <svg viewBox={`0 0 ${vbW} ${plotH}`} preserveAspectRatio="none"
          className={`w-full ${visible.length ? "block" : "hidden"}`} style={{ height: `${plotH}px` }} aria-hidden>
          {/* horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const gy = plotInnerBottom - f * plotInnerH;
            return <line key={f} x1={0} y1={gy} x2={vbW} y2={gy} stroke={PALETTE.grid} strokeWidth={1} strokeDasharray={f === 0 ? "0" : "3 3"} />;
          })}
          {showPlanned && plannedVisible ? (
            <g>
              <path d={areaPathOf("planned")} fill={PALETTE.grid} opacity={0.55} />
              <path d={flatten("planned")} fill="none" stroke={PALETTE.muted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ) : null}
          {showDone && doneVisible ? (
            <g>
              <path d={areaPathOf("done")} fill={PALETTE.success} opacity={0.18} />
              <path d={flatten("done")} fill="none" stroke={PALETTE.success} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ) : null}
        </svg>

        {/* crosshair guide lines */}
        {hoverFrac !== null && (showPlanned || showDone) ? (
          <>
            <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-muted/60" style={{ left: `${hoverFrac * 100}%` }} />
            <div aria-hidden className="pointer-events-none absolute left-0 right-0 h-px bg-muted/40" style={{ top: `${((plotH - hoverYTick) / plotH) * 100}%` }} />
          </>
        ) : null}

        {/* hovered series dots */}
        {hoverFrac !== null && hoverPt ? (
          <>
            {showPlanned && plannedVisible ? (
              <div aria-hidden className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                style={{ left: `${hoverFrac * 100}%`, top: `${((plotH - y(hoverPt.planned)) / plotH) * 100}%`, background: PALETTE.ink }} />
            ) : null}
            {showDone && doneVisible && hoverPt.done > 0 ? (
              <div aria-hidden className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                style={{ left: `${hoverFrac * 100}%`, top: `${((plotH - y(hoverPt.done)) / plotH) * 100}%`, background: PALETTE.success }} />
            ) : null}
          </>
        ) : null}
      </div>

      {/* week labels under the plot */}
      <div className="mt-1.5 flex w-full items-end gap-1">
        <span className="w-10 shrink-0 text-[0.68rem] font-semibold text-muted">Maks {yMax}</span>
        <div className="flex min-w-0 flex-1">
          {visible.map((p, k) => (
            <span key={`${start + k}-${p.label}`} className="flex-1 truncate text-center text-[0.68rem] tabular-nums text-muted" title={p.label}>{p.label}</span>
          ))}
        </div>
      </div>

      {/* HTML tooltip (pointer-events-none, Indonesian) */}
      {hoverPt ? (
        <div role="status" className="pointer-events-none absolute z-10 min-w-[11rem] rounded-[12px] border border-border bg-surface p-2.5 shadow-[var(--dm-shadow-panel)]"
          style={{ left: `${tipLeft}%`, top: "8px", transform: "translateX(-50%)" }}>
          <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-wide text-muted">Minggu {hoverPt.label}</p>
          <p className="text-[0.85rem] text-ink"><span className="font-semibold">Rencana:</span> {hoverPt.planned}</p>
          <p className="text-[0.85rem] text-ink"><span className="font-semibold">Selesai:</span> {hoverPt.done}</p>
          <p className={`text-[0.85rem] font-semibold ${hoverPt.done - hoverPt.planned < 0 ? "text-danger" : "text-success"}`}>Delta: {hoverPt.done - hoverPt.planned}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A horizontal distribution bar for a strategy bucket. */
function StrategyBar({ value, count, sharePct, fill }: { value: string; count: number; sharePct: number; fill: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-[0.82rem] font-medium text-ink">{value}</span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-strong">
        <span className="block h-full" style={{ width: `${Math.max(sharePct, 1)}%`, background: fill }} />
      </span>
      <span className="w-10 shrink-0 text-right text-[0.82rem] font-semibold text-ink">{count}</span>
      <span className="w-12 shrink-0 text-right text-[0.75rem] text-muted">{formatPercent(sharePct, sharePct > 0)}</span>
    </div>
  );
}

/** Small colour chip + count (used inside deadline list). */
function countChip(label: string, count: number, tone: string) {
  return (
    <div className={`flex items-center justify-between rounded-[12px] border px-3 py-2 ${tone}`}>
      <span className="text-[0.85rem] font-semibold text-ink">{label}</span>
      <span className="text-[1rem] font-extrabold text-ink">{count}</span>
    </div>
  );
}

/** Compact content row: title, PIC, deadline, platform/status. */
function ActionItemRow({ item }: { item: { title: string; pic: string; deadline: string; platform: string; status: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-2">
      <span className="min-w-0 flex-1 truncate text-[0.87rem] font-semibold text-ink" title={item.title}>{item.title}</span>
      <span className="shrink-0 text-[0.8rem] text-muted">{item.pic}</span>
      <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[0.75rem] font-medium text-muted">⏰ {item.deadline}</span>
      {item.platform && item.platform !== "—" ? (
        <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[0.75rem] font-semibold text-brand-hover">📲 {item.platform}</span>
      ) : null}
      {item.status ? <span className="shrink-0 text-[0.75rem] text-muted">· {item.status}</span> : null}
    </div>
  );
}

/** Filter card header treatment (funnel icon + label). */
function filterCardHeader(label: string) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[0.82rem] font-semibold text-muted">
      <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 3h8M14 3v2M4 9h8M14 9v2M4 15a2 2 0 0 1 1 3h7" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Local field primitives (copied from shared Field.tsx — type="date" + a red
 * error-state variant). The shared TextInput has no date type and no className
 * escape hatch (shared-component ban), so the Planner uses these local ones.
 * ------------------------------------------------------------------------ */

const FIELD_BASE =
  "w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink " +
  "placeholder:text-muted/70 focus:border-brand focus:shadow-[var(--dm-shadow-xs)] " +
  "focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

/** Native date input (emit/read ISO YYYY-MM-DD; sheet stores a date value). */
function DateField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={FIELD_BASE}
    />
  );
}

/** Labelled field wrapper used by the Planner grid (label above control). */
function PlannerField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.82rem] font-semibold text-muted">{label}{required ? <span className="text-danger"> *</span> : null}</label>
      {children}
    </div>
  );
}

/** §2.1/§4.1 — the Content Planner modal (child of the §3 component). */
function ContentPlannerModal({
  open, options, form, setForm, planFormValid, saving, planError,
  onSave, onClose,
}: {
  open: boolean;
  options: { pillar: string[]; format: string[]; platform: string[]; pic: string[]; priority: string[] };
  form: Record<string, string>;
  setForm: (k: string, v: string) => void;
  planFormValid: boolean;
  saving: boolean;
  planError: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const sel = (v: string) => ({ value: v, label: v });
  return (
    <div role="dialog" aria-modal="true" aria-label="Content Plan Baru"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/60 backdrop-blur-md px-4 py-10">
      <div className="w-full max-w-3xl rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow-panel)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-[1.25rem] font-extrabold text-ink">Content Plan Baru</h2>
            <p className="text-[0.85rem] text-muted">Rencanakan konten; jadwal produksi Anda akan otomatis dibuat saat disimpan atau ditambahkan ke produksi.</p>
          </div>
          <button type="button" aria-label="Tutup" onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-muted hover:text-ink">✕</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PlannerField label="Judul / Ide Konten" required>
              <input type="text" value={form.judul} onChange={(e) => setForm("judul", e.target.value)}
                placeholder="Tulis judul atau ide konten…" aria-label="Judul / Ide Konten"
                className={`${FIELD_BASE} ${form.judul.trim() === "" && planError ? "border-danger focus:border-danger focus:ring-danger" : ""}`} />
            </PlannerField>
          </div>
          <PlannerField label="Tanggal Publish" required>
            <DateField value={form.publish} onChange={(v) => setForm("publish", v)} />
          </PlannerField>
          <PlannerField label="Deadline Produksi" required>
            <DateField value={form.deadlineProduksi} onChange={(v) => setForm("deadlineProduksi", v)} />
          </PlannerField>
          <PlannerField label="Content Pillar">
            <Select value={form.pillar} options={options.pillar.map(sel)} onSelect={(v) => setForm("pillar", v)} />
          </PlannerField>
          <PlannerField label="Format">
            <Select value={form.format} options={options.format.map(sel)} onSelect={(v) => setForm("format", v)} />
          </PlannerField>
          <PlannerField label="Platform">
            <Select value={form.platform} options={options.platform.map(sel)} onSelect={(v) => setForm("platform", v)} />
          </PlannerField>
          <PlannerField label="PIC">
            <Select value={form.pic} options={options.pic.map(sel)} onSelect={(v) => setForm("pic", v)} />
          </PlannerField>
          <div className="sm:col-span-2">
            <PlannerField label="Brief">
              <textarea value={form.brief} onChange={(e) => setForm("brief", e.target.value)} rows={3}
                placeholder="Deskripsi singkat / brief konten…" aria-label="Brief"
                className={`${FIELD_BASE} h-auto py-2 resize-none`} />
            </PlannerField>
          </div>
          <div className="sm:col-span-2">
            <PlannerField label="Reference Link">
              <input type="url" value={form.reference} onChange={(e) => setForm("reference", e.target.value)}
                placeholder="https://…" aria-label="Reference Link"
                className={FIELD_BASE} />
            </PlannerField>
          </div>
          <PlannerField label="Priority">
            <Select value={form.priority} options={options.priority.map(sel)} onSelect={(v) => setForm("priority", v)} />
          </PlannerField>
          <PlannerField label="Status Plan">
            <Select value={form.statusPlan} options={["IDEA", "PLANNED", "APPROVED"].map(sel)} onSelect={(v) => setForm("statusPlan", v)} />
          </PlannerField>
        </div>
        {planError ? <p role="status" className="mt-3 text-[0.85rem] font-semibold text-danger">{planError}</p> : null}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-divider pt-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button variant="primary" onClick={onSave} disabled={saving || !planFormValid}>
            {saving ? "Menyimpan..." : "Simpan Content Plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Master Content Data EXPLORER (§5).
 *
 * Rendered TWICE from one shared state (inline + fullscreen) so the two never
 * diverge (§5.9). It is presentational: all explorer state (search, page,
 * visible columns, filters, draft) lives in the parent SosmedDashboard and is
 * threaded in as props. `embedded` toggles inline chrome (section card) vs
 * fullscreen chrome; the toolbar/search/filters/table/pagination are identical.
 * ------------------------------------------------------------------------ */

const EXPLORER_PAGE_SIZE = 15;

interface ExplorerFilterDim {
  name: string;
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onReplace: (vals: Iterable<string>) => void;
}

const btnPage =
  "h-8 min-w-8 rounded-[8px] border border-border bg-surface-input px-2 text-[0.8rem] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand/40";
const btnReset =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover";

function ContentExplorer({
  rows,
  isEditor,
  embedded,
  originalIndex,
  onOpenDetail,
  query, setQuery,
  page, setPage, totalPages,
  visibleCols, setVisibleCols,
  colMenuOpen, setColMenuOpen,
  openMenu, setOpenMenu,
  filterDims,
  dlSel, setDlSel,
  onResetFilters,
  saving, setCell, cellValue,
  pics, statusOptions,
  runSave, saveMsg,
  onExpand,
}: {
  rows: Row[];
  isEditor: boolean;
  embedded: boolean;
  originalIndex: (r: Row) => number;
  onOpenDetail: (r: Row) => void;
  query: string; setQuery: (v: string) => void;
  page: number; setPage: (v: number) => void; totalPages: number;
  visibleCols: string[]; setVisibleCols: (cols: string[]) => void;
  colMenuOpen: boolean; setColMenuOpen: (v: boolean) => void;
  openMenu: string | null; setOpenMenu: (n: string | null) => void;
  filterDims: ExplorerFilterDim[];
  dlSel: string; setDlSel: (v: string) => void;
  onResetFilters: () => void;
  saving: boolean;
  setCell: (r: number, c: string, v: string | boolean) => void;
  cellValue: (r: Row, c: string) => unknown;
  pics: string[]; statusOptions: string[];
  runSave: () => void; saveMsg: { kind: "ok" | "err" | "info"; text: string } | null;
  onExpand: () => void;
}) {
  // For the column-management popover + table render.
  const [colQuery, setColQuery] = useState("");
  const colWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colMenuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (colWrapRef.current && !colWrapRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [colMenuOpen, setColMenuOpen]);

  const cols = COLUMN_DEFS.filter((d) => visibleCols.includes(d.key));
  const start = rows.length === 0 ? 0 : (page - 1) * EXPLORER_PAGE_SIZE + 1;
  const end = Math.min(page * EXPLORER_PAGE_SIZE, rows.length);
  const pageRows = rows.slice((page - 1) * EXPLORER_PAGE_SIZE, page * EXPLORER_PAGE_SIZE);
  const countLine = rows.length === 0
    ? "Menampilkan 0 konten"
    : `Menampilkan ${start}–${end} dari ${rows.length} konten`;
  const pageWindows = paginationWindow(page, totalPages);
  const deadlines: { value: string; label: string }[] = [
    { value: "ALL", label: "Semua" },
    { value: "overdue", label: "Overdue" },
    { value: "dueToday", label: "Due Today" },
    { value: "dueThisWeek", label: "Due This Week" },
    { value: "future", label: "Future" },
    { value: "completed", label: "Completed" },
  ];
  const colDefOf = (key: string) => COLUMN_DEFS.find((d) => d.key === key)!;

  const renderCell = (row: Row, key: string) => {
    const def = colDefOf(key);
    const isReadOnly = key === "code" || key === "title" || key === "deadline" || key === "platform";
    const isBool = ["ig", "tiktok", "yt"].includes(key);
    const src = def.source;
    const val = cellValue(row, src);
    if (!isEditor || isReadOnly) {
      if (key === "status") return <ProsesBadge status={str(val)} />;
      if (key === "process") return <ProcessBar status={str(val)} />;
      if (isBool) {
        const on = typeof val === "boolean" ? val : truthy(val);
        return on ? <span className="text-[0.95rem]" title="Sudah diposting">✅</span> : <span className="text-muted text-[0.95rem]" title="Belum diposting">◦</span>;
      }
      if (key === "reference") {
        const s = str(val).trim();
        return s ? <a href={s} target="_blank" rel="noreferrer" className="truncate inline-block max-w-[16rem] text-brand-hover hover:underline" title={s}>{s}</a> : <span className="text-muted">—</span>;
      }
      if (key === "notes") {
        const s = str(val);
        return <span className="truncate block max-w-[16rem]" title={s}>{s || "—"}</span>;
      }
      if (key === "title") {
        const t = str(val);
        return <span className="truncate block max-w-[16rem] font-semibold text-ink" title={t}>{t || "—"}</span>;
      }
      if (key === "code") return <span className="font-mono text-[0.8rem] text-ink">{str(val) || "—"}</span>;
      if (key === "pillar") { const s = str(val); return <span className="truncate block max-w-[16rem]" title={s}>{s || "—"}</span>; }
      return <span className="text-ink">{str(val) || "—"}</span>;
    }
    // editor
    const idx = originalIndex(row);
    if (key === "pic") {
      return <Select value={str(val)} options={pics.map((o) => ({ value: o, label: o }))} onSelect={(v) => setCell(idx, "PIC", v)} />;
    }
    if (key === "status") {
      return <Select value={str(val)} options={statusOptions.map((o) => ({ value: o, label: o }))} onSelect={(v) => setCell(idx, "PROSES", v)} />;
    }
    if (key === "format") {
      return <input type="text" value={str(val)} onChange={(e) => setCell(idx, "Output", e.target.value)} className="w-24 rounded-[8px] border border-border bg-surface-input px-2 py-1 text-[0.82rem] text-ink" />;
    }
    if (isBool) {
      const on = typeof val === "boolean" ? val : truthy(val);
      return <Checkbox checked={on} onToggle={(v) => setCell(idx, src, v)} />;
    }
    return <span className="text-ink">{str(val) || "—"}</span>;
  };

  return (
    <div>
      {/* Toolbar: search + columns + expand */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2.5">
        <div className="relative min-w-[220px] flex-1">
          <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔎</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari konten, kode, PIC…" aria-label="Cari konten"
            className="w-full h-9 rounded-[10px] border border-border bg-surface-input pl-8 pr-3 text-[0.82rem] text-ink placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none" />
        </div>
        <div ref={colWrapRef} className="relative">
          <button type="button" onClick={() => setColMenuOpen(!colMenuOpen)} aria-expanded={colMenuOpen} aria-haspopup="menu"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface-input px-3 text-[0.82rem] font-semibold text-ink hover:border-brand/40">
            ⚙ Kolom
          </button>
          {colMenuOpen ? (
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-[12px] border border-border bg-surface p-2 shadow-[var(--dm-shadow-panel)]">
              <input value={colQuery} onChange={(e) => setColQuery(e.target.value)} placeholder="Cari kolom…" aria-label="Cari kolom"
                className="w-full rounded-[8px] border border-border bg-surface-input px-2.5 py-1.5 text-[0.82rem] text-ink placeholder:text-muted focus:border-brand" />
              <label className="mt-1 flex cursor-pointer items-center gap-2 border-b border-divider py-1.5 text-[0.82rem] font-medium text-ink">
                <input type="checkbox" checked={visibleCols.length === COLUMN_DEFS.length} onChange={() => setVisibleCols(visibleCols.length === COLUMN_DEFS.length ? [...EXPLORER_DEFAULT_COLS] : COLUMN_DEFS.map((d) => d.key))}
                  className="h-[15px] w-[15px] accent-brand" />
                Pilih Semua
              </label>
              <div className="max-h-[220px] overflow-y-auto pt-1">
                {COLUMN_DEFS.filter((d) => !colQuery.trim() || d.header.toLowerCase().includes(colQuery.trim().toLowerCase())).map((d) => {
                  const on = visibleCols.includes(d.key);
                  return (
                    <label key={d.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-[0.82rem] font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          // keep at least one column visible (guard)
                          const next = on ? visibleCols.filter((k) => k !== d.key) : [...visibleCols, d.key];
                          if (next.length > 0) setVisibleCols(next);
                        }}
                        className="h-[15px] w-[15px] accent-brand"
                      />
                      <span className="min-w-0 truncate">{d.header}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onExpand} aria-label="Perluas ke layar penuh"
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface-input px-3 text-[0.82rem] font-semibold text-ink hover:border-brand/40">
          ↗ Perluas
        </button>
      </div>

      {/* Filters + Reset */}
      <div className="flex flex-wrap items-end gap-3 border-b border-divider px-3 py-3">
        <div className="grid w-full grid-cols-2 xl:grid-cols-4 gap-3">
          {filterDims.map((d) => (
            <MultiSelectDropdown key={d.name} name={d.name} label={d.label} options={d.options} selected={d.selected}
              onToggle={d.onToggle} onReplace={d.onReplace} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          ))}
          <div className="flex flex-col gap-1">
            <label className="text-[0.82rem] font-semibold text-muted">Deadline</label>
            <select value={dlSel} onChange={(e) => setDlSel(e.target.value)} aria-label="Deadline"
              className="w-full h-9 rounded-[10px] border border-border bg-surface-input px-2 text-[0.82rem] text-ink focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none">
              {deadlines.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={onResetFilters} className={btnReset}>Reset Filter</button>
          </div>
        </div>
      </div>

      {/* Count line */}
      <div className="flex justify-end px-3 pt-2 text-[0.8rem] text-muted">{countLine}</div>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[0.9rem] font-semibold text-muted">Tidak ada konten sesuai pencarian/filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-border bg-surface shadow-[var(--dm-shadow)]">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead className="sticky top-0 z-10 border-b border-divider bg-white/90 backdrop-blur-[8px]">
              <tr>
                {cols.map((d) => (
                  <th key={d.key} className="px-3 py-2 text-left text-[0.8rem] font-semibold uppercase tracking-[0.02em] text-muted">{d.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={originalIndex(row)} tabIndex={-1} onClick={() => onOpenDetail(row)}
                  className={`cursor-pointer transition-colors hover:bg-brand/[0.03] ${i % 2 === 0 ? "bg-white/70" : "bg-white/85"}`}>
                  {cols.map((d) => (
                    <td key={d.key} className="border-b border-divider px-3 py-2.5 text-[0.85rem]">{renderCell(row, d.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pager */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-[0.8rem] text-muted">{countLine}</span>
        {rows.length > 0 ? (
          <nav aria-label="Navigasi halaman" className="flex items-center gap-1">
            <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={btnPage} aria-label="Sebelumnya">Sebelumnya</button>
            {pageWindows.map((p) => p === "…"
              ? <span key={p} className="px-1 text-muted">…</span>
              : <button key={p} type="button" aria-current={p === page ? "page" : undefined}
                  onClick={() => setPage(Number(p))}
                  className={`${btnPage} ${p === page ? "bg-brand text-white border-brand" : ""}`}>{p}</button>)}
            <button type="button" disabled={page === totalPages} onClick={() => setPage(page + 1)} className={btnPage} aria-label="Berikutnya">Berikutnya</button>
          </nav>
        ) : null}
      </div>

      {/* Editor-only Save (parity with old inline editor) */}
      {isEditor && (
        <div className="mt-3 flex items-center gap-4 px-1">
          <Button variant="primary" onClick={runSave} disabled={saving || rows.length === 0}>
            {saving ? "Menyimpan..." : "💾 Simpan Perubahan"}
          </Button>
          {saveMsg ? <p role="status" className={`text-[0.9rem] font-semibold ${saveMsg.kind === "ok" ? "text-success" : saveMsg.kind === "err" ? "text-danger" : "text-muted"}`}>{saveMsg.text}</p> : null}
        </div>
      )}

      {embedded ? null : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Row-detail drawer (§5.8) — read-only field grid + editor controls.
 * ------------------------------------------------------------------------ */

const DETAIL_FIELDS: { label: string; source: string; kind: string }[] = [
  { label: "Kode Konten", source: "Kode Konten", kind: "mono" },
  { label: "Tanggal Deadline", source: "Tanggal Deadline", kind: "text" },
  { label: "Tanggal Posting", source: "Tanggal Posting", kind: "text" },
  { label: "Output", source: "Output", kind: "text" },
  { label: "Konten Pillar", source: "Konten Pillar", kind: "text" },
  { label: "Platform", source: "Platform", kind: "text" },
  { label: "PIC", source: "PIC", kind: "text" },
  { label: "Judul Konten", source: "Judul Konten", kind: "text" },
  { label: "Materi Konten", source: "Materi Konten", kind: "text" },
  { label: "CAPTION", source: "  CAPTION ", kind: "text" },
  { label: "Link Cover", source: "LINK COVER", kind: "link" },
  { label: "PROSES", source: "PROSES", kind: "proses" },
  { label: "Link Konten Jadi", source: "LINK KONTEN JADI", kind: "link" },
  { label: "IG", source: "IG", kind: "bool" },
  { label: "TIKTOK", source: "TIKTOK", kind: "bool" },
  { label: "YT", source: "YT", kind: "bool" },
];

function RowDetailDrawer({
  row, rowIndex, onClose, isEditor, editing, setEditing, pics, draft, setCell, saving, runSave, saveMsg,
}: {
  row: Row; rowIndex: number; onClose: () => void; isEditor: boolean;
  editing: boolean; setEditing: (v: boolean) => void;
  pics: string[]; draft: Record<number, Record<string, string | boolean>>;
  setCell: (r: number, c: string, v: string | boolean) => void;
  saving: boolean; runSave: () => void; saveMsg: { kind: "ok" | "err" | "info"; text: string } | null;
}) {
  const idx = rowIndex;
  const val = (c: string) => {
    if (draft[idx] && draft[idx][c] !== undefined) return draft[idx][c];
    return row[c];
  };
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-white/40 backdrop-blur-sm" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Detail Konten"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-surface shadow-[var(--dm-shadow-lift)]">
        <header className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Detail Konten</p>
            <h3 className="truncate text-[1.1rem] font-extrabold text-ink">{str(row["Judul Konten"]) || str(row["Kode Konten"])}</h3>
          </div>
          <button type="button" aria-label="Tutup" onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-input text-muted hover:text-ink">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            {DETAIL_FIELDS.map((f) => {
              return (
                <div key={f.source} className="col-span-1">
                  <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
                  <dd className="break-words text-[0.85rem] text-ink">
                    {f.kind === "mono" ? <span className="font-mono">{str(row[f.source]) || "—"}</span>
                      : f.kind === "link" && str(row[f.source]) ? <a href={str(row[f.source])} target="_blank" rel="noreferrer" className="text-brand-hover hover:underline" title={str(row[f.source])}>{str(row[f.source])}</a>
                        : f.kind === "proses" ? <ProsesBadge status={str(val("PROSES"))} />
                          : f.kind === "bool" ? (truthy(val(f.source))
                            ? <span title="Sudah diposting">✅ Sudah</span>
                            : <span title="Belum diposting" className="text-muted">◦ Belum</span>)
                            : str(val(f.source)) || "—"}
                  </dd>
                </div>
              );
            })}
          </div>

          {/* Editor-only edit controls */}
          {isEditor && editing ? (
            <div className="mt-5 border-t border-divider pt-4 grid gap-3">
              <label className="text-[0.78rem] font-semibold text-muted">PIC
                <Select value={str(val("PIC"))} options={pics.map((o) => ({ value: o, label: o }))} onSelect={(v) => idx >= 0 && setCell(idx, "PIC", v)} />
              </label>
              <label className="text-[0.78rem] font-semibold text-muted">PROSES
                <Select value={str(val("PROSES"))} options={PROSES_OPTIONS.map((o) => ({ value: o, label: o }))} onSelect={(v) => idx >= 0 && setCell(idx, "PROSES", v)} />
              </label>
              <label className="text-[0.78rem] font-semibold text-muted">Output
                <input type="text" value={str(val("Output"))} onChange={(e) => idx >= 0 && setCell(idx, "Output", e.target.value)} className="w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink" />
              </label>
              <div className="flex items-center gap-5">
                {["IG", "YT", "TIKTOK"].map((b) => (
                  <Checkbox key={b} label={b} checked={truthy(val(b))} onToggle={(v) => idx >= 0 && setCell(idx, b, v)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-divider p-4">
          {isEditor ? (
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => {
                if (editing) runSave();
                else setEditing(true);
              }} disabled={saving || idx < 0}>
                {editing ? (saving ? "Menyimpan..." : "💾 Simpan Perubahan") : "Edit"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={!editing || saving}>Batal</Button>
              {saveMsg ? <p role="status" className={`text-[0.85rem] font-semibold ${saveMsg.kind === "ok" ? "text-success" : saveMsg.kind === "err" ? "text-danger" : "text-muted"}`}>{saveMsg.text}</p> : null}
            </div>
          ) : null}
        </footer>
      </aside>
    </>
  );
}

export interface SosmedDashboardProps {
  rows: Row[];
  /** contentType_plan rows (from GET /api/tables/content_plan). */
  planRows?: Row[];
  /** True when the signed-in user may edit (GET /api/auth/me role === editor). */
  isEditor: boolean;
  onRefresh?: () => void;
}

export function SosmedDashboard({ rows, planRows = [], isEditor, onRefresh }: SosmedDashboardProps) {
  const months = useMemo(() => sosmedMonths(rows), [rows]);
  const pics = useMemo(() => picOptions(rows), [rows]);
  const statusOptions = useMemo(() => ["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"], []);
  const platformOptions = useMemo(() => distinctValues(rows, "Platform"), [rows]);
  const pillarOptions = useMemo(() => distinctValues(rows, "Konten Pillar"), [rows]);
  const formatOptions = useMemo(() => distinctValues(rows, "Output"), [rows]);
  const planOptions = useMemo(() => {
    const collect = (col: string) => distinctValues(planRows.length ? planRows : [], col);
    const priority = distinctValues(planRows, "Priority");
    return {
      pillar: collect("Content Pillar"), format: collect("Format"), platform: collect("Platform"), pic: collect("PIC"),
      priority: priority.length ? priority : ["High", "Medium", "Low"],
    };
  }, [planRows]);

  // --- global section-1 filter (existing behavior, default all selected) ---
  const [picSel, setPicSel] = useState<Set<string>>(() => new Set(pics));
  const [monthSel, setMonthSel] = useState<Set<string>>(() => latestDeadlineMonthSet(months, rows));
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set(statusOptions));
  const [platformSel, setPlatformSel] = useState<Set<string>>(() => new Set(platformOptions));
  const [pillarSel, setPillarSel] = useState<Set<string>>(() => new Set(pillarOptions));
  const [formatSel, setFormatSel] = useState<Set<string>>(() => new Set(formatOptions));
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const resetAll = () => {
    setPicSel(new Set(pics)); setMonthSel(latestDeadlineMonthSet(months, rows)); setStatusSel(new Set(statusOptions));
    setPlatformSel(new Set(platformOptions)); setPillarSel(new Set(pillarOptions)); setFormatSel(new Set(formatOptions));
    setOpenMenu(null);
  };

  const filterDims: {
    name: string; label: string; hint?: string; className?: string; options: string[]; selected: Set<string>; set: (s: Set<string>) => void;
  }[] = [
    { name: "pic", label: "PIC", className: "md:col-span-1 xl:col-span-2", options: pics, selected: picSel, set: setPicSel },
    { name: "month", label: "Bulan Deadline", hint: "tugas berdasarkan deadline", options: months, selected: monthSel, set: setMonthSel },
    { name: "status", label: "Status", hint: "PROSES", options: statusOptions, selected: statusSel, set: setStatusSel },
    { name: "platform", label: "Platform", options: platformOptions, selected: platformSel, set: setPlatformSel },
    { name: "pillar", label: "Content Pillar", options: pillarOptions, selected: pillarSel, set: setPillarSel },
    { name: "format", label: "Format", options: formatOptions, selected: formatSel, set: setFormatSel },
  ];
  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const filtered = useMemo(
    () => filterRows(rows, { pics: picSel, months: monthSel, statuses: statusSel, platforms: platformSel, pillars: pillarSel, formats: formatSel }),
    [rows, picSel, monthSel, statusSel, platformSel, pillarSel, formatSel],
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

  // Map a row back to its ORIGINAL index in the UNFILTERED `rows` array — the
  // slate-backed index used for PATCH rowIndex (sheet data row identity).
  const originalIndex = (r: Row): number => {
    const i = rows.indexOf(r);
    if (i >= 0) return i;
    return typeof r.__rowIndex === "number" ? r.__rowIndex : -1;
  };

  // --- shared editor draft + save (Explorer + detail drawer) ---
  type Draft = Record<number, Record<string, string | boolean>>;
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const setCell = (rowIndex: number, col: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [rowIndex]: { ...(d[rowIndex] ?? {}), [col]: value } }));
    setSaveMsg(null);
  };
  const cellValue = (row: Row, col: string): unknown => {
    const idx = originalIndex(row);
    if (idx >= 0 && draft[idx] && draft[idx][col] !== undefined) return draft[idx][col];
    return row[col];
  };

  /** Save iterates the CURRENT page slice (rows the user can see). */
  const runSaveFor = async (targetRows: Row[]) => {
    setSaveMsg(null);
    const fullDraft: Draft = {};
    for (const row of targetRows) {
      const idx = originalIndex(row);
      if (idx < 0) continue;
      const edited = draft[idx] ?? {};
      fullDraft[idx] = {
        ...Object.fromEntries(SOSMED_BOOL_COLS.map((c) => [c, truthy(row[c])])),
        ...Object.fromEntries(SOSMED_TEXT_COLS.map((c) => [c, str(row[c])])),
        ...edited,
      };
    }
    const patches = diffPatches(rows, fullDraft);
    if (patches.length === 0) { setSaveMsg({ kind: "info", text: "Tidak ada perubahan." }); return; }
    setSaving(true);
    let ok = 0, err = 0;
    for (const p of patches) {
      try { await patchJson<SosmedPatch>("/api/tables/sosmed", p); ok++; }
      catch { err++; }
    }
    if (ok > 0) onRefresh?.();
    setSaving(false);
    if (err > 0) setSaveMsg({ kind: "err", text: `⚠️ ${err} perubahan gagal.` });
    else if (ok > 0) setSaveMsg({ kind: "ok", text: `✅ ${ok} perubahan tersimpan.` });
    else setSaveMsg({ kind: "ok", text: "✅ 0 perubahan tersimpan." });
  };

  // --- content_plan (+ Add-to-Production) state ---
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [planForm, setPlanForm] = useState<Record<string, string>>({ judul: "", publish: "", deadlineProduksi: "", pillar: "", format: "", platform: "", pic: "", brief: "", reference: "", priority: "", statusPlan: "IDEA" });
  const setPlanField = (k: string, v: string) => setPlanForm((f) => ({ ...f, [k]: v }));
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [pushedSet, setPushedSet] = useState<Set<number>>(new Set());

  const planFormValid = planForm.judul.trim() !== "" && planForm.publish.trim() !== "" && planForm.deadlineProduksi.trim() !== "";

  const saveContentPlan = async () => {
    setPlanError(null);
    if (!planFormValid) { setPlanError("⚠️ Isi judul dan tanggal sebelum menyimpan."); return; }
    setSavingPlan(true);
    try {
      await postJson("/api/tables/content_plan", buildPlanPayload({
        judul: planForm.judul, publish: planForm.publish, deadlineProduksi: planForm.deadlineProduksi,
        pillar: planForm.pillar, format: planForm.format, platform: planForm.platform, pic: planForm.pic,
        brief: planForm.brief, reference: planForm.reference, priority: planForm.priority, statusPlan: planForm.statusPlan,
      }));
      setSavingPlan(false);
      setPlannerOpen(false);
      setPlanForm({ judul: "", publish: "", deadlineProduksi: "", pillar: "", format: "", platform: "", pic: "", brief: "", reference: "", priority: "", statusPlan: "IDEA" });
      onRefresh?.();
      setSaveMsg({ kind: "ok", text: "✅ Content plan tersimpan." });
    } catch {
      setSavingPlan(false);
      setPlanError("⚠️ Gagal menyimpan. Coba lagi.");
    }
  };

  /** §6.3 — is this plan row already pushed (session OR durable data)? */
  const planIsPushed = (plan: Row, rowIndex: number): boolean => {
    if (pushedSet.has(rowIndex)) return true;
    const kode = contentKode(TODAY, rowIndex);
    if (productionKodeExists(rows, kode)) return true;
    return str(plan["Status Plan"]).trim().toUpperCase() === "DIPRODUKSI";
  };

  const addToProduction = async (plan: Row, rowIndex: number) => {
    if (planIsPushed(plan, rowIndex)) { setSaveMsg({ kind: "info", text: "ℹ️ Sudah ditambahkan ke produksi." }); return; }
    const kode = contentKode(TODAY, rowIndex);
    try {
      await postJson("/api/tables/sosmed", buildProductionRow(plan, TODAY, kode));
      setPushedSet((prev) => new Set(prev).add(rowIndex));
      // Durable lock: flip Status Plan -> DIPRODUKSI so a fresh reload hides the button.
      try { await patchJson<SosmedPatch>("/api/tables/content_plan", { rowIndex, column: "Status Plan", value: "DIPRODUKSI" }); } catch { /* lock persisted best-effort; kode collision also guards */ }
      onRefresh?.();
      setSaveMsg({ kind: "ok", text: `✅ Ditambahkan ke produksi: ${str(plan["Judul / Ide Konten"] || plan["Judul Konten"])}.` });
    } catch {
      setSaveMsg({ kind: "err", text: "⚠️ Gagal menambahkan ke produksi." });
    }
  };

  // --- §4 Content Planning tabs + calendar cursor + detail drawer ---
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [calCursor, setCalCursor] = useState(() => calendarDefaultMonth(filtered, TODAY));
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const detailOpen = (row: Row) => { setEditingDetail(false); setSaveMsg(null); setDetailRow(row); };

  const calendarRows = useMemo(
    () => filtered.filter((r) => deadlineDate(r) !== null),
    [filtered],
  );
  const cells = useMemo(() => calendarCells(calendarRows, calCursor.getFullYear(), calCursor.getMonth(), TODAY), [calendarRows, calCursor]);

  // --- §5 explorer state (shared between inline + fullscreen) ---
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  // Search query change resets pagination to page 1 (event-handler, per §5.3).
  const handleQuery = (v: string) => { if (v !== query) setPage(1); setQuery(v); };
  const [visibleCols, setVisibleCols] = useState<string[]>(() => [...EXPLORER_DEFAULT_COLS]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [explPics, setExplPics] = useState<Set<string>>(() => new Set(pics));
  const [explMonths, setExplMonths] = useState<Set<string>>(() => new Set(months));
  const [explStatuses, setExplStatuses] = useState<Set<string>>(() => new Set(statusOptions));
  const [explPlatforms, setExplPlatforms] = useState<Set<string>>(() => new Set(platformOptions));
  const [explPillars, setExplPillars] = useState<Set<string>>(() => new Set(pillarOptions));
  const [explFormats, setExplFormats] = useState<Set<string>>(() => new Set(formatOptions));
  const [dlSel, setDlSel] = useState<string>("ALL");

  const explorerFiltered = useMemo(
    () => filterRows(rows, { pics: explPics, months: explMonths, statuses: explStatuses, platforms: explPlatforms, pillars: explPillars, formats: explFormats }),
    [rows, explPics, explMonths, explStatuses, explPlatforms, explPillars, explFormats],
  );
  const deadlinePredicated = useMemo(() => {
    if (dlSel === "ALL") return explorerFiltered;
    return explorerFiltered.filter((r) => deadlineBucket(r, TODAY) === (dlSel as DeadlineBucket));
  }, [explorerFiltered, dlSel]);
  const explorerRows = useMemo(() => searchContents(deadlinePredicated, debouncedQ), [deadlinePredicated, debouncedQ]);
  const totalPages = Math.max(1, Math.ceil(explorerRows.length / EXPLORER_PAGE_SIZE));
  // Clamp the working page into [1, totalPages] at render time (no effect/setState).
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const explorerFilterDims: ExplorerFilterDim[] = [
    { name: "exp-pic", label: "PIC", options: pics, selected: explPics, onToggle: (v) => toggle(explPics, v, setExplPics), onReplace: (vals) => setExplPics(new Set(vals)) },
    { name: "exp-month", label: "Bulan", options: months, selected: explMonths, onToggle: (v) => toggle(explMonths, v, setExplMonths), onReplace: (vals) => setExplMonths(new Set(vals)) },
    { name: "exp-status", label: "Status", options: statusOptions, selected: explStatuses, onToggle: (v) => toggle(explStatuses, v, setExplStatuses), onReplace: (vals) => setExplStatuses(new Set(vals)) },
    { name: "exp-platform", label: "Platform", options: platformOptions, selected: explPlatforms, onToggle: (v) => toggle(explPlatforms, v, setExplPlatforms), onReplace: (vals) => setExplPlatforms(new Set(vals)) },
    { name: "exp-pillar", label: "Content Pillar", options: pillarOptions, selected: explPillars, onToggle: (v) => toggle(explPillars, v, setExplPillars), onReplace: (vals) => setExplPillars(new Set(vals)) },
    { name: "exp-format", label: "Format", options: formatOptions, selected: explFormats, onToggle: (v) => toggle(explFormats, v, setExplFormats), onReplace: (vals) => setExplFormats(new Set(vals)) },
  ];
  const resetExplorerFilters = () => {
    setExplPics(new Set(pics)); setExplMonths(new Set(months)); setExplStatuses(new Set(statusOptions));
    setExplPlatforms(new Set(platformOptions)); setExplPillars(new Set(pillarOptions)); setExplFormats(new Set(formatOptions));
    setDlSel("ALL"); setPage(1); setColMenuOpen(false);
  };
  const inlineSave = () => runSaveFor(explorerRows.slice((currentPage - 1) * EXPLORER_PAGE_SIZE, currentPage * EXPLORER_PAGE_SIZE));
  const detailSave = () => { if (detailRow) { runSaveFor([detailRow]); setEditingDetail(false); } };

  const hasProses = useMemo(() => {
    if (rows.length === 0) return false;
    return Object.prototype.hasOwnProperty.call(rows[0], "PROSES");
  }, [rows]);
  const empty = rows.length === 0 || !hasProses;
  const activeFilterCount =
    (picSel.size !== pics.length ? 1 : 0) + (monthSel.size !== months.length ? 1 : 0) +
    (statusSel.size !== statusOptions.length ? 1 : 0) + (platformSel.size !== platformOptions.length ? 1 : 0) +
    (pillarSel.size !== pillarOptions.length ? 1 : 0) + (formatSel.size !== formatOptions.length ? 1 : 0);

  const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const toneClass = (r: Row): string => {
    if (isDoneByLocal(r)) return "border-success/30 bg-success/5";
    const d = deadlineDate(r);
    if (d) {
      const ts = startOfDayLocal(TODAY);
      if (d < ts) return "border-danger/30 bg-danger/5";
      if (d.getDate() === ts.getDate() && d.getMonth() === ts.getMonth() && d.getFullYear() === ts.getFullYear()) return "border-warning/40 bg-warning/5";
    }
    return "border-border bg-surface";
  };

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
            {/* Page header + action cluster */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media</h1>
                <p className="mt-1 text-[0.92rem] text-muted">Produksi konten, workload per PIC, publishing, dan monitoring operasional.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => { setPlannerOpen(true); }} className="shrink-0">+ Content Plan</Button>
                <Button variant="secondary" onClick={() => onRefresh?.()} className="shrink-0">🔄 Refresh Data</Button>
              </div>
            </header>

            {/* §1 Filter Data (unchanged) */}
            <div className="relative z-20 mb-6 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                {filterCardHeader(`Filter Data${activeFilterCount > 0 ? ` (${activeFilterCount} aktif)` : ""}`)}
                <button type="button" onClick={resetAll} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover">↩ Reset</button>
              </div>
              <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-2 xl:grid-cols-7 md:gap-4">
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

            {/* §5.1 DEADLINE MONITORING — primary band, right under the filter */}
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

            {/* §5.2 Production Overview — compact 5-across */}
            <SectionHeader title="Production Overview" subtitle="Ringkasan produksi: planned, done, in-progress, overdue, dan completion-rate." />
            <div className={compactRow}>
              <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
              <MetricCard icon="✅" label="Total Done" value={String(overview.done)} />
              <MetricCard icon="⏳" label="In Progress" value={String(overview.inProgress)} />
              <MetricCard icon="🚨" label="Overdue" value={String(overview.overdue)} />
              <MetricCard icon="🎯" label="Completion Rate" value={formatPercent(overview.completionRate ?? 0, overview.completionRate !== null)} />
            </div>
            <div className={`mt-3 ${compactRow}`}>
              <MetricCard icon="🎬" label="Video Selesai" value={metrics.videoLabel} />
              <MetricCard icon="🎨" label="Design Selesai" value={metrics.designLabel} />
              <MetricCard icon="📸" label="Hutang Post IG" value={String(metrics.hutangIg)} />
              <MetricCard icon="🎵" label="Hutang Post TikTok" value={String(metrics.hutangTiktok)} />
              <MetricCard icon="▶️" label="Hutang Post YT" value={String(metrics.hutangYt)} />
            </div>

            <Divider />

            {/* §3 Content Planning — Calendar & List + Content Plan Storage */}
            <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.1rem] font-extrabold text-ink">Content Planning</h2>
              </div>
              {/* Content Plan Storage */}
              <div className="mb-4 rounded-[14px] border border-divider bg-surface/60 p-3">
                <p className="mb-2 text-[0.85rem] font-bold text-muted">Content Plan Storage ({planRows.length})</p>
                {planRows.length === 0 ? (
                  <p className="text-[0.85rem] text-muted">Belum ada rencana. Klik <span className="font-semibold text-brand">+ Content Plan</span> untuk membuat.</p>
                ) : (
                  <div className="divide-y divide-divider">
                    {planRows.map((p) => {
                      const pi = typeof p.__rowIndex === "number" ? p.__rowIndex : planRows.indexOf(p);
                      const pushed = planIsPushed(p, pi);
                      return (
                        <div key={pi} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-ink" title={str(p["Judul / Ide Konten"])}>{str(p["Judul / Ide Konten"]) || "—"}</span>
                          <PlanStatusBadge status={str(p["Status Plan"])} />
                          {str(p["Priority"]).trim() ? <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[0.72rem] font-medium text-muted">{str(p["Priority"])}</span> : null}
                          {str(p["Deadline Produksi"]).trim() ? <span className="shrink-0 text-[0.78rem] text-muted">⏰ {str(p["Deadline Produksi"])}</span> : null}
                          {isEditor && str(p["Status Plan"]).trim().toUpperCase() === "APPROVED" && !pushed ? (
                            <Button variant="primary" onClick={() => addToProduction(p, pi)} ariaLabel="Tambahkan ke pipeline produksi sosmed" className="!px-3 !py-1 !text-[0.78rem]">＋ Tambah ke Produksi</Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tab bar */}
              <div className="mb-4 inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface p-1 shadow-[var(--dm-shadow-xs)]">
                <button type="button" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}
                  className={`rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors ${tab === "calendar" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink"}`}>📅 Kalender</button>
                <button type="button" aria-pressed={tab === "list"} onClick={() => setTab("list")}
                  className={`rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors ${tab === "list" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink"}`}>📋 Daftar</button>
              </div>

              {/* Calendar view */}
              {tab === "calendar" ? (
                <div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Button variant="secondary" onClick={() => setCalCursor(firstOfToday())}>Hari Ini</Button>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Bulan sebelumnya" onClick={() => setCalCursor(shiftMonth(calCursor, -1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-ink hover:border-brand/40">‹</button>
                      <span className="min-w-[9rem] text-center text-[1rem] font-extrabold text-ink">{monthTitleText(calCursor)}</span>
                      <button type="button" aria-label="Bulan berikutnya" onClick={() => setCalCursor(shiftMonth(calCursor, 1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-ink hover:border-brand/40">›</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="sticky top-0 z-10 bg-surface/90 backdrop-blur-[4px] pb-1 text-center text-[0.72rem] font-bold uppercase tracking-wide text-muted">{w}</div>
                    ))}
                    {cells.map((c, i) => {
                      const todayNum = TODAY.getDate();
                      const isTodayCell = !c.isOutside && c.day === todayNum && calCursor.getMonth() === TODAY.getMonth() && calCursor.getFullYear() === TODAY.getFullYear();
                      return (
                        <div key={i} className={`min-h-[92px] rounded-[12px] border p-1.5 ${c.isOutside ? "bg-transparent border-border/40 opacity-50" : "border-border bg-surface/70"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[8px] text-[0.8rem] font-bold ${isTodayCell ? "border-[1.5px] border-accent text-accent" : "text-ink"}`}>{c.day}</span>
                          </div>
                          <div className="mt-1 flex flex-col gap-1 overflow-hidden">
                            {c.rows.slice(0, 3).map((r) => {
                              const jx = originalIndex(r);
                              return (
                                <button key={jx} type="button" onClick={() => detailOpen(r)}
                                  className={`group w-full rounded-[8px] border p-1.5 text-left transition-colors group-hover:border-brand/40 ${toneClass(r)}`}>
                                  <span className="block truncate text-[0.72rem] font-semibold text-ink" title={str(r["Judul Konten"])}>{str(r["Judul Konten"]) || "—"}</span>
                                  <span className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted">
                                    <span className="truncate">{str(r["Output"])}</span>
                                    {str(r["Platform"]).trim() ? <span className="text-brand-hover/80">· {str(r["Platform"])}</span> : null}
                                  </span>
                                  <span className="mt-1 flex items-center gap-1.5 text-[0.68rem]">
                                    <span className="truncate text-muted">{str(r["PIC"]) || "—"}</span>
                                    <ProsesBadge status={str(r["PROSES"])} />
                                  </span>
                                </button>
                              );
                            })}
                            {c.rows.length > 3 ? <span className="px-0.5 text-[0.68rem] font-semibold text-brand-hover">+{c.rows.length - 3} lagi</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* List view (Daftar) */
                <div>
                  <p className="mb-2 text-[0.8rem] text-muted">menampilkan {filtered.length} konten</p>
                  <div className="divide-y divide-divider rounded-[16px] border border-border bg-surface">
                    {filtered.length === 0 ? (
                      <EmptyState title="Tidak ada konten." />
                    ) : (
                      [...filtered].sort((a, b) => {
                        const da = deadlineDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                        const db = deadlineDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                        return da - db;
                      }).map((row) => (
                        <button type="button" key={originalIndex(row)} onClick={() => detailOpen(row)}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-brand/[0.03]">
                          <span className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold text-ink" title={str(row["Judul Konten"])}>{str(row["Judul Konten"]) || "—"}</span>
                          <span className="hidden text-[0.8rem] text-muted sm:inline">{str(row["Output"])}</span>
                          {str(row["Platform"]).trim() ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.72rem] font-semibold text-brand-hover">📲 {str(row["Platform"])}</span> : null}
                          <span className="shrink-0 text-[0.8rem] text-muted">{str(row["PIC"]) || "—"}</span>
                          <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[0.72rem] font-medium text-muted">⏰ {str(row["Tanggal Deadline"]) || "—"}</span>
                          <ProsesBadge status={str(row["PROSES"])} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Divider />

            {/* §4 Production Funnel | Status Breakdown — 50/50 */}
            <SectionHeader title="Production Funnel & Status Breakdown" subtitle="Funnel produksi (Planned → Production → Review → Revision → Done → Published) dan berapa konten di setiap fase." />
            <div className={splitRow}>
              {/* LEFT — funnel */}
              <ChartContainer data={funnel} label="Funnel produksi (berdasarkan PROSES)">
                <FunnelBars stages={funnel} />
              </ChartContainer>
              {/* RIGHT — status breakdown (compact chips, two-across inside the half column) */}
              <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
                <p className="mb-3 text-[0.85rem] font-semibold text-muted">Berapa konten di setiap fase</p>
                <div className="grid gap-2 sm:grid-cols-2">
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

            {/* §6 Action Required (standalone quad grid) */}
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

            {/* §5 Workload per PIC | PIC Detail Table — 50/50 */}
            <SectionHeader title="Workload per PIC" subtitle="Monitoring dan kapasitas per PIC — bukan ranking." />
            <div className={splitRow}>
              <ChartContainer data={picLoad} label="Done (hijau) vs Pending (kuning) dengan overdue">
                <WorkloadBars items={picLoad.map((p) => ({ pic: p.pic, selesai: p.done, hutang: p.pending }))} />
              </ChartContainer>
              {picLoad.length > 0 ? <PicCapacityRows items={picLoad} /> : <EmptyState title="Belum ada data workload." />}
            </div>

            <Divider />

            {/* §6 Publishing Tracker — compact 5-across */}
            <SectionHeader title="Publishing Tracker" subtitle="IG / TikTok / YT dipublikasi, cross-platform, dan selesai-belum dipublikasi." />
            <div className={compactRow}>
              <MetricCard icon="📸" label="Instagram Published" value={String(publishing.ig)} />
              <MetricCard icon="🎵" label="TikTok Published" value={String(publishing.tiktok)} />
              <MetricCard icon="▶️" label="YouTube Published" value={String(publishing.yt)} />
              <MetricCard icon="🔀" label="Cross-platform" value={String(publishing.crossPlatform)} />
              <MetricCard icon="📤" label="Finished, Unpublished" value={String(publishing.finishedNotPublished)} />
            </div>

            <Divider />

            {/* §10 Content Strategy */}
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

            {/* §7 Output Trend — interactive dependency-free SVG */}
            <SectionHeader title="Output Trend" subtitle="Produksi per minggu (planned vs done) berdasarkan minggu deadline." />
            {trend.length ? (
              <InteractiveOutputTrend points={trend} />
            ) : (
              <div className="relative rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
                <EmptyState title="Belum ada data deadline untuk tren." />
              </div>
            )}

            <Divider />

            {/* §12 Master Content Data EXPLORER (inline) */}
            <SectionHeader title="Master Content Data Explorer" subtitle="Jelajahi, cari, dan kelola seluruh konten. Edit sel dan klik 'Simpan Perubahan' untuk menyimpan." />
            <ContentExplorer
              rows={explorerRows} isEditor={isEditor} embedded originalIndex={originalIndex} onOpenDetail={detailOpen}
              query={query} setQuery={handleQuery} page={currentPage} setPage={setPage} totalPages={totalPages}
              visibleCols={visibleCols} setVisibleCols={setVisibleCols} colMenuOpen={colMenuOpen} setColMenuOpen={setColMenuOpen}
              openMenu={openMenu} setOpenMenu={setOpenMenu} filterDims={explorerFilterDims}
              dlSel={dlSel} setDlSel={setDlSel} onResetFilters={resetExplorerFilters}
              saving={saving} setCell={setCell} cellValue={cellValue} pics={pics} statusOptions={PROSES_OPTIONS as unknown as string[]}
              runSave={inlineSave} saveMsg={saveMsg} onExpand={() => setFullscreen(true)}
            />
          </>
        )}
      </main>

      {/* Content Planner modal */}
      <ContentPlannerModal open={plannerOpen} options={planOptions} form={planForm} setForm={setPlanField}
        planFormValid={planFormValid} saving={savingPlan} planError={planError} onSave={saveContentPlan} onClose={() => setPlannerOpen(false)} />

      {/* Row-detail drawer */}
      {detailRow ? (
        <RowDetailDrawer row={detailRow} rowIndex={originalIndex(detailRow)} onClose={() => setDetailRow(null)}
          isEditor={isEditor} editing={editingDetail} setEditing={setEditingDetail} pics={pics}
          draft={draft} setCell={setCell} saving={saving} runSave={detailSave} saveMsg={saveMsg} />
      ) : null}

      {/* Fullscreen explorer overlay */}
      {fullscreen ? (
        <div role="dialog" aria-modal="true" aria-label="Explorer konten — layar penuh"
          className="fixed inset-0 z-50 flex flex-col bg-surface-strong/95 backdrop-blur-md">
          <header className="flex items-center justify-between gap-3 border-b border-divider bg-white/80 px-5 py-3">
            <h2 className="text-[1.1rem] font-extrabold text-ink">Master Content Data Explorer</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetExplorerFilters} className={btnReset}>Reset Filter</button>
              <Button variant="secondary" onClick={() => setFullscreen(false)}>✕ Tutup</Button>
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1500px] flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <ContentExplorer
              rows={explorerRows} isEditor={isEditor} embedded={false} originalIndex={originalIndex} onOpenDetail={detailOpen}
              query={query} setQuery={handleQuery} page={currentPage} setPage={setPage} totalPages={totalPages}
              visibleCols={visibleCols} setVisibleCols={setVisibleCols} colMenuOpen={colMenuOpen} setColMenuOpen={setColMenuOpen}
              openMenu={openMenu} setOpenMenu={setOpenMenu} filterDims={explorerFilterDims}
              dlSel={dlSel} setDlSel={setDlSel} onResetFilters={resetExplorerFilters}
              saving={saving} setCell={setCell} cellValue={cellValue} pics={pics} statusOptions={PROSES_OPTIONS as unknown as string[]}
              runSave={inlineSave} saveMsg={saveMsg} onExpand={() => {}}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Local helpers (keep component body clean). */
function isDoneByLocal(r: Row): boolean { return str(r["PROSES"]).toUpperCase() === "DONE"; }
function startOfDayLocal(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }