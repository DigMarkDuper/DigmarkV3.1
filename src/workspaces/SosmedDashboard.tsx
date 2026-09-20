/**
 * SosmedDashboard — presentational body + INLINE EDITOR of the Sosmed workspace
 * (port of pages/2_Sosmed.py), evolved into a Content Operations Dashboard.
 *
 * Given normalized rows from GET /api/tables/sosmed, renders:
 *   - expanded multi-dimension filter (PIC, deadline month, status, platform,
 *     content pillar, format) driving every KPI/chart/section
 *   - Production Overview (planned/done/in-progress/overdue/completion %)
 *   - Production Funnel + Status Breakdown (fall back to the existing PROSES
 *     field — Review/Revision have no source column and stay 0, never invented)
 *   - Workload per PIC (capacity monitoring, not a ranking)
 *   - Deadline Monitoring (overdue / due today / due this week / completed)
 *   - Publishing Tracker (IG / TikTok / YT / cross-platform / finished-unpublished)
 *   - Content Strategy breakdown (grouped by ACTUAL Konten Pillar/Output/Platform)
 *   - Output Trend (weekly planned vs done by deadline week)
 *   - Action Required (overdue / awaiting review / in revision / unpublished)
 *   - the existing V3 Master Production Pipeline inline editor (PATCH diff)
 *
 * All derivations live in @/workspaces/sosmed (pure, unit-tested); this component
 * only maps them to the design-system components (MetricCard/SectionHeader/
 * ChartContainer/Divider/EmptyState). Charts are hand-rolled dependency-free SVG.
 *
 * The editor contract is unchanged and server-enforced:
 *   - every editable cell maps to a DECLARED schema column name
 *   - boolean flags IG/YT/TIKTOK are PATCHed as REAL booleans (true|false)
 *   - PATCH body = { rowIndex (0-based into original rows), column, value: scalar }
 *   - on save the editor DIFFs each cell against the ORIGINAL value, PATCHes only changed
 * Viewer sees the table read-only with NO save control; the server also 403s a viewer PATCH.
 *
 * Writes go ONLY through PATCH /api/tables/sosmed — never Sheets in the browser.
 */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { patchJson } from "@/lib/api-client";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { Select, TextInput, Checkbox } from "@/components/ui/Field";
import { PALETTE, formatPercent } from "@/components/ui-common";
import {
  SOSMED_BOOL_COLS,
  SOSMED_TEXT_COLS,
  PROSES_OPTIONS,
  actionRequired,
  contentStrategy,
  deadlineMonitor,
  diffPatches,
  distinctValues,
  filterRows,
  outputTrend,
  pickDateCol,
  picOptions,
  picWorkload,
  productionFunnel,
  productionOverview,
  publishingTracker,
  sosmedMetrics,
  sosmedMonths,
  statusBreakdown,
  truthy,
  type ProdStage,
  type SosmedPatch,
} from "@/workspaces/sosmed";

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

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

export interface SosmedDashboardProps {
  rows: Row[];
  /** True when the signed-in user may edit (GET /api/auth/me role === editor). */
  isEditor: boolean;
  onRefresh?: () => void;
}

/**
 * Compact searchable multi-select dropdown — replaces the always-open checkbox column
 * (V3 st.multiselect parity preserved: selection round-trips through `selected` +
 * `onToggle`/`onReplace`; the panel NEVER holds a selection copy). Single-open across
 * the bar is enforced through the shared `openMenu` state.
 */
function MultiSelectDropdown({
  name,
  label,
  options,
  selected,
  onToggle,
  onReplace,
  hint,
  placeholder = "Cari…",
  className = "",
  openMenu,
  setOpenMenu,
}: {
  name: string;
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onReplace: (values: Iterable<string>) => void;
  hint?: string;
  placeholder?: string;
  className?: string;
  openMenu: string | null;
  setOpenMenu: (n: string | null) => void;
}) {
  const open = openMenu === name;
  const [query, setQuery] = useState("");
  // Right-edge aware anchoring: when a left-anchored 256px (w-64) panel would cross
  // the filter CARD's right edge (its grid parent), anchor it right so the trailing
  // columns never hang off the card / cause horizontal overflow on smaller screens.
  const [alignRight, setAlignRight] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus lands in the search input on open (DOM focus — external sync, not state).
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  // Clicking outside closes the panel.
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

  // A selected value absent from `options` still renders checked (never silently dropped).
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
          if (open) {
            setOpenMenu(null);
            return;
          }
          if (wrapRef.current) {
            const r = wrapRef.current.getBoundingClientRect();
            // Anchor the 256px (w-64) panel to the CARD edge, not the viewport:
            // the wrapper's parent is the filter grid, whose right edge equals the
            // card's inner content edge — flip right when a left-anchored panel
            // would cross it, so trailing columns never hang off the card.
            const grid = wrapRef.current.parentElement;
            const edge = grid ? grid.getBoundingClientRect().right : window.innerWidth - 8;
            setAlignRight(r.left + 256 > edge);
          }
          setOpenMenu(name);
        }}
        className={
          "inline-flex w-full items-center gap-2 rounded-[12px] border bg-surface-input px-3 py-2 text-[0.82rem] font-semibold transition-colors " +
          (sum.active
            ? "border-brand/40 text-brand"
            : "border-border text-ink hover:border-brand/30 hover:text-brand-hover")
        }
      >
        <span className="flex min-w-0 items-center gap-1 truncate">
          <span className="truncate">{label}</span>
          {hint ? <span className="hidden text-[0.75rem] text-muted/70 xl:inline">({hint})</span> : null}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface-strong px-2.5 py-0.5 text-[0.75rem] font-medium text-muted">
          {sum.chip}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 8"
          className={`h-2 w-2.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m1.5 1.5 4.5 4.5 4.5-4.5" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={`Pilih ${label}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpenMenu(null);
              triggerRef.current?.focus();
            }
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
            <input
              type="checkbox"
              checked={sum.allChecked}
              onChange={toggleAll}
              className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand"
            />
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
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(o)}
                      className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand"
                    />
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



/** Dependency-free stacked horizontal bar (V3 px.bar barmode="stack").
 * Height follows the PIC count dynamically (no fixed height -> no overlap or
 * clipping when many PICs). Each row is 46px; + track padding + label line. */
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
              <text x="0" y={y + 20} textAnchor="start" fontSize="13" fontWeight="600" fill={PALETTE.muted}>
                {it.pic}
              </text>
              <rect x="100" y={y} width={rowW} height="24" rx="6" fill={PALETTE.grid} />
              {selesaiW > 0 ? <rect x="100" y={y} width={selesaiW} height="24" rx="6" fill={PALETTE.success} /> : null}
              {totalW > selesaiW ? (
                <rect x={100 + selesaiW} y={y} width={totalW - selesaiW} height="24" rx="6" fill={PALETTE.warning} />
              ) : null}
              <text x="396" y={y + 20} textAnchor="end" fontSize="12" fontWeight="700" fill={PALETTE.ink}>
                {it.selesai}/{it.selesai + it.hutang}
              </text>
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
            <th className="px-3 py-2 text-right">Completie %</th>
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
    notStarted: PALETTE.grid,
    inProduction: PALETTE.catBlue,
    review: PALETTE.catTeal,
    revision: PALETTE.catOrange,
    done: PALETTE.success,
    published: PALETTE.brand,
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
              <text x="0" y={y + 20} textAnchor="start" fontSize="12.5" fontWeight="600" fill={PALETTE.muted}>
                {s.label}
              </text>
              <rect x="120" y={y} width={rowW - 140} height="22" rx="6" fill={PALETTE.grid} opacity="0.35" />
              {s.count > 0 ? <rect x="120" y={y} width={w} height="22" rx="6" fill={fillFor[s.key]} /> : null}
              <text x="396" y={y + 20} textAnchor="end" fontSize="12.5" fontWeight="700" fill={PALETTE.ink}>
                {String(s.count)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Dependency-free weekly trend: grouped bars (Planned vs Done) per week. */
function TrendBars({ points }: { points: { label: string; planned: number; done: number }[] }) {
  const max = Math.max(...points.map((p) => p.planned), 1);
  const slot = 24;
  const barW = 7;
  const gap = 2;
  const chartW = Math.max(points.length * slot, 100);
  const chartH = 140;
  const h = 96;
  return (
    <div style={{ height: `${chartH + 34}px` }}>
      <svg viewBox={`0 0 ${chartW} ${chartH + 34}`} role="img" aria-label="Output Trend per Week" className="h-full w-full">
        {points.map((p, i) => {
          const x = i * slot + 6;
          const ph = (p.planned / max) * h;
          const dh = (p.done / max) * h;
          return (
            <g key={i}>
              <rect x={x} y={chartH - ph} width={barW} height={ph} rx="2" fill={PALETTE.grid} />
              {p.done > 0 ? <rect x={x + barW + gap} y={chartH - dh} width={barW} height={dh} rx="2" fill={PALETTE.success} /> : null}
              <text x={x + 3} y="130" textAnchor="middle" fontSize="10" fill={PALETTE.muted}>{p.label}</text>
            </g>
          );
        })}
      </svg>
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

/** Filter card treatment — matches /website MonthFilter card (rounded-16, glass surface, xs shadow). */
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

export function SosmedDashboard({ rows, isEditor, onRefresh }: SosmedDashboardProps) {
  const months = useMemo(() => sosmedMonths(rows), [rows]);
  const pics = useMemo(() => picOptions(rows), [rows]);
  const dateCol = useMemo(() => pickDateCol(rows), [rows]);
  const statusOptions = useMemo(() => ["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"], []);
  const platformOptions = useMemo(() => distinctValues(rows, "Platform"), [rows]);
  const pillarOptions = useMemo(() => distinctValues(rows, "Konten Pillar"), [rows]);
  const formatOptions = useMemo(() => distinctValues(rows, "Output"), [rows]);

  // Filters — default = ALL selected (V3 `default=pic_options` / `default=months`).
  const [picSel, setPicSel] = useState<Set<string>>(() => new Set(pics));
  const [monthSel, setMonthSel] = useState<Set<string>>(() => new Set(months));
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set(statusOptions));
  const [platformSel, setPlatformSel] = useState<Set<string>>(() => new Set(platformOptions));
  const [pillarSel, setPillarSel] = useState<Set<string>>(() => new Set(pillarOptions));
  const [formatSel, setFormatSel] = useState<Set<string>>(() => new Set(formatOptions));
  // Single-open state: one dropdown open at a time across the whole bar.
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Reset — restores ALL six dimensions to fully-selected (default) state.
  const resetAll = () => {
    setPicSel(new Set(pics));
    setMonthSel(new Set(months));
    setStatusSel(new Set(statusOptions));
    setPlatformSel(new Set(platformOptions));
    setPillarSel(new Set(pillarOptions));
    setFormatSel(new Set(formatOptions));
    setOpenMenu(null);
  };

  // Dropdown dimensions — keep option lists + state sets as-is; only how they render changes.
  const filterDims: {
    name: string;
    label: string;
    hint?: string;
    className?: string;
    options: string[];
    selected: Set<string>;
    set: (s: Set<string>) => void;
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
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  const filtered = useMemo(
    () =>
      filterRows(rows, {
        pics: picSel,
        months: monthSel,
        statuses: statusSel,
        platforms: platformSel,
        pillars: pillarSel,
        formats: formatSel,
      }),
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

  // Note: `rows.indexOf` maps a filtered row back to its ORIGINAL index — the V3
  // DataFrame preserved the original index through filtering, so PATCH rowIndex
  // is the 0-based position in the UNFILTERED rows (sheet data row), not the
  // filtered position.
  const originalIndex = (r: Row) => rows.indexOf(r);

  // Editor mounting: an empty data grid would PATCH-nothing, so editor only
  // renders when there is at least one row.
  const editableRows = filtered;
  const readOnlyCols: string[] = ["Kode Konten", ...(dateCol ? [dateCol] : []), "Judul Konten"];

  // --- editor diff-and-save state (working draft keyed by original rowIndex) ---
  type Draft = Record<number, Record<string, string | boolean>>;
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const isEditing = isEditor;
  const editorCols: string[] = readOnlyCols.concat(SOSMED_TEXT_COLS, [...SOSMED_BOOL_COLS]);

  const setCell = (rowIndex: number, col: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [rowIndex]: { ...(d[rowIndex] ?? {}), [col]: value } }));
    setSaveMsg(null);
  };

  const cellValue = (row: Row, col: string): unknown => {
    const idx = originalIndex(row);
    if (draft[idx] && draft[idx][col] !== undefined) return draft[idx][col];
    return row[col];
  };

  const runSave = async () => {
    setSaveMsg(null);
    // Build the full draft grid for the displayed rows from the working draft,
    // falling back to the original row value for cells never touched.
    const fullDraft: Draft = {};
    for (const row of editableRows) {
      const idx = originalIndex(row);
      const edited = draft[idx] ?? {};
      fullDraft[idx] = {
        ...Object.fromEntries(SOSMED_BOOL_COLS.map((c) => [c, truthy(row[c])])),
        ...Object.fromEntries(SOSMED_TEXT_COLS.map((c) => [c, str(row[c])])),
        ...edited,
      };
    }
    const patches = diffPatches(rows, fullDraft);
    if (patches.length === 0) {
      setSaveMsg({ kind: "info", text: "Tidak ada perubahan." });
      return;
    }
    setSaving(true);
    let ok = 0;
    let err = 0;
    for (const p of patches) {
      try {
        await patchJson<SosmedPatch>("/api/tables/sosmed", p);
        ok++;
      } catch {
        err++;
      }
    }
    if (ok > 0) onRefresh?.(); // V3 st.rerun-style post-save refresh
    setSaving(false);
    if (ok > 0 && err === 0) setSaveMsg({ kind: "ok", text: `✅ ${ok} perubahan tersimpan.` });
    else if (err > 0) setSaveMsg({ kind: "err", text: `⚠️ ${err} perubahan gagal.` });
    else setSaveMsg({ kind: "ok", text: `✅ ${ok} perubahan tersimpan.` });
  };

  // V3 empty guard: `df.empty or "PROSES" not in df.columns` -> hero + EmptyState + stop.
  const hasProses = useMemo(() => {
    if (rows.length === 0) return false;
    // PROSES key present anywhere (normalized rows carry declared column keys).
    return Object.prototype.hasOwnProperty.call(rows[0], "PROSES");
  }, [rows]);
  const empty = rows.length === 0 || !hasProses;

  const activeFilterCount =
    (picSel.size !== pics.length ? 1 : 0) +
    (monthSel.size !== months.length ? 1 : 0) +
    (statusSel.size !== statusOptions.length ? 1 : 0) +
    (platformSel.size !== platformOptions.length ? 1 : 0) +
    (pillarSel.size !== pillarOptions.length ? 1 : 0) +
    (formatSel.size !== formatOptions.length ? 1 : 0);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {empty ? (
          <>
            {/* Empty state — /website empty pattern (ModuleHero + EmptyState), stop. */}
            <ModuleHero
              icon="📱"
              title="Social Media"
              desc="Content Operations Dashboard: produksi konten, workload per PIC, publishing, en monitoring operasioneel."
            />
            <EmptyState title="Data sosmed tidak tersedia atau kosong." />
          </>
        ) : (
          <>
            {/* Page header — /website header pattern (eyebrow + title + subtitle + header-right action). */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
                  Social Media
                </h1>
                <p className="mt-1 text-[0.92rem] text-muted">
                  Content production, workload, publishing, en monitoring operasioneel.
                </p>
              </div>
              <Button variant="secondary" onClick={onRefresh} className="shrink-0">
                🔄 Refresh Data
              </Button>
            </header>

            {/* Filters — expanded multi-dimension, compact glass card.
                `relative z-20` elevates this card's stacking context so the absolute
                dropdown panels paint ABOVE the sibling cards/tables below (every
                element with backdrop-blur creates its own auto-z stacking context,
                and later DOM siblings would otherwise paint over an open panel). */}
            <div className="relative z-20 mb-6 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                {filterCardHeader(`Filter Data${activeFilterCount > 0 ? ` (${activeFilterCount} aktif)` : ""}`)}
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover"
                >
                  ↩ Reset
                </button>
              </div>
              <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-2 xl:grid-cols-7 md:gap-4">
                {filterDims.map((d) => (
                  <MultiSelectDropdown
                    key={d.name}
                    name={d.name}
                    label={d.label}
                    hint={d.hint}
                    className={d.className ?? "md:col-span-1"}
                    options={d.options}
                    selected={d.selected}
                    onToggle={(v) => toggle(d.selected, v, d.set)}
                    onReplace={(vals) => d.set(new Set(vals))}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                  />
                ))}
              </div>

              {/* Active Filter Summary — one removable chip per ACTIVE VALUE (not per dimension). */}
              {activeFilterCount > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                  <span className="text-[0.82rem] font-semibold text-muted">Filter Aktif:</span>
                  {filterDims.map((d) =>
                    d.options.length > 0 && d.selected.size !== d.options.length
                      ? d.options
                          .filter((o) => !d.selected.has(o))
                          .map((o) => (
                            <button
                              key={`${d.name}:${o}`}
                              type="button"
                              onClick={() => toggle(d.selected, o, d.set)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-surface-strong px-2.5 py-1 text-[0.8rem] font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand-hover"
                            >
                              {o}
                              <span aria-hidden className="text-[0.95rem] leading-none text-muted">×</span>
                            </button>
                          ))
                      : null,
                  )}
                  <button
                    type="button"
                    onClick={resetAll}
                    className="text-[0.82rem] font-semibold text-brand hover:text-brand-hover hover:underline"
                  >
                    Hapus Semua
                  </button>
                </div>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="Tidak ada data sesuai filter." />
            ) : (
              <>
                {/* Production Overview — improved KPI set. */}
                <SectionHeader title="Production Overview" subtitle="Ringkasan produksi: planned, done, in-progress, overdue en completion-rate." />
                <MetricRow>
                  <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
                  <MetricCard icon="✅" label="Total Done" value={String(overview.done)} />
                  <MetricCard icon="⏳" label="In Progress" value={String(overview.inProgress)} />
                  <MetricCard icon="🚨" label="Overdue" value={String(overview.overdue)} />
                  <MetricCard icon="🎯" label="Completion Rate" value={formatPercent(overview.completionRate ?? 0, overview.completionRate !== null)} />
                </MetricRow>

                {/* Legacy KPI cards (kept — existing features). */}
                <div className="mt-4">
                  <MetricRow>
                    <MetricCard icon="🎬" label="Video Selesai" value={metrics.videoLabel} />
                    <MetricCard icon="🎨" label="Design Selesai" value={metrics.designLabel} />
                    <MetricCard icon="📸" label="Hutang Post IG" value={String(metrics.hutangIg)} />
                    <MetricCard icon="🎵" label="Hutang Post TikTok" value={String(metrics.hutangTiktok)} />
                    <MetricCard icon="▶️" label="Hutang Post YT" value={String(metrics.hutangYt)} />
                  </MetricRow>
                </div>

                <Divider />

                {/* Production Funnel */}
                <SectionHeader title="Production Funnel" subtitle="Flow produksi: Planned → Production → Review → Revision → Done → Published (review/revision: geen aparte kolom, fallback op PROSES)." />
                <ChartContainer data={funnel} label="Funnel productie (PROSES-gestuurd)">
                  <FunnelBars stages={funnel} />
                </ChartContainer>

                <Divider />

                {/* Status Breakdown */}
                <SectionHeader title="Status Breakdown" subtitle="Hoeveel konten staan er in elke fase." />
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {breakdown.map((s) => {
                    const tone =
                      s.key === "published" ? "border-brand/30 bg-brand/10 text-brand-hover"
                        : s.key === "done" ? "border-success/30 bg-success/10 text-success"
                          : s.key === "revision" ? "border-danger/30 bg-danger/10 text-danger"
                            : s.key === "inProduction" ? "border-warning/30 bg-warning/10 text-warning"
                              : "border-border bg-surface/60 text-muted";
                    return (
                      <div key={s.key} className={`flex items-center justify-between rounded-[14px] border ${tone} p-3`}>
                        <span className="text-[0.88rem] font-semibold text-ink">{s.label}</span>
                        <span className="text-[1.1rem] font-extrabold text-ink">{s.count}</span>
                      </div>
                    );
                  })}
                </div>

                <Divider />

                {/* Workload per PIC — capacity monitoring. */}
                <SectionHeader title="Workload per PIC" subtitle="Monitoring en capaciteit per PIC — geen ranking." />
                <ChartContainer data={picLoad} label="Done (groen) vs Pending (geel), met overdue">
                  <WorkloadBars
                    items={picLoad.map((p) => ({ pic: p.pic, selesai: p.done, hutang: p.pending }))}
                  />
                </ChartContainer>
                {picLoad.length > 0 ? <PicCapacityRows items={picLoad} /> : <EmptyState title="Nog geen workload-data." />}

                <Divider />

                {/* Deadline Monitoring */}
                <SectionHeader title="Deadline Monitoring" subtitle="Overdue, due today, due deze week, en completed." />
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
                      {deadlines.overdue.map((r) => <ActionItemRow key={originalIndex(r)} item={{
                        title: str(r["Judul Konten"]),
                        pic: str(r["PIC"]),
                        deadline: str(r["Tanggal Deadline"]),
                        platform: "",
                        status: str(r["PROSES"]),
                      }} />)}
                    </div>
                  </div>
                ) : null}

                <Divider />

                {/* Publishing Tracker */}
                <SectionHeader title="Publishing Tracker" subtitle="IG / TikTok / YT gepubliceerd, cross-platform, en klaar-maar-nog-niet-gepubliceerd." />
                <MetricRow>
                  <MetricCard icon="📸" label="Instagram Published" value={String(publishing.ig)} />
                  <MetricCard icon="🎵" label="TikTok Published" value={String(publishing.tiktok)} />
                  <MetricCard icon="▶️" label="YouTube Published" value={String(publishing.yt)} />
                  <MetricCard icon="🔀" label="Cross-platform" value={String(publishing.crossPlatform)} />
                  <MetricCard icon="📤" label="Finished, Unpublished" value={String(publishing.finishedNotPublished)} />
                </MetricRow>

                <Divider />

                {/* Content Strategy Breakdown (actual values, never hardcoded) */}
                <SectionHeader title="Content Strategy" subtitle="Verdeling per Content Pillar, Format en Platform (op basis van actuele waarden)." />
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

                {/* Output Trend */}
                <SectionHeader title="Output Trend" subtitle="Produksi per week (planned vs done) op basis van de deadline-week." />
                <ChartContainer data={trend} label="Planned (grijs) vs Done (groen) per week">
                  {trend.length ? <TrendBars points={trend} /> : <EmptyState title="Tidak ada data deadline voor een trend." />}
                </ChartContainer>

                <Divider />

                {/* Action Required */}
                <SectionHeader title="Action Required" subtitle="Operationele to-do's: overdue, wachten op review, in revision, en klaar-maar-nog-niet-gepubliceerd." />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[16px] border border-danger/30 bg-surface/70">
                    <p className="px-3 py-2 text-[0.88rem] font-bold text-danger">🚨 Overdue ({actions.overdue.length})</p>
                    {actions.overdue.length ? actions.overdue.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
                  </div>
                  <div className="rounded-[16px] border border-warning/30 bg-surface/70">
                    <p className="px-3 py-2 text-[0.88rem] font-bold text-warning">👀 Waiting for Review ({actions.reviewNeeded.length})</p>
                    {actions.reviewNeeded.length ? actions.reviewNeeded.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
                  </div>
                  <div className="rounded-[16px] border border-brand/20 bg-surface/70">
                    <p className="px-3 py-2 text-[0.88rem] font-bold text-brand-hover">🔁 In Revision ({actions.inRevision.length})</p>
                    {actions.inRevision.length ? actions.inRevision.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada (status niet aanwezig in data).</p>}
                  </div>
                  <div className="rounded-[16px] border border-brand/20 bg-surface/70">
                    <p className="px-3 py-2 text-[0.88rem] font-bold text-brand-hover">📤 Finished, not published ({actions.finishedNotPublished.length})</p>
                    {actions.finishedNotPublished.length ? actions.finishedNotPublished.map((a) => <ActionItemRow key={`${a.title}-${a.pic}-${a.deadline}`} item={a} />) : <p className="px-3 py-2 text-[0.85rem] text-muted">Tidak ada.</p>}
                  </div>
                </div>

                <Divider />

                {/* Master Production Pipeline — INLINE EDITOR (the write) */}
                <SectionHeader title="Master Production Pipeline" subtitle="Edit cellen en klik 'Simpan Perubahan' om te bewaren." />
                <div className="overflow-x-auto rounded-[16px] border border-border bg-surface p-2 backdrop-blur-[8px] shadow-[var(--dm-shadow)]">
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 border-b border-divider bg-white/90 backdrop-blur-[8px]">
                      <tr>
                        {editorCols.map((c) => (
                          <th key={c} className="px-3 py-2 text-left text-[0.8rem] font-semibold uppercase tracking-[0.02em] text-muted">
                            {str(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editableRows.map((row, i) => {
                        const idx = originalIndex(row);
                        return (
                          <tr key={idx} className={`${i % 2 === 0 ? "bg-white/70" : "bg-white/85"} transition-colors hover:bg-brand/[0.03]`}>
                            {editorCols.map((c) => {
                              const isReadOnly = readOnlyCols.includes(c);
                              const isBool = (SOSMED_BOOL_COLS as readonly string[]).includes(c);
                              const cell = cellValue(row, c);
                              // Viewers (and read-only cols) see plain text — V3 disabled cells.
                              if (!isEditing || isReadOnly) {
                                if (c === "PROSES") {
                                  return (
                                    <td key={c} className="border-b border-divider px-3 py-2">
                                      <ProsesBadge status={str(cell)} />
                                    </td>
                                  );
                                }
                                if (c === "IG" || c === "YT" || c === "TIKTOK") {
                                  const on = typeof cell === "boolean" ? cell : truthy(cell);
                                  return (
                                    <td key={c} className="border-b border-divider px-3 py-2 text-center">
                                      {on ? <span className="text-[0.95rem]" title="Gepost">✅</span> : <span className="text-muted text-[0.95rem]" title="Belum gepost">◦</span>}
                                    </td>
                                  );
                                }
                                return (
                                  <td key={c} className={`border-b border-divider px-3 py-2 text-sm ${c === "Judul Konten" ? "font-semibold text-ink" : "text-ink"}`}>
                                    {str(cell)}
                                  </td>
                                );
                              }
                              if (c === "PIC") {
                                return (
                                  <td key={c} className="border-b border-divider px-3 py-1.5">
                                    <Select
                                      value={str(cell)}
                                      options={pics.map((o) => ({ value: o, label: o }))}
                                      onSelect={(v) => setCell(idx, c, v)}
                                    />
                                  </td>
                                );
                              }
                              if (c === "PROSES") {
                                return (
                                  <td key={c} className="border-b border-divider px-3 py-1.5">
                                    <Select
                                      value={str(cell)}
                                      options={PROSES_OPTIONS.map((o) => ({ value: o, label: o }))}
                                      onSelect={(v) => setCell(idx, c, v)}
                                    />
                                  </td>
                                );
                              }
                              if (isBool) {
                                return (
                                  <td key={c} className="border-b border-divider px-3 py-1.5">
                                    <Checkbox
                                      checked={typeof cell === "boolean" ? cell : truthy(cell)}
                                      onToggle={(v) => setCell(idx, c, v)}
                                    />
                                  </td>
                                );
                              }
                              // Output (text)
                              return (
                                <td key={c} className="border-b border-divider px-3 py-1.5">
                                  <TextInput
                                    value={str(cell)}
                                    onInput={(v) => setCell(idx, c, v)}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Editor-only save control (V3 button). */}
                {isEditing ? (
                  <div className="mt-4 flex items-center gap-4">
                    <Button variant="primary" onClick={runSave} disabled={saving || editableRows.length === 0}>
                      {saving ? "Menyimpan..." : "💾 Simpan Perubahan"}
                    </Button>
                    {saveMsg ? (
                      <p
                        role="status"
                        className={
                          "text-[0.9rem] font-semibold " +
                          (saveMsg.kind === "ok" ? "text-success" : saveMsg.kind === "err" ? "text-danger" : "text-muted")
                        }
                      >
                        {saveMsg.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}