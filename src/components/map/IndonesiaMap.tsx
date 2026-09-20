"use client";
/**
 * IndonesiaMap — dependency-free interactive SVG bubble map (viewBox 1000x368).
 *
 * Renders INDONESIA_PROVINCES paths (fill = brand heat by lead count; zero-count
 * provinces use a neutral grid fill) plus bubbles at each province centroid with
 * radius scaled from data (brand blue + stroke). No chart/geo library — hand-rolled
 * SVG + React state only (see WaAdminDashboard buildTreemap/donut convention).
 *
 * Interactions are PURE CLIENT STATE — never a refetch:
 *   - HOVER  : custom HTML tooltip overlay (Wilayah / Total Prospek / Persentase),
 *              clamped inside the container to avoid clipping.
 *   - CLICK  : detail panel below shows province total + per-region breakdown rows
 *              (provinceRegions). No fabricated regions.
 *   - ZOOM/PAN/RESET: +/− buttons + mouse wheel zoom, drag to pan, reset view.
 *
 * UI copy is Indonesian (app convention).
 */
import { useMemo, useRef, useState } from "react";
import { PALETTE, BRAND_RAMP, formatCount, formatPercent } from "@/components/ui-common";
import { INDONESIA_PROVINCES } from "@/location/indonesiaProvinces";

export interface ProvincePoint {
  province: string;
  count: number;
  pct: number;
}

export interface ProvinceRegionRow {
  region: string;
  count: number;
}

export interface IndonesiaMapProps {
  provinces: ProvincePoint[];
  provinceRegions: Record<string, ProvinceRegionRow[]>;
}

const VIEW_W = 1000;
const VIEW_H = 368;

function heatFill(count: number, maxCount: number): string {
  if (count <= 0) return PALETTE.grid;
  const t = maxCount > 0 ? count / maxCount : 0;
  const idx = Math.min(BRAND_RAMP.length - 1, Math.floor(t * (BRAND_RAMP.length - 1)));
  return BRAND_RAMP[idx];
}

/** Bubble radius: sqrt-scaled between an 8px floor and ~26px at the max. */
function bubbleRadius(count: number, maxCount: number): number {
  if (count <= 0) return 0;
  const t = maxCount > 0 ? count / maxCount : 0;
  return 8 + 18 * Math.sqrt(t);
}

