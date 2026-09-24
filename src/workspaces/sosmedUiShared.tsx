"use client";
/**
 * SosmedUiShared — sosmed-owned shared PRESENTATIONAL module.
 *
 * The ~19 presentational helpers previously local to the monolithic
 * SosmedDashboard.tsx now live here, imported by BOTH sub-dashboards
 * (SosmedPlanningDashboard, SosmedReportingDashboard) and the shared
 * SosmedGates/SosmedLanding where used (docs/sosmed_split_ui_spec.md §5).
 *
 * This module is stateless-and-presentational (except browser-only UI state
 * like popover/query state owned by its own components, unchanged from the
 * monolithic page). Shared app components are imported unchanged — never
 * edited. All pure derivations still come from @/workspaces/sosmed.
 *
 * Calendar-only helpers remain local to SosmedPlanningDashboard (they are
 * tightly coupled to that dashboard's calendar state).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Row } from "@/server/adapter/source";
import { Button } from "@/components/ui/Button";
import { Select, Checkbox } from "@/components/ui/Field";
import { PALETTE, formatPercent } from "@/components/ui-common";
import {
  COLUMN_DEFS,
  EXPLORER_DEFAULT_COLS,
  PROSES_OPTIONS,
  paginationWindow,
  truthy,
  type ProdStage,
} from "@/workspaces/sosmed";

/** Coerce a cell value to a display string (emo-dash on empty handled by callers). */
export function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** §8.2 — compact 5-across grid (xl → 5 cards) for MetricCard chips. */
export const compactRow = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3";

/** §8.1 — 50/50 responsive 2-col grid (minmax(0,1fr) prevents horizontal overflow). */
export const splitRow = "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";

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

/** PROSES status badge — gives DONE a real status treatment instead of plain text. */
export function ProsesBadge({ status }: { status: string }) {
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

/** Plan Status Plan badge (§6.0): APPROVED/PLANNED/IDEA/DIPRODUKSI tones. */
export function PlanStatusBadge({ status }: { status: string }) {
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
export function ProcessBar({ status }: { status: string }) {
  const s = (status ?? "").trim().toUpperCase();
  const pct = s === "DONE" ? 100 : s === "ON PROGRESS" ? 60 : 10;
  return (
    <span className="w-20 h-1.5 rounded-full bg-surface-strong overflow-hidden" role="img" aria-label={`Proses ${pct}%`}>
      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * Compact searchable multi-select dropdown — parity with the previous filter
 * card. Selection round-trips through `selected`/`onToggle`/`onReplace`; the
 * panel never holds a copy. Single-open enforced via the shared `openMenu`.
 */
export function MultiSelectDropdown({
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
export function WorkloadBars({ items }: { items: { pic: string; selesai: number; hutang: number }[] }) {
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
export function PicCapacityRows({ items }: { items: { pic: string; total: number; done: number; pending: number; overdue: number; completionPct: number | null }[] }) {
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
export function FunnelBars({ stages }: { stages: { key: ProdStage; label: string; count: number }[] }) {
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
 * §10 — Interactive Output Trend (dependency-free hand-rolled SVG).
 * Series: Planned (line+area, PALETTE.muted/grid) and Done (line+area,
 * PALETTE.success). Interactions: hover tooltip (Indonesian), wheel AND +/−
 * zoom (scale 1..8 around the hovered/focused week), drag pan (clamped),
 * Reset View, and legend toggles (at least one series always visible).
 * `outputTrend()` derivation in sosmed.ts is untouched.
 */
export function InteractiveOutputTrend({ points }: { points: { label: string; planned: number; done: number }[] }) {
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
export function StrategyBar({ value, count, sharePct, fill }: { value: string; count: number; sharePct: number; fill: string }) {
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
export function countChip(label: string, count: number, tone: string) {
  return (
    <div className={`flex items-center justify-between rounded-[12px] border px-3 py-2 ${tone}`}>
      <span className="text-[0.85rem] font-semibold text-ink">{label}</span>
      <span className="text-[1rem] font-extrabold text-ink">{count}</span>
    </div>
  );
}

/** Compact content row: title, PIC, deadline, platform/status. */
export function ActionItemRow({ item }: { item: { title: string; pic: string; deadline: string; platform: string; status: string } }) {
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
export function filterCardHeader(label: string) {
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
export function DateField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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
export function PlannerField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.82rem] font-semibold text-muted">{label}{required ? <span className="text-danger"> *</span> : null}</label>
      {children}
    </div>
  );
}

/** §2.1/§4.1 — the Content Planner modal (child of the §3 component). */
export function ContentPlannerModal({
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
 * visible columns, filters, draft) lives in the parent dashboard and is
 * threaded in as props. `embedded` toggles inline chrome (section card) vs
 * fullscreen chrome; the toolbar/search/filters/table/pagination are identical.
 * ------------------------------------------------------------------------ */

export const EXPLORER_PAGE_SIZE = 15;

export interface ExplorerFilterDim {
  name: string;
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onReplace: (vals: Iterable<string>) => void;
}

export const btnPage =
  "h-8 min-w-8 rounded-[8px] border border-border bg-surface-input px-2 text-[0.8rem] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand/40";
export const btnReset =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover";

const EXPLORER_DEADLINES: { value: string; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "overdue", label: "Overdue" },
  { value: "dueToday", label: "Due Today" },
  { value: "dueThisWeek", label: "Due This Week" },
  { value: "future", label: "Future" },
  { value: "completed", label: "Completed" },
];

export function ContentExplorer({
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
              {EXPLORER_DEADLINES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

export const DETAIL_FIELDS: { label: string; source: string; kind: string }[] = [
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

export function RowDetailDrawer({
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

/**
 * §1.3 — Compact 3-item in-app sub-nav (Overview / Planning / Reporting),
 * sibling of WorkspaceNav, workspace-owned markup with the active item
 * matching the current route (usePathname). Rendered on the landing and both
 * sub-pages inside the capped body container.
 */
export function SosmedSubNav() {
  const pathname = usePathname();
  const items = [
    { href: "/sosmed", label: "Overview" },
    { href: "/sosmed/planning", label: "Planning" },
    { href: "/sosmed/reporting", label: "Reporting" },
  ];
  return (
    <nav aria-label="Sosmed sub-navigation" className="my-4 inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface p-1 shadow-[var(--dm-shadow-xs)]">
      {items.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1 rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors ${
              active ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