export function IndonesiaMap({ provinces, provinceRegions }: IndonesiaMapProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ province: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const pointByProvince = useMemo(() => {
    const m = new Map<string, ProvincePoint>();
    for (const p of provinces) m.set(p.province, p);
    return m;
  }, [provinces]);

  const maxCount = useMemo(() => provinces.reduce((m, p) => Math.max(m, p.count), 0), [provinces]);

  const clampZoom = (s: number) => Math.min(8, Math.max(0.6, s));
  const zoomTo = (next: number, cx?: number, cy?: number) => {
    const ns = clampZoom(next);
    const rect = wrap.current?.getBoundingClientRect();
    const px = cx !== undefined && rect ? ((cx - rect.left) / rect.width) * VIEW_W : VIEW_W / 2;
    const py = cy !== undefined && rect ? ((cy - rect.top) / rect.height) * VIEW_H : VIEW_H / 2;
    const tx = px - (px - pan.x) * (ns / scale);
    const ty = py - (py - pan.y) * (ns / scale);
    setScale(ns);
    setPan({ x: tx, y: ty });
  };
  const zoomIn = () => zoomTo(scale * 1.35);
  const zoomOut = () => zoomTo(scale / 1.35);
  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSelected(null);
    setHover(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setHover(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = wrap.current?.getBoundingClientRect() ?? { width: 1, height: 1 };
    const ppm = VIEW_W / rect.width;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.sx) * ppm * (1 / scale),
      y: drag.current.py + (e.clientY - drag.current.sy) * ppm * (1 / scale),
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = wrap.current?.getBoundingClientRect();
    const cx = rect ? e.clientX - rect.left : undefined;
    const cy = rect ? e.clientY - rect.top : undefined;
    zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), cx, cy);
  };

  const hoverAt = (e: React.PointerEvent, province: string) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) {
      setHover({ province, x: VIEW_W / 2, y: 90 });
      return;
    }
    const x = Math.min(Math.max(8, e.clientX - rect.left), rect.width - 8);
    const y = Math.min(Math.max(70, e.clientY - rect.top), Math.max(70, rect.height - 8));
    setHover({ province, x, y });
  };

  const paths: React.ReactNode[] = [];
  const bubbles: React.ReactNode[] = [];
  for (const [name, geo] of Object.entries(INDONESIA_PROVINCES)) {
    const point = pointByProvince.get(name);
    const count = point?.count ?? 0;
    const isSel = selected === name;
    const enter = (e: React.PointerEvent) => {
      e.stopPropagation();
      hoverAt(e, name);
    };
    paths.push(
      <path
        key={name}
        d={geo.d}
        fill={heatFill(count, maxCount)}
        stroke={PALETTE.muted}
        strokeWidth={0.6}
        strokeOpacity={0.5}
        fillOpacity={isSel ? 1 : 0.92}
        onPointerEnter={enter}
        onPointerMove={enter}
        onPointerLeave={() => {
          if (hover?.province === name) setHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelected(isSel ? null : name);
        }}
      />,
    );
    if (count > 0) {
      bubbles.push(
        <circle
          key={name}
          cx={geo.c[0]}
          cy={geo.c[1]}
          r={bubbleRadius(count, maxCount)}
          fill={PALETTE.inkOnBrand}
          stroke={PALETTE.brand}
          strokeWidth={1.5}
          fillOpacity={0.98}
          onPointerEnter={enter}
          onPointerMove={enter}
          onPointerLeave={() => {
            if (hover?.province === name) setHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setSelected(isSel ? null : name);
          }}
        />,
      );
    }
  }

  const mappedTotal = provinces.reduce((s, p) => s + p.count, 0);
  const selPoint = selected ? pointByProvince.get(selected) : undefined;
  const selRows = selected ? provinceRegions[selected] ?? [] : [];

  return (
    <div className="w-full" ref={wrap}>
      {/* Zoom / pan controls (card-style, always visible, responsive). */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Perbesar peta" onClick={zoomIn}
          className="h-9 w-9 rounded-[10px] border border-border bg-surface text-[1.1rem] font-bold text-ink hover:bg-surface-strong">+</button>
        <button type="button" aria-label="Perkecil peta" onClick={zoomOut}
          className="h-9 w-9 rounded-[10px] border border-border bg-surface text-[1.1rem] font-bold text-ink hover:bg-surface-strong">−</button>
        <button type="button" aria-label="Reset tampilan peta" onClick={resetView}
          className="h-9 rounded-[10px] border border-border bg-surface px-3 text-[0.84rem] font-semibold text-ink hover:bg-surface-strong">Reset</button>
        <span className="ml-auto text-[0.76rem] text-muted">Gulir untuk zoom · seret untuk geser · klik untuk detail</span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-[16px] border border-border bg-surface">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          role="img"
          aria-label="Peta Indonesia — persebaran prospek per provinsi"
          className="block select-none"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            if (!drag.current) setHover(null);
          }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
            {paths}
            {bubbles}
          </g>
        </svg>

        {/* Hover tooltip overlay (clamped inside the container). */}
        {hover ? (() => {
          const p = pointByProvince.get(hover.province);
          const count = p?.count ?? 0;
          const pct = p?.pct ?? 0;
          return (
            <div
              className="pointer-events-none absolute z-20 rounded-[12px] border border-border bg-surface px-3 py-2 shadow-[var(--dm-shadow)]"
              style={{ left: `${Math.min(hover.x, 210)}px`, top: `${Math.max(0, hover.y - 96)}px` }}
            >
              <div className="text-[0.84rem] font-bold text-ink">{hover.province}</div>
              <div className="mt-1 flex flex-col gap-0.5 text-[0.78rem]">
                <span><span className="text-muted">Wilayah:</span> <span className="font-semibold text-ink">{hover.province}</span></span>
                <span><span className="text-muted">Total Prospek:</span> <span className="font-semibold text-ink">{formatCount(count)}</span></span>
                <span><span className="text-muted">Persentase:</span> <span className="font-semibold text-ink">{formatPercent(pct, mappedTotal > 0)}</span></span>
              </div>
            </div>
          );
        })() : null}
      </div>

      {/* Click detail panel: province total + per-region breakdown. */}
      {selected && selPoint ? (
        <div className="mt-3 rounded-[16px] border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[1rem] font-bold text-ink">{selected}</h4>
            <button type="button" onClick={() => setSelected(null)}
              className="text-[0.82rem] font-semibold text-muted hover:text-ink">✕ Tutup</button>
          </div>
          <p className="mt-1 text-[0.88rem] text-muted">
            Total Prospek: <span className="font-semibold text-ink">{formatCount(selPoint.count)}</span>
            {" "}·{" "}Persentase: <span className="font-semibold text-ink">{formatPercent(selPoint.pct, mappedTotal > 0)}</span>
          </p>
          {selRows.length ? (
            <ul className="mt-3 flex flex-col gap-1">
              {selRows.map((row) => (
                <li key={row.region}
                  className="flex items-center justify-between rounded-[10px] border border-divider bg-white/50 px-3 py-1.5">
                  <span className="text-[0.86rem] text-ink">{row.region}</span>
                  <span className="text-[0.86rem] font-semibold text-ink">{formatCount(row.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.82rem] text-muted">Rincian wilayah tidak tersedia untuk provinsi ini.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}