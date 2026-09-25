/**
 * WaAdminDashboard — presentational body of the WhatsApp Admin workspace
 * (read-only + CSV export). Given normalized rows from GET /api/tables/wa_admin
 * AND the registration rows from GET /api/registration/data, it renders the
 * "WhatsApp Admin + Registration Command Center" (NEO spec, wa_admin_registration
 * _ui_spec.md): wide 1920×1080 grid with registration command-center bands
 * (KPI Pendaftaran, Funnel, Needs Attention, Sumber, Pendaftar Terbaru) on top
 * and the EXISTING V3 4_WA_Admin.py content preserved inside a FOLDED
 * "Analisis WhatsApp Admin" band (default collapsed — no layout regression).
 *
 * Pure presentational: NO fetches in here. The route shell (app/(workspaces)/
 * wa-admin/page.tsx) owns useApi + auth + refetch. Kept server-renderable so
 * tests can assert derived counts via react-dom/server.
 */
"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { Row } from "@/server/adapter/source";
import { DataTable } from "@/components/grid/DataTable";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { EmptyState } from "@/components/sections/EmptyState";
import { PALETTE, formatCount, formatPercent } from "@/components/ui-common";
import { patchJson } from "@/lib/api-client";
import {
  deriveWaAdminStats,
  toCsv,
  csvFilename,
  buildTreemap,
  type WaAdminStats,
  type TrendPoint,
  type SourceStat,
  type TreemapItem,
  type TreemapRect,
} from "@/workspaces/waAdmin";
import {
  deriveRegistrationStats,
  conversionPct,
  cellOrDash,
  type FunnelStep,
  type NeedsCategory,
  type SourceRegStat,
  type RegistrationMatch,
  type PicStat,
} from "@/workspaces/registration";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  PIC_FALLBACK,
  SUMBER_FALLBACK,
  KATEGORI_FALLBACK,
  STATUS_FALLBACK,
  distinctCellValues,
  type WaAdminFormValues,
  type WaAdminFieldErrors,
  type WaAdminFieldName,
} from "@/workspaces/waAdminForm";
import { rowToFormValue, changedFieldValues, validateWaAdminEdit } from "@/workspaces/waAdminEdit";
import { buildMonthlyReport, reportPeriodOptions, type MonthlyReport } from "@/workspaces/waAdminReport";
import { WaMonthlyReport } from "@/workspaces/MonthlyReport";
import {
  rowToRegFormValue,
  changedRegFieldValues,
  validateRegEdit,
  regEditOptions,
  regRowIndex,
  type RegEditValues,
  type RegEditFieldErrors,
} from "@/workspaces/registrationEdit";
import { WaAdminDataForm } from "@/components/ops/WaAdminDataForm";
import { WaAdminEditData } from "@/components/ops/WaAdminEditData";

export interface WaAdminDashboardProps {
  /** WA Admin rows (GET /api/tables/wa_admin). */
  rows: Row[];
  /** Declared schema columns for the wa_admin tab (rendering fallback). */
  columns: string[];
  /** Registration rows (GET /api/registration/data). Default empty. */
  registrationRows?: Row[];
  /** Open the folded "Analisis WhatsApp Admin" band by default (tests). */
  initialAnalisisOpen?: boolean;
  onRefresh?: () => void;
}

/** Status donut colors — V3 `[blue, success, warn, danger, "#7D8FA3"]`, hardened:
    hardcoded hex re-pointed to PALETTE (semantic status trio kept + categorical pastels). */
const DONUT_COLORS = [PALETTE.brand, PALETTE.success, PALETTE.warning, PALETTE.danger, PALETTE.catSlate, PALETTE.catPurple, PALETTE.catTeal, PALETTE.catOrange, PALETTE.catMint, PALETTE.catPink];

const allStatusesLabel = "Semua status";
const allMonthsLabel = "Semua Bulan";
const allYearsLabel = "__all";

/** Tiny truncation for treemap block labels (full name lives in the tooltip). */
function truncateLabel(name: string, max = 16): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** Colors for "Tag Asal" treemap blocks (dependency-free SVG) — PALETTE.cat* multi-hue. */
const TREEMAP_COLORS = [
  PALETTE.catBlue, PALETTE.catGreen, PALETTE.catPurple, PALETTE.catOrange, PALETTE.catTeal,
  PALETTE.catPink, PALETTE.catSlate, PALETTE.catSand, PALETTE.catLavender, PALETTE.catMint,
];

const LABEL_MEDIUM_AREA = 3600;
const LABEL_MEDIUM_MIN_W = 60;
const LABEL_MEDIUM_MIN_H = 30;
const LABEL_LARGE_AREA = 12000;
const LABEL_LARGE_MIN_W = 110;
const LABEL_LARGE_MIN_H = 52;

/**
 * "Tag Asal" treemap — SVG, dependency-free (preserved from existing UI).
 * Added: mouse-following tooltip (Tag + jumlah data) and click-to-select/highlight.
 * Pure layout/UX: same buildTreemap data & calculations, nulls still skipped by asalBreakdown.
 */
function TagAsalTreemap({ items }: { items: TreemapItem[] }) {
  const W = 1000;
  const H = 400;
  const rects = buildTreemap(items, W, H);
  const total = items.reduce((s, i) => s + i.n, 0) || 1;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; name: string; n: number; pct: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const move = (e: ReactMouseEvent<SVGGElement>, r: TreemapRect) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(e.clientX - box.left + 12, box.width - 176);
    const y = Math.max(e.clientY - box.top - 60, 6);
    setTip({
      x,
      y,
      name: r.name,
      n: r.n,
      pct: ((r.n / total) * 100).toFixed(1),
    });
  };
  const leave = () => setTip(null);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Treemap Tag Asal — blok dapat diklik untuk memilih; hover untuk detail"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        {rects.map((r, i) => {
          const color = TREEMAP_COLORS[i % TREEMAP_COLORS.length];
          const area = r.w * r.h;
          const isLarge = area >= LABEL_LARGE_AREA && r.w >= LABEL_LARGE_MIN_W && r.h >= LABEL_LARGE_MIN_H;
          const isMedium = area >= LABEL_MEDIUM_AREA && r.w >= LABEL_MEDIUM_MIN_W && r.h >= LABEL_MEDIUM_MIN_H;
          const baseFont = isLarge ? 17 : isMedium ? 13 : 0;
          const fontSize = baseFont ? Math.min(baseFont, r.h - 6) : 0;
          const showLabel = isMedium && fontSize >= 10;
          const maxChars = showLabel ? Math.max(4, Math.floor((r.w - 8) / (fontSize * 0.62))) : 16;
          const pct = ((r.n / total) * 100).toFixed(1);
          const isSel = selected === r.name;
          return (
            <g
              key={`${r.name}-${i}`}
              onMouseMove={(e) => move(e, r)}
              onMouseLeave={leave}
              onClick={() => setSelected((cur) => (cur === r.name ? null : r.name))}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={r.x} y={r.y} width={r.w} height={r.h} rx="5"
                fill={color}
                stroke={isSel ? PALETTE.ink : "#fff"}
                strokeWidth={isSel ? 3 : 1.5}
                opacity={selected && !isSel ? 0.4 : 1}
              />
              <title>{`Tag Asal: ${r.name}\nJumlah Lead: ${r.n}\nPersentase dari Total Lead: ${pct}%`}</title>
              {showLabel ? (
                <text
                  x={r.x + r.w / 2} y={r.y + r.h / 2 + fontSize * 0.35}
                  textAnchor="middle" fontSize={fontSize} fontWeight="800"
                  fill={PALETTE.ink}
                >
                  {truncateLabel(r.name, maxChars)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {tip ? (
        <div
          className="pointer-events-none absolute z-20 min-w-[168px] rounded-[12px] border border-border bg-surface px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="truncate text-[0.95rem] font-extrabold text-ink" title={tip.name}>{tip.name}</div>
          <div className="mt-1.5 flex items-center justify-between gap-4 text-[0.82rem]">
            <span className="font-semibold text-muted">Jumlah Lead</span>
            <span className="font-extrabold text-ink">{tip.n}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-[0.82rem]">
            <span className="font-semibold text-muted">Persentase</span>
            <span className="font-extrabold text-brand-hover">{tip.pct}%</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One colored operational table card (CLOSING / SALES PROGRESS / PENDING
 * FORM-L1 / FUTURE PROSPECT) — preserved from the existing UI (full-screen
 * expand overlay + count badge + per-card scroll).
 */
function OperationalTable({
  title,
  icon,
  color,
  rows,
  columns,
  emptyHint,
}: {
  title: string;
  icon: string;
  color: string;
  rows: Row[];
  columns: string[];
  emptyHint: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const card = (
    <section className="min-w-0 rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[0.95rem]" style={{ backgroundColor: `${color}1F` }}>
          {icon}
        </span>
        <h4 className="text-[1.02rem] font-extrabold tracking-[-0.01em] text-ink">{title}</h4>
        <span
          className="rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {rows.length}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] border border-brand/30 px-3 py-1.5 text-[0.8rem] font-bold text-brand-hover transition-colors hover:border-brand hover:bg-brand/5"
          aria-label={`Perbesar tabel ${title}`}
        >
          ⛶ Full Screen
        </button>
      </div>
      {rows.length ? (
        <DataTable
          rows={rows}
          columns={columns}
          accentColor={color}
          maxHeightClass="max-h-[360px]"
          emptyTitle="Tidak ada data."
        />
      ) : (
        <EmptyState title="Belum ada data pada kategori ini." hint={emptyHint} icon={icon} />
      )}
    </section>
  );

  if (!expanded) return card;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tabel ${title} — Tampilan penuh`}
        data-hermes-no-print
        onKeyDown={(e) => {
          if (e.key === "Escape") setExpanded(false);
        }}
        className="z-[70]"
      >
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setExpanded(false)} aria-hidden />
        <div className="fixed inset-x-3 inset-y-3 z-10 flex flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--dm-shadow)] sm:inset-x-6 sm:inset-y-6">
          <div className="flex flex-wrap items-center gap-3 border-b border-divider px-5 py-3.5">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[1.05rem]" style={{ backgroundColor: `${color}1F` }}>
              {icon}
            </span>
            <h3 className="text-[1.15rem] font-extrabold tracking-[-0.01em] text-ink">{title}</h3>
            <span
              className="rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {rows.length}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" onClick={() => setExpanded(false)} className="shrink-0">
                ⟵ Kembali
              </Button>
              <Button variant="ghost" onClick={() => setExpanded(false)} ariaLabel="Tutup tampilan penuh">
                ✕
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3">
            {rows.length ? (
              <DataTable
                rows={rows}
                columns={columns}
                accentColor={color}
                maxHeightClass="max-h-none"
                emptyTitle="Tidak ada data."
              />
            ) : (
              <EmptyState title="Belum ada data pada kategori ini." hint={emptyHint} icon={icon} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Horizontal bar of count stats — preserved from existing UI. */
function DistBars({ dist, color = PALETTE.brand, labelWidth = "w-40" }: { dist: SourceStat[]; color?: string; labelWidth?: string }) {
  const max = Math.max(...dist.map((s) => s.n), 1);
  const barBg = `${color}14`;
  return (
    <div className="flex flex-col gap-1.5">
      {dist.map((s) => (
        <div key={s.name} className="flex items-center gap-3">
          <span className={`${labelWidth} shrink-0 truncate text-[0.84rem] font-semibold text-ink`} title={s.name}>
            {s.name}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded-md" style={{ backgroundColor: barBg }}>
            <div
              className="h-full rounded-md"
              style={{ width: `${(s.n / max) * 100}%`, background: color }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[0.84rem] font-bold text-ink">{s.n}</span>
        </div>
      ))}
    </div>
  );
}

const MEKARI_TAG_DEFAULT = 6;

/** Mekari Tag list — preserved from existing UI. */
function MekariTagList({ dist }: { dist: SourceStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? dist : dist.slice(0, MEKARI_TAG_DEFAULT);
  const total = dist.reduce((s, d) => s + d.n, 0);
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
          <DistBars dist={shown} color={PALETTE.warning} labelWidth="w-36" />
        </div>
        {!expanded && dist.length > MEKARI_TAG_DEFAULT ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/95 to-transparent" />
        ) : null}
      </div>
      {dist.length > MEKARI_TAG_DEFAULT ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-brand/30 px-3 py-1.5 text-[0.8rem] font-bold text-brand-hover transition-colors hover:border-brand hover:bg-brand/5"
        >
          {expanded ? "⤒ Tampilkan Lebih Sedikit" : `⤓ Lihat Semua (${dist.length} tag · ${total} lead)`}
        </button>
      ) : null}
    </div>
  );
}

/** Dependency-free SVG donut (hole 0.55) — preserved from existing UI. */
function StatusDonut({ dist }: { dist: SourceStat[] }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  const total = dist.reduce((sum, d) => sum + d.n, 0) || 1;
  const segs = dist.reduce<{ d: SourceStat; len: number; offset: number }[]>((acc, d) => {
    const len = (d.n / total) * c;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ d, len, offset });
    return acc;
  }, []);
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label="Distribusi status"
      className="mx-auto h-full w-full"
    >
      <circle cx="100" cy="100" r={r} fill="none" stroke={PALETTE.grid} strokeWidth="26" />
      {segs.map((seg, i) => (
        <circle
          key={`${seg.d.name}-${i}`}
          cx="100" cy="100" r={r} fill="none"
          stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="26"
          strokeDasharray={`${seg.len} ${c - seg.len}`} strokeDashoffset={-seg.offset}
          transform="rotate(-90 100 100)"
        />
      ))}
      <text x="100" y="108" textAnchor="middle" fontSize="40" fontWeight="800" fill={PALETTE.ink}>
        {total}
      </text>
      <text x="100" y="126" textAnchor="middle" fontSize="13" fontWeight="600" fill={PALETTE.muted}>
        status
      </text>
    </svg>
  );
}

/** Distribusi Status: total + per-status breakdown with color legend. */
function StatusDistribution({ dist }: { dist: SourceStat[] }) {
  const total = dist.reduce((s, d) => s + d.n, 0);
  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="w-44 shrink-0">
        <StatusDonut dist={dist} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[0.82rem] font-semibold text-muted">Breakdown</span>
          <span className="text-[0.82rem] font-semibold text-muted">Total <b className="text-ink">{total}</b></span>
        </div>
        <div className="mt-2 flex max-h-[248px] flex-col gap-1 overflow-y-auto pr-1">
          {dist.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2.5 text-[0.84rem]">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate text-ink" title={d.name}>{d.name}</span>
              <span className="shrink-0 font-bold text-ink">{d.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dependency-free SVG line chart — preserved from existing UI. */
function TrendLine({ trend }: { trend: TrendPoint[] }) {
  const W = 620;
  const H = 240;
  const padX = 40;
  const padY = 28;
  const max = Math.max(...trend.map((t) => t.leads), 1);
  const stepX = trend.length > 1 ? (W - padX * 2) / (trend.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2);
  const pts = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.leads).toFixed(1)}`);
  const last = trend.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tren leads per bulan" className="h-full w-full">
      {[0, 1, 2, 3].map((g) => {
        const gy = padY + (g / 3) * (H - padY * 2);
        return (
          <line key={g} x1={padX} x2={W - padX} y1={gy} y2={gy} stroke={PALETTE.grid} strokeWidth="1" />
        );
      })}
      <polyline points={pts.join(" ")} fill="none" stroke={PALETTE.brand} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {trend.map((t, i) => (
        <g key={t.period}>
          <circle cx={x(i)} cy={y(t.leads)} r="4" fill={PALETTE.brand} stroke="#fff" strokeWidth="1.5" />
          <text x={x(i)} y={y(t.leads) - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={PALETTE.ink}>
            {t.leads}
          </text>
          {i % 2 === 0 || i === last ? (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={PALETTE.muted}>
              {t.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** QuickReport — print-optimized summary (preserved from existing UI). */
function QuickReport({
  stats,
  monthLabel,
  now = new Date(),
}: {
  stats: WaAdminStats;
  monthLabel: string;
  now?: Date;
}) {
  const dateLabel = now.toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
  });
  return (
    <section
      aria-label="Quick Report WhatsApp Admin"
      className="rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-divider pb-3">
        <div>
          <p className="text-[0.74rem] font-bold uppercase tracking-[0.14em] text-brand">Quick Report</p>
          <h3 className="mt-1 text-[1.3rem] font-extrabold tracking-[-0.01em] text-ink">WhatsApp Admin</h3>
        </div>
        <div className="text-right text-[0.8rem] font-semibold text-muted">
          <div>Periode: <span className="text-ink">{monthLabel}</span></div>
          <div className="mt-0.5">Dibuat: {dateLabel} • {timeLabel}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Pesan", value: String(stats.total) },
          { label: "Closing", value: String(stats.closing) },
          { label: "Conversion", value: stats.conversionLabel },
          { label: "Closing / Target", value: stats.closingTargetLabel },
        ].map((m) => (
          <div key={m.label} className="rounded-[14px] border border-border bg-white/70 p-3">
            <div className="text-[0.72rem] font-bold uppercase tracking-[0.04em] text-muted">{m.label}</div>
            <div className="mt-1 text-[1.25rem] font-extrabold text-ink">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.82rem] font-bold text-ink">Status</h4>
          <ul className="divide-y divide-divider rounded-[14px] border border-border bg-white/70 px-3">
            {stats.statusDist.length ? stats.statusDist.slice(0, 8).map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-3 py-1.5 text-[0.84rem]">
                <span className="min-w-0 truncate text-ink">{d.name}</span>
                <span className="shrink-0 font-bold text-ink">{d.n}</span>
              </li>
            )) : <li className="py-2 text-[0.84rem] text-muted">Belum ada data.</li>}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-[0.82rem] font-bold text-ink">Funnel Operasional</h4>
          <ul className="divide-y divide-divider rounded-[14px] border border-border bg-white/70 px-3">
            <li className="flex items-center justify-between gap-3 py-1.5 text-[0.84rem]">
              <span className="text-ink">CLOSING</span>
              <span className="shrink-0 font-bold text-ink">{stats.closingRows.length}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5 text-[0.84rem]">
              <span className="text-ink">SALES PROGRESS</span>
              <span className="shrink-0 font-bold text-ink">{stats.salesProgress.length}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5 text-[0.84rem]">
              <span className="text-ink">PENDING FORM - L1</span>
              <span className="shrink-0 font-bold text-ink">{stats.pendingForm.length}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-1.5 text-[0.84rem]">
              <span className="text-ink">FUTURE PROSPECT</span>
              <span className="shrink-0 font-bold text-ink">{stats.futureProspect.length}</span>
            </li>
          </ul>
          <p className="mt-2 text-[0.74rem] leading-snug text-muted">
            Closing &amp; Sales Progress = kolom Status. Future Prospect = tag Mekari &quot;Future Prospect&quot;.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Registration Command Center — LOCAL presentational composition (NEO spec).
 * All new blocks are composed here with Tailwind + PALETTE; shared components
 * are never edited.
 * ------------------------------------------------------------------------ */

/** Resolve PALETTE color for a needs-category semantic key. */
function needsColor(key: NeedsCategory["key"]): string {
  switch (key) {
    case "belumPenjadwalan":
    case "interviewBelumHasil":
      return PALETTE.warning;
    case "diterimaJuknisBelum":
    case "juknisBelumPayment":
      return PALETTE.brand;
    case "paymentBelumGrup":
      return PALETTE.success;
    default:
      return PALETTE.warning;
  }
}

/** 2a — Funnel Pendaftaran (local horizontal 6-step funnel, dependency-free). */
function FunnelPanel({ funnel }: { funnel: FunnelStep[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  const barBg = `${PALETTE.brand}14`;
  return (
    <ChartContainer data={funnel} heightClass="h-[320px]" label="Funnel Pendaftaran">
      <div className="flex h-full flex-col gap-3">
        {funnel.map((step, i) => {
          const prev = i === 0 ? null : funnel[i - 1].count;
          const conv = i === 0 ? "—" : conversionPct(prev!, step.count);
          return (
            <div key={step.key} className="flex items-center gap-3 min-w-0">
              <span className="w-28 shrink-0 truncate text-[0.84rem] font-semibold text-ink" title={step.label}>
                {step.label}
              </span>
              <div className="h-[40px] flex-1 overflow-hidden rounded-md" style={{ backgroundColor: barBg }}>
                <div
                  className="h-full rounded-md"
                  style={{ width: `${(step.count / max) * 100}%`, background: PALETTE.brand }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-[0.86rem] font-bold text-ink">{step.count}</span>
              <span className="w-16 shrink-0 text-right text-[0.72rem] font-semibold text-muted">{conv}</span>
            </div>
          );
        })}
      </div>
    </ChartContainer>
  );
}

/** 2b — Needs Attention (compact panel, fixed height, accordion expand). */
function NeedsAttention({ needs, total, matches }: {
  needs: NeedsCategory[];
  total: number;
  matches: Map<Row, RegistrationMatch>;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className="rounded-[18px] border border-border bg-surface p-2 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]">
      <div className="mb-2 flex items-center justify-between px-3">
        <span className="text-[0.82rem] font-semibold text-muted">Perlu Perhatian</span>
        {total > 0 ? (
          <span className="rounded-full px-2.5 py-0.5 text-[0.8rem] font-bold text-white" style={{ backgroundColor: PALETTE.danger }}>
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <div className="h-[320px]">
          <EmptyState title="Tidak ada pendaftar yang perlu perhatian." />
        </div>
      ) : (
        <div className="h-[320px] overflow-y-auto divide-y divide-divider pr-1">
          {needs.map((cat) => {
            const color = needsColor(cat.key);
            const open = openKey === cat.key;
            return (
              <div key={cat.key} className="px-3">
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : cat.key)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                  aria-expanded={open}
                  aria-label={cat.label}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="min-w-0 flex-1 truncate text-[0.84rem] font-semibold text-ink" title={cat.label}>{cat.label}</span>
                    <span className="shrink-0 rounded-full bg-ink/8 px-2 py-0.5 text-[0.72rem] font-bold text-muted">{cat.rows.length}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-[0.72rem] text-muted">{open ? "▾" : "▸"}</span>
                </button>
                {open ? (
                  <div className="mt-1 max-h-[220px] overflow-y-auto pr-1">
                    {cat.rows.length ? cat.rows.slice(0, 24).map((r, i) => {
                      const m = matches.get(r);
                      const nama = cellOrDash(r["Nama Lengkap"]);
                      const wa = cellOrDash(r["Nomor Whatsapp"] || r["Nomor Handphone"] || "");
                      return (
                        <button
                          key={i}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-[10px] px-2.5 py-1.5 text-left transition-colors hover:bg-brand/5"
                        >
                          <span className="min-w-0 truncate text-[0.82rem] text-ink" title={nama}>{nama}</span>
                          <span className="shrink-0 text-[0.76rem] text-muted">
                            {wa}
                            {m ? <span className="ml-1.5 inline-block" style={{ color: PALETTE.success }}>✓</span> : null}
                          </span>
                        </button>
                      );
                    }) : (
                      <p className="px-2.5 py-1.5 text-[0.8rem] text-muted">{cat.emptyHint}</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 3a — Sumber Pendaftaran (per source: Pendaftar / Diterima / Pembayaran). */
function SourcePanel({ sources }: { sources: SourceRegStat[] }) {
  return (
    <ChartContainer data={sources} heightClass="h-[400px]" label="Sumber Pendaftaran">
      <div className="h-full overflow-y-auto pr-1">
        <div className="mb-1 grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,4.5rem))] gap-3 border-b border-divider pb-1">
          <span className="text-[0.72rem] font-bold uppercase tracking-[0.04em] text-muted">Mengetahui Duta Persada dari…</span>
          <span className="text-right text-[0.72rem] font-bold uppercase tracking-[0.02em] text-muted">Pendaftar</span>
          <span className="text-right text-[0.72rem] font-bold uppercase tracking-[0.02em] text-muted">Diterima</span>
          <span className="text-right text-[0.72rem] font-bold uppercase tracking-[0.02em] text-muted">Pembayaran</span>
        </div>
        {sources.map((s) => (
          <div key={s.name} className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,4.5rem))] gap-3 py-1 text-[0.84rem]">
            <span className="min-w-0 truncate text-ink" title={s.name}>{s.name}</span>
            <span className="text-right font-bold text-ink">{s.pendaftar}</span>
            <span className="text-right font-semibold text-ink">{s.diterima}</span>
            <span className="text-right font-semibold text-ink">{s.pembayaran}</span>
          </div>
        ))}
      </div>
    </ChartContainer>
  );
}

/* --------------------------------------------------------------------------
 * BAND 3 — Pendaftar Terbaru (full-width, expandable, per-row inline edit)
 * Local field primitives + Status chip + ✏️ Ubah (PATCH per changed field).
 * ------------------------------------------------------------------------ */
const FIELD_BASE =
  "w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink " +
  "placeholder:text-muted/70 focus:border-brand focus:shadow-[var(--dm-shadow-xs)] " +
  "focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
const FIELD_ERROR = " border-danger focus:border-danger focus:ring-danger";

function ErrText({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <span role="alert" data-error className="text-[0.78rem] font-semibold text-danger">
      {error}
    </span>
  );
}

function FieldWrap({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[0.82rem] font-semibold text-muted">
        {label}
      </label>
      {children}
      <ErrText error={error} />
    </div>
  );
}

function InlineTextField({
  id,
  label,
  error,
  value,
  placeholder,
  onInput,
}: {
  id: string;
  label: string;
  error?: string;
  value: string;
  placeholder?: string;
  onInput: (v: string) => void;
}) {
  const cls = `${FIELD_BASE}${error ? FIELD_ERROR : ""}`;
  return (
    <FieldWrap label={label} error={error} htmlFor={id}>
      <input id={id} type="text" value={value} placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)} className={cls} />
    </FieldWrap>
  );
}

function InlineSelectField({
  id,
  label,
  error,
  value,
  options,
  onSelect,
}: {
  id: string;
  label: string;
  error?: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  const cls = `${FIELD_BASE} appearance-none pr-9${error ? FIELD_ERROR : ""}`;
  return (
    <FieldWrap label={label} error={error} htmlFor={id}>
      <span className="relative">
        <select id={id} value={value} onChange={(e) => onSelect(e.target.value)} className={cls}>
          <option value="" disabled>— Pilih —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">▾</span>
      </span>
    </FieldWrap>
  );
}

/** Live-distinct first, fallback second, stored legacy value kept as extra option. */
function inlOpts(live: string[], stored: string | undefined): string[] {
  const out = [...live];
  const s = (stored ?? "").trim();
  if (s && !out.includes(s)) out.push(s);
  return out;
}

const KEY = WA_ADMIN_PAYLOAD_KEYS;
const SUCCESS_EDIT_COPY = "Data berhasil diperbarui.";
const ERROR_EDIT_COPY = "Data gagal diperbarui. Silakan coba lagi.";

/** Compact `DD/MM/YYYY` from a registration Timestamp cell (or "—"). Local to
 *  the recent-table read view; preserves the registration Timestamp as-is in
 *  the underlying sheet (display only, never written back). */
function tsDisplay(value: unknown): string {
  const src = String(value ?? "").trim();
  const m = src.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${d.padStart(2, "0")}/${mo.padStart(2, "0")}/${y}`;
  }
  const iso = src.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${d}/${mo}/${y}`;
  }
  return src === "" ? "—" : src;
}

function RecentTable({ recent, matches, rows, onRefresh }: {
  recent: Row[];
  matches: Map<Row, RegistrationMatch>;
  rows: Row[];
  onRefresh?: () => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState(-1);
  const [preFill, setPreFill] = useState<WaAdminFormValues | null>(null);
  const [editValues, setEditValues] = useState<WaAdminFormValues | null>(null);
  const [errors, setErrors] = useState<WaAdminFieldErrors>({});
  const [saving, setSaving] = useState(false);
  // Registration-row edit (persists to the Form Responses 1 workbook).
  const [regEditingIndex, setRegEditingIndex] = useState<number | null>(null);
  const [regRowIndexVal, setRegRowIndexVal] = useState(-1);
  const [regPre, setRegPre] = useState<RegEditValues | null>(null);
  const [regValues, setRegValues] = useState<RegEditValues | null>(null);
  const [regErrors, setRegErrors] = useState<RegEditFieldErrors>({});
  const [regSaving, setRegSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /** Six detail groups (spec §3b) mapped to the actual registration columns. */
  function detailGroups(r: Row): { group: string; fields: [string, unknown][] }[] {
    return [
      {
        group: "Data Pribadi",
        fields: [
          ["Nama Lengkap", r["Nama Lengkap"]],
          ["Tempat Lahir", r["Tempat Lahir"]],
          ["Tanggal Lahir", r["Tanggal Lahir"]],
          ["Usia", r["Usia"]],
          ["ALAMAT TEMPAT TINGGAL", r["ALAMAT TEMPAT TINGGAL"]],
        ],
      },
      {
        group: "Sekolah",
        fields: [
          ["ASAL SEKOLAH (SMA/SMK)", r["ASAL SEKOLAH (SMA/SMK)"]],
          ["JURUSAN DI SMA/SMK", r["JURUSAN DI SMA/SMK"]],
        ],
      },
      {
        group: "Kontak",
        fields: [
          ["Nomor Whatsapp", r["Nomor Whatsapp"]],
          ["Nomor Handphone", r["Nomor Handphone"]],
          ["Email", r["Email"]],
          ["AKUN INSTAGRAM", r["AKUN INSTAGRAM"]],
        ],
      },
      {
        group: "Orang Tua",
        fields: [
          ["NAMA AYAH", r["NAMA AYAH"]],
          ["Nomor Handphone Ayah", r["Nomor Handphone Ayah"]],
          ["Nama Ibu", r["Nama Ibu"]],
          ["Pekerjaan", r["Pekerjaan"]],
        ],
      },
      {
        group: "Verifikasi / Dokumen",
        fields: [
          ["Upload KTP", r["Upload KTP anda (bisa di foto atau scan)"]],
          ["Foto Diri", r["UPLOAD FOTO DIRI (UNTUK VERIFIKASI KEASLIAN)"]],
        ],
      },
      {
        group: "Status Proses",
        fields: [
          ["Penjadwalan Interview", r["Penjadwalan Interview"]],
          ["Interview", r["Interview"]],
          ["Hasil Interview", r["Hasil Interview\n(Diterima/Tidak)"]],
          ["Pengiriman Juknis", r["Pengiriman Juknis"]],
          ["Pembayaran", r["Pembayaran"]],
          ["Invite Grup Pendaftar", r["Invite Grup Pendaftar"]],
        ],
      },
    ];
  }

  const closeRegEdit = () => {
    setRegEditingIndex(null);
    setRegRowIndexVal(-1);
    setRegPre(null);
    setRegValues(null);
    setRegErrors({});
  };

  const closeEdit = () => {
    setEditingIndex(null);
    setEditingRowIndex(-1);
    setPreFill(null);
    setEditValues(null);
    setErrors({});
    closeRegEdit();
  };

  const openEdit = (i: number, m: RegistrationMatch) => {
    const pre = rowToFormValue(m.waRow);
    closeRegEdit();
    setPreFill(pre);
    setEditValues(pre);
    setErrors({});
    setEditingIndex(i);
    setEditingRowIndex(Number(m.waRow.__rowIndex));
    setOpenIndex(i);
  };

  const openRegEdit = (i: number, r: Row) => {
    const pre = rowToRegFormValue(r);
    setEditingIndex(null);
    setRegPre(pre);
    setRegValues(pre);
    setRegErrors({});
    setRegEditingIndex(i);
    setRegRowIndexVal(regRowIndex(r));
    setOpenIndex(i);
  };

  const setField = (field: WaAdminFieldName) => (v: string) =>
    setEditValues((cur) => (cur ? { ...cur, [field]: v } : cur));

  const setRegField = (field: keyof RegEditValues) => (v: string) =>
    setRegValues((cur) => (cur ? { ...cur, [field]: v } : cur));

  const toggleRow = (i: number) => {
    if (editingIndex !== null) closeEdit(); // escape discards the draft
    if (regEditingIndex !== null) closeRegEdit();
    setOpenIndex((cur) => (cur === i ? null : i));
  };

  const handleRegSave = async (r: Row, e: FormEvent) => {
    e.preventDefault();
    if (regSaving || !regPre || !regValues || regRowIndexVal < 0) return;
    const errs = validateRegEdit(regValues);
    setRegErrors(errs);
    if (Object.keys(errs).length) return;
    const changed = changedRegFieldValues(regPre, regValues);
    if (changed.length === 0) {
      await finishSuccess();
      return;
    }
    setRegSaving(true);
    try {
      for (const { column, value } of changed) {
        await patchJson("/api/registration/data", { rowIndex: regRowIndexVal, column, value });
      }
      setRegSaving(false);
      await finishSuccess();
    } catch {
      setRegSaving(false);
      setToast({ kind: "error", msg: ERROR_EDIT_COPY });
    }
  };

  const finishSuccess = async () => {
    setOpenIndex(null);
    closeEdit();
    onRefresh?.();
    setToast({ kind: "success", msg: SUCCESS_EDIT_COPY });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !preFill || !editValues || editingRowIndex < 0) return;
    const errs = validateWaAdminEdit(editValues);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const changed = changedFieldValues(preFill, editValues);
    if (changed.length === 0) {
      await finishSuccess();
      return;
    }
    setSaving(true);
    try {
      for (const { column, value } of changed) {
        await patchJson("/api/tables/wa_admin", { rowIndex: editingRowIndex, column, value });
      }
      setSaving(false);
      await finishSuccess();
    } catch {
      setSaving(false);
      setToast({ kind: "error", msg: ERROR_EDIT_COPY });
    }
  };

  const picOptions = inlOpts(distinctCellValues(rows, KEY.pic, PIC_FALLBACK), editValues?.pic);
  const sumberOptions = inlOpts(distinctCellValues(rows, KEY.sumber, SUMBER_FALLBACK), editValues?.sumber);
  const kategoriOptions = inlOpts(distinctCellValues(rows, KEY.kategori, KATEGORI_FALLBACK), editValues?.kategori);
  const statusOptions = inlOpts(distinctCellValues(rows, STATUS_COLUMN, STATUS_FALLBACK), editValues?.status);

  return (
    <section className="rounded-[18px] border border-border bg-surface p-4 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h4 className="text-[1.02rem] font-extrabold tracking-[-0.01em] text-ink">Pendaftar Terbaru</h4>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.8rem] font-bold text-brand-hover">{recent.length}</span>
          <span className="text-[0.72rem] text-muted">Klik baris untuk melihat detail data.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={recent.length === 0}
            onClick={() => setExpanded(true)}
            className="shrink-0"
            ariaLabel="Perluas tabel Pendaftar Terbaru ke layar penuh"
          >
            ⛶ Full Screen
          </Button>
          <span className="rounded-full border border-muted/40 px-2.5 py-0.5 text-[0.72rem] font-medium text-muted">
            ✏️ Form = edit Form Pendaftaran · ✏️ Ubah = edit WA Admin.
          </span>
        </div>
      </div>
      {recent.length === 0 ? (
        <div className="max-h-[520px]">
          <EmptyState title="Belum ada pendaftar pada tahun ini." hint="Pilih tahun lain atau Semua Tahun." />
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto rounded-[14px] border border-divider">
          <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.7rem)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] gap-4 border-b border-divider bg-white/90 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.02em] text-muted backdrop-blur-[8px]">
            <span>No</span>
            <span>Tanggal Masuk</span>
            <span>Nama</span>
            <span>WhatsApp</span>
            <span>Source</span>
            <span>Interview</span>
            <span>Hasil</span>
            <span>Pembayaran</span>
            <span>Status</span>
            <span aria-hidden>▾</span>
          </div>
          {recent.map((r, i) => {
            const open = openIndex === i;
            const m = matches.get(r);
            const nama = cellOrDash(r["Nama Lengkap"]);
            const wa = cellOrDash(r["Nomor Whatsapp"] || r["Nomor Handphone"] || "");
            return (
              <div key={i} className="border-b border-divider">
                <div className="grid grid-cols-[minmax(0,1.7rem)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] items-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleRow(i)}
                    aria-expanded={open}
                    aria-controls={open ? `recent-detail-${i}` : undefined}
                    disabled={saving}
                    className="col-span-9 grid grid-cols-[minmax(0,1.7rem)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] items-center gap-4 px-3 py-2 text-left text-[0.84rem] transition-colors hover:bg-brand/5 focus-visible:bg-brand/10 focus-visible:outline-none"
                  >
                    <span className="w-[1.7rem] shrink-0 pr-1 text-right text-[0.78rem] font-semibold text-muted">{i + 1}</span>
                    <span className="whitespace-nowrap text-[0.78rem] text-muted" title={String(r["Timestamp"] ?? "")}>{tsDisplay(r["Timestamp"])}</span>
                    <span className="min-w-0 truncate text-ink" title={String(r["Nama Lengkap"] ?? "")}>{nama}</span>
                    <span className="min-w-0 truncate text-muted" title={String(r["Nomor Whatsapp"] ?? "")}>{wa}</span>
                    <span className="min-w-0 truncate text-muted" title={String(r["MENGETAHUI DUTA PERSADA DARI"] ?? "")}>{cellOrDash(r["MENGETAHUI DUTA PERSADA DARI"])}</span>
                    <span className="text-ink">{cellOrDash(r["Interview"])}</span>
                    <span className="text-ink">{cellOrDash(r["Hasil Interview\n(Diterima/Tidak)"])}</span>
                    <span className="text-ink">{cellOrDash(r["Pembayaran"])}</span>
                    <span aria-hidden>
                      {m ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[0.78rem] font-bold"
                          style={{ backgroundColor: "rgba(34,160,107,0.12)", color: PALETTE.success }}>
                          ✓ Terdaftar
                        </span>
                      ) : (
                        <span title="Belum cocok di WA Admin. Nama akan dicocokkan otomatis." className="rounded-full border border-muted/40 px-2.5 py-0.5 text-[0.72rem] font-medium text-muted">
                          Ambar
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center justify-end gap-1.5 pr-3">
                    <span className="sr-only">{m ? "✓ Terdaftar" : "Ambar"}</span>
                    <Button
                      variant="ghost"
                      disabled={saving || regSaving}
                      onClick={() => openRegEdit(i, r)}
                      ariaLabel={`Ubah data Form Pendaftaran untuk ${nama}`}
                      className="shrink-0 px-2.5 py-1 text-[0.82rem] font-semibold"
                    >
                      ✏️ Form
                    </Button>
                    {m ? (
                      <Button
                        variant="ghost"
                        disabled={saving}
                        onClick={() => openEdit(i, m)}
                        ariaLabel={`Ubah data WA Admin untuk ${nama}`}
                        className="shrink-0 px-2.5 py-1 text-[0.82rem] font-semibold"
                      >
                        ✏️ Ubah
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleRow(i)}
                      disabled={saving}
                      aria-expanded={open}
                      aria-controls={open ? `recent-detail-${i}` : undefined}
                      aria-label={open ? `Tutup detail baris ${i + 1} · ${nama}` : `Buka detail baris ${i + 1} · ${nama}`}
                      className="shrink-0 text-[0.72rem] text-muted"
                    >
                      <span aria-hidden>{open ? "▾" : "▸"}</span>
                    </button>
                  </div>
                </div>
                {open ? (
                  <div id={`recent-detail-${i}`} role="region" aria-label={`Detail baris ${i + 1} · ${nama}`} className="mt-1.5 space-y-3">
                    {editingIndex === i && m ? (
                      <div className="rounded-[14px] border border-brand/30 bg-white/70 px-4 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-3">
                          <h5 className="text-[0.9rem] font-extrabold text-ink">✏️ Ubah Data WA Admin</h5>
                          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.78rem] font-bold text-brand-hover">
                            Baris #{editingRowIndex + 1} · WA ADMIN REPORT
                          </span>
                        </div>
                        <p id={`recent-edit-hint-${i}`} className="text-[0.8rem] text-muted">
                          Ubah nilai yang ingin diubah. Nilai yang tidak diubah tidak akan dikirim. Menyimpan menulis per-kolom ke WA Admin.
                        </p>
                        <form noValidate onSubmit={handleSave} aria-describedby={`recent-edit-hint-${i}`}>
                          <div className="mt-3 grid grid-cols-2 items-end gap-x-4 gap-y-3 md:grid-cols-3">
                            <InlineTextField id={`edit-nama-${i}`} label="Nama" value={editValues?.nama ?? ""} onInput={setField("nama")} error={errors.nama} />
                            <InlineTextField id={`edit-nohp-${i}`} label="No Hp" value={editValues?.noHp ?? ""} onInput={setField("noHp")} error={errors.noHp} />
                            <InlineSelectField id={`edit-pic-${i}`} label="PIC" value={editValues?.pic ?? ""} onSelect={setField("pic")} options={picOptions} error={errors.pic} />
                            <InlineSelectField id={`edit-sumber-${i}`} label="Sumber" value={editValues?.sumber ?? ""} onSelect={setField("sumber")} options={sumberOptions} error={errors.sumber} />
                            <InlineSelectField id={`edit-kategori-${i}`} label="Kategori" value={editValues?.kategori ?? ""} onSelect={setField("kategori")} options={kategoriOptions} error={errors.kategori} />
                            <InlineSelectField id={`edit-status-${i}`} label="Status" value={editValues?.status ?? ""} onSelect={setField("status")} options={statusOptions} error={errors.status} />
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-3">
                            <Button variant="ghost" type="button" disabled={saving} onClick={closeEdit}>Batal</Button>
                            <Button variant="primary" type="submit" disabled={saving}>
                              {saving ? "Menyimpan…" : "Simpan Perubahan"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    ) : null}
                    {regEditingIndex === i ? (
                      <div className="rounded-[14px] border border-brand/30 bg-white/70 px-4 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-3">
                          <h5 className="text-[0.9rem] font-extrabold text-ink">✏️ Ubah Data Form Pendaftaran</h5>
                          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.78rem] font-bold text-brand-hover">
                            Baris #{regRowIndexVal + 1} · Form Responses 1
                          </span>
                        </div>
                        <p id={`recent-reg-hint-${i}`} className="text-[0.8rem] text-muted">
                          Satu kolom berubah = satu PATCH ke spreadsheet Form Pendaftaran (registration). Kolom lain tidak akan disentuh.
                        </p>
                        <form noValidate onSubmit={(e) => handleRegSave(r, e)} aria-describedby={`recent-reg-hint-${i}`}>
                          <div className="mt-3 grid grid-cols-2 items-end gap-x-4 gap-y-3 md:grid-cols-3">
                            <InlineTextField id={`reg-nama-${i}`} label="Nama Lengkap" value={regValues?.nama ?? ""} onInput={setRegField("nama")} error={regErrors.nama} />
                            <InlineTextField id={`reg-wa-${i}`} label="Nomor WhatsApp" value={regValues?.whatsapp ?? ""} onInput={setRegField("whatsapp")} error={regErrors.whatsapp} />
                            <InlineSelectField id={`reg-source-${i}`} label="Mengetahui dari" value={regValues?.source ?? ""} onSelect={setRegField("source")} options={regEditOptions(recent, "source")} />
                            <InlineSelectField id={`reg-pic-${i}`} label="PIC" value={regValues?.pic ?? ""} onSelect={setRegField("pic")} options={regEditOptions(recent, "pic")} />
                            <InlineSelectField id={`reg-penjadwalan-${i}`} label="Penjadwalan Interview" value={regValues?.penjadwalan ?? ""} onSelect={setRegField("penjadwalan")} options={regEditOptions(recent, "penjadwalan")} />
                            <InlineSelectField id={`reg-interview-${i}`} label="Interview" value={regValues?.interview ?? ""} onSelect={setRegField("interview")} options={regEditOptions(recent, "interview")} />
                            <InlineSelectField id={`reg-hasil-${i}`} label="Hasil Interview" value={regValues?.hasil ?? ""} onSelect={setRegField("hasil")} options={regEditOptions(recent, "hasil")} />
                            <InlineSelectField id={`reg-juknis-${i}`} label="Pengiriman Juknis" value={regValues?.juknis ?? ""} onSelect={setRegField("juknis")} options={regEditOptions(recent, "juknis")} />
                            <InlineSelectField id={`reg-pembayaran-${i}`} label="Pembayaran" value={regValues?.pembayaran ?? ""} onSelect={setRegField("pembayaran")} options={regEditOptions(recent, "pembayaran")} />
                            <InlineSelectField id={`reg-grup-${i}`} label="Invite Grup" value={regValues?.grup ?? ""} onSelect={setRegField("grup")} options={regEditOptions(recent, "grup")} />
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-3">
                            <Button variant="ghost" type="button" disabled={regSaving} onClick={closeRegEdit}>Batal</Button>
                            <Button variant="primary" type="submit" disabled={regSaving}>
                              {regSaving ? "Menyimpan…" : "Simpan ke Form Pendaftaran"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[12px] border border-divider bg-white/60 px-3 py-2.5 md:grid-cols-3">
                      {m ? (
                        <span
                          className="col-span-2 rounded-full px-2.5 py-0.5 text-[0.78rem] font-bold"
                          style={{ backgroundColor: "rgba(34,160,107,0.12)", color: PALETTE.success }}
                        >
                          ✓ Terdaftar: {m.stageLabel}
                        </span>
                      ) : (
                        <span className="col-span-2 rounded-full border border-muted/40 px-2.5 py-0.5 text-[0.72rem] font-medium text-muted">
                          Ambar · belum cocok di WA Admin
                        </span>
                      )}
                      {detailGroups(r).map((g) => (
                        <div key={g.group} className="rounded-[10px] border border-divider bg-white/40 p-2">
                          <p className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.04em] text-muted">{g.group}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3 md:gap-x-6">
                            {g.fields.map(([label, val], j) => (
                              <div key={j} className="min-w-0">
                                <p className="text-[0.68rem] uppercase text-muted">{label}</p>
                                <p className="truncate text-[0.82rem] font-semibold text-ink" title={String(val ?? "")}>{cellOrDash(val)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[80] flex items-center gap-2 rounded-[14px] border px-4 py-3 text-[0.86rem] font-semibold shadow-[var(--dm-shadow-lift)]"
          style={
            toast.kind === "success"
              ? { backgroundColor: "rgba(34,160,107,0.12)", borderColor: PALETTE.success, color: PALETTE.success }
              : { backgroundColor: "rgba(214,69,80,0.12)", borderColor: PALETTE.danger, color: PALETTE.danger }
          }
        >
          <span aria-hidden>{toast.kind === "success" ? "✓" : "❌"}</span>
          {toast.msg}
        </div>
      ) : null}

      {expanded ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tabel Pendaftar Terbaru — Tampilan penuh"
          data-hermes-no-print
          onKeyDown={(e) => {
            if (e.key === "Escape") setExpanded(false);
          }}
          className="z-[70]"
        >
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setExpanded(false)} aria-hidden />
          <div className="fixed inset-x-3 inset-y-3 z-10 flex flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--dm-shadow)] sm:inset-x-6 sm:inset-y-6">
            <div className="flex flex-wrap items-center gap-3 border-b border-divider px-5 py-3.5">
              <h3 className="text-[1.15rem] font-extrabold tracking-[-0.01em] text-ink">Pendaftar Terbaru</h3>
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.8rem] font-bold text-brand-hover">{recent.length}</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="secondary" onClick={() => setExpanded(false)} className="shrink-0">⟵ Kembali</Button>
                <Button variant="ghost" onClick={() => setExpanded(false)} ariaLabel="Tutup tampilan penuh">✕</Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-3">
              {recent.length ? (
                <div className="overflow-x-auto rounded-[14px] border border-divider">
                  <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,3rem)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] gap-4 border-b border-divider bg-white/90 px-4 py-2 text-[0.74rem] font-bold uppercase tracking-[0.02em] text-muted backdrop-blur-[8px]">
                    <span>No</span>
                    <span>Tanggal Masuk</span>
                    <span>Nama</span>
                    <span>WhatsApp</span>
                    <span>Source</span>
                    <span>Interview</span>
                    <span>Hasil</span>
                    <span>Pembayaran</span>
                    <span>Status</span>
                    <span aria-hidden>▾</span>
                  </div>
                  {recent.map((r, i) => {
                    const m = matches.get(r);
                    const nama = cellOrDash(r["Nama Lengkap"]);
                    const wa = cellOrDash(r["Nomor Whatsapp"] || r["Nomor Handphone"] || "");
                    return (
                      <div key={i} className="grid grid-cols-[minmax(0,3rem)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-divider px-4 py-2 text-[0.86rem] transition-colors hover:bg-brand/5">
                        <span className="text-right text-[0.78rem] font-semibold text-muted">{i + 1}</span>
                        <span className="whitespace-nowrap text-muted" title={String(r["Timestamp"] ?? "")}>{tsDisplay(r["Timestamp"])}</span>
                        <span className="min-w-0 truncate font-semibold text-ink" title={String(r["Nama Lengkap"] ?? "")}>{nama}</span>
                        <span className="min-w-0 truncate text-muted" title={String(r["Nomor Whatsapp"] ?? "")}>{wa}</span>
                        <span className="min-w-0 truncate text-muted" title={String(r["MENGETAHUI DUTA PERSADA DARI"] ?? "")}>{cellOrDash(r["MENGETAHUI DUTA PERSADA DARI"])}</span>
                        <span className="whitespace-nowrap text-ink">{cellOrDash(r["Interview"])}</span>
                        <span className="whitespace-nowrap text-ink">{cellOrDash(r["Hasil Interview\n(Diterima/Tidak)"])}</span>
                        <span className="whitespace-nowrap text-ink">{cellOrDash(r["Pembayaran"])}</span>
                        <span aria-hidden>
                          {m ? (
                            <span className="rounded-full px-2.5 py-0.5 text-[0.78rem] font-bold" style={{ backgroundColor: "rgba(34,160,107,0.12)", color: PALETTE.success }}>✓ Terdaftar</span>
                          ) : (
                            <span title="Belum cocok di WA Admin. Nama akan dicocokkan otomatis." className="rounded-full border border-muted/40 px-2.5 py-0.5 text-[0.78rem] font-semibold text-muted">Ambar</span>
                          )}
                        </span>
                        <span aria-hidden className="text-muted">▾</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="Belum ada pendaftar pada tahun ini." hint="Pilih tahun lain atau Semua Tahun." />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------------------
 * BAND 5 — Analisis Per PIC (table + pure-SVG grouped bar chart).
 * ------------------------------------------------------------------------ */
function PicTable({ stats }: { stats: PicStat[] }) {
  if (stats.length === 0) {
    return (
      <section className="rounded-[18px] border border-border bg-surface p-2 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]">
        <div className="h-[400px]">
          <EmptyState title="Belum ada data per PIC." hint="Belum ada nama ditugaskan ke PIC dalam WA ADMIN REPORT." icon="👥" />
        </div>
      </section>
    );
  }
  const rowCls = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-4";
  return (
    <section className="rounded-[18px] border border-border bg-surface p-2 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]">
      <div className="max-h-[420px] overflow-y-auto rounded-[14px] border border-divider">
        <div className={`${rowCls} sticky top-0 z-10 border-b border-divider bg-white/90 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-[0.02em] text-muted backdrop-blur-[8px]`}>
          <span>PIC</span>
          <span>Total Nama Ditugaskan</span>
          <span>Sudah Bayar</span>
          <span>Belum Bayar</span>
          <span>% Pembayaran</span>
        </div>
        {stats.map((s) => {
          const good = s.pct >= 50;
          const barColor = good ? PALETTE.success : PALETTE.warning;
          return (
            <div key={s.pic} className={`${rowCls} px-3 py-2.5 text-[0.84rem] transition-colors hover:bg-brand/5`}>
              <span className="min-w-0 truncate font-semibold text-ink" title={s.pic}>{s.pic}</span>
              <span className="font-bold text-ink">{formatCount(s.total)}</span>
              <span className="font-semibold text-success">{formatCount(s.sudah)}</span>
              <span className={s.belum === 0 ? "font-semibold text-muted" : "font-semibold text-warning"}>{formatCount(s.belum)}</span>
              <span className="min-w-[120px]">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-[72px] overflow-hidden rounded-full" style={{ backgroundColor: PALETTE.grid }}>
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="w-12 text-right text-[0.84rem] font-extrabold" style={{ color: barColor }}>
                    {formatPercent(s.pct / 100, true)}
                  </span>
                </div>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PicChart({ stats }: { stats: PicStat[] }) {
  const W = 680;
  const n = stats.length;
  const H = n === 0 ? 48 : 48 + n * 56;
  const max = n ? Math.max(...stats.map((s) => s.total)) : 1;
  const band = W - 296;
  return (
    <ChartContainer data={stats} heightClass="h-[420px]" label="Pembayaran per PIC">
      <div className="h-full overflow-y-auto pr-1">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart: pembayaran per PIC (sudah vs belum)" className="h-auto w-full">
          <g fontSize="11" fill={PALETTE.muted}>
            <rect x={132} y={14} width={10} height={10} rx={2} fill={PALETTE.success} />
            <text x={146} y={22}>Sudah Bayar</text>
            <rect x={250} y={14} width={10} height={10} rx={2} fill={PALETTE.warning} />
            <text x={264} y={22}>Belum Bayar</text>
            <rect x={360} y={14} width={10} height={10} rx={2} fill={PALETTE.catBlue} opacity={0.5} />
            <text x={374} y={22}>Total Nama Ditugaskan</text>
          </g>
          {stats.map((s, i) => {
            const y = 44 + i * 56;
            const g = s.pct >= 50;
            const totalW = (s.total / max) * band;
            const sudahW = (s.sudah / max) * band;
            const belumW = (s.belum / max) * band;
            return (
              <g key={s.pic}>
                <text x={6} y={y + 8} fontSize={12} fontWeight={700} fill={PALETTE.muted}>{s.pic}</text>
                <rect x={132} y={y} width={totalW} height={6} rx={3} fill={PALETTE.catBlue} opacity={0.5} />
                <rect x={132} y={y - 6} width={sudahW} height={5} rx={2.5} fill={PALETTE.success} />
                <rect x={132} y={y + 7} width={belumW} height={5} rx={2.5} fill={PALETTE.warning} />
                <text x={664} textAnchor="end" y={y + 8} fontSize={14} fontWeight={800}
                  fill={g ? PALETTE.success : PALETTE.warning}>
                  {formatPercent(s.pct / 100, true)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartContainer>
  );
}

export function WaAdminDashboard({
  rows,
  registrationRows = [],
  initialAnalisisOpen = false,
  onRefresh,
}: WaAdminDashboardProps) {
  // --- WA admin state (preserved, folded in Band 4) -----------------------
  const [selMonth, setSelMonth] = useState<string>(allMonthsLabel);
  const stats = useMemo(
    () => deriveWaAdminStats(rows, new Date(), selMonth === allMonthsLabel ? undefined : selMonth),
    [rows, selMonth],
  );
  const [selStatus, setSelStatus] = useState<string>(allStatusesLabel);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [analisisOpen, setAnalisisOpen] = useState(initialAnalisisOpen);

  const detailRows = useMemo(() => {
    if (selStatus === allStatusesLabel || !stats.statusCol) return stats.rows;
    return stats.rows.filter(
      (r) => String(r[stats.statusCol!]).trim() === selStatus,
    );
  }, [stats, selStatus]);

  const handleExport = () => {
    const blob = new Blob([toCsv(stats.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    window.print();
  };

  // --- Monthly WA Admin Report (P4) ---------------------------------------
  const [selPeriod, setSelPeriod] = useState<string>("CURRENT");
  const [customMonth, setCustomMonth] = useState<string>("");
  const effPeriod = customMonth.trim() === "" ? selPeriod : customMonth.trim();
  const monthlyReport = useMemo<MonthlyReport>(
    () =>
      buildMonthlyReport({
        waRows: rows,
        registrationRows,
        period: effPeriod,
        now: new Date(),
      }),
    [rows, registrationRows, effPeriod],
  );
  const periodOptions = useMemo(
    () => reportPeriodOptions(new Date(), 6),
    [],
  );

  const activeMonthLabel =
    selMonth === allMonthsLabel
      ? "Semua Bulan"
      : stats.months.find((m) => m.period === selMonth)?.label ?? selMonth;

  // --- Registration command center state (Bands 0–3) ----------------------
  const regStats = useMemo(
    () => deriveRegistrationStats(registrationRows, null, rows), // year filled below
    [registrationRows, rows],
  );
  // Selected year filter lives here; effective year = selection or latest.
  const [selYear, setSelYear] = useState<string>("");
  const latestYear = regStats.years.length ? String(regStats.years[0]) : "";
  const effectiveYearRaw = selYear === "" ? latestYear : selYear;
  const effectiveYear = effectiveYearRaw === allYearsLabel || effectiveYearRaw === "" ? null : Number(effectiveYearRaw);
  const reg = useMemo(
    () => deriveRegistrationStats(registrationRows, effectiveYear, rows),
    [registrationRows, effectiveYear, rows],
  );

  const yearOptions = regStats.years.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .print-only-report, .print-only-report * { visibility: visible !important; }
          .print-only-report { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: none !important; }
          .print-only-report { padding: 0 !important; }
        }
      `}</style>
      {/* BAND — width: keeper decision (owner default P1-10 option a): the 1720/1700 wide
          band is the deliberate command-center-only grid (NOT aligned to 1240). Kept here
          with its `min-w-0` / `minmax(0,...)` overflow guards intact; nav + transient branches
          render in the SAME 1720 band so there is no width jump on load/refresh. */}
      <div className="mx-auto w-full min-w-0 max-w-[1720px] px-4 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-[1700px]">

      {/* BAND 0 — Page header + Refresh + Year Filter */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 pt-8">
        <div className="min-w-0">
          <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
          <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
            WhatsApp Admin
          </h1>
          <p className="mt-1 text-[0.92rem] text-muted">
            WhatsApp Admin + Registrasi Pendaftar — funnel, perlu perhatian, sumber, dan pendaftar terbaru.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WaAdminDataForm rows={rows} onRefresh={onRefresh} />
          <WaAdminEditData rows={rows} onRefresh={onRefresh} />
          <Button variant="secondary" onClick={onRefresh} className="shrink-0">
            🔄 Refresh Data
          </Button>
        </div>
      </header>

      <section className="mb-8 flex flex-wrap items-end gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
        <div className="min-w-52">
          <Select
            label="Filter Tahun"
            value={effectiveYearRaw === "" ? allYearsLabel : effectiveYearRaw}
            options={[{ value: allYearsLabel, label: "Semua Tahun" }, ...yearOptions]}
            onSelect={(v) => setSelYear(v)}
          />
        </div>
        <p className="ml-auto max-w-xs text-[0.82rem] leading-snug text-muted">
          {effectiveYear === null
            ? "Menampilkan data pendaftaran semua tahun."
            : `Menampilkan data pendaftaran tahun ${effectiveYear}.`}
        </p>
      </section>

      {/* BAND 1 — KPI Pendaftaran (6 cards) */}
      <SectionHeader title="Ringkasan Pendaftaran" subtitle="Total pendaftar dan progres tiap tahap pada tahun terpilih." />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon="👥" label="Total Pendaftar" value={String(reg.funnel.find((f) => f.key === "pendaftar")?.count ?? 0)} />
        <MetricCard icon="🎫" label="Interview" value={String(reg.funnel.find((f) => f.key === "interview")?.count ?? 0)} />
        <MetricCard icon="✅" label="Diterima" value={String(reg.funnel.find((f) => f.key === "diterima")?.count ?? 0)} />
        <MetricCard icon="📘" label="Juknis" value={String(reg.funnel.find((f) => f.key === "juknis")?.count ?? 0)} />
        <MetricCard icon="💳" label="Pembayaran" value={String(reg.funnel.find((f) => f.key === "payment")?.count ?? 0)} />
        <MetricCard icon="👥" label="Grup" value={String(reg.funnel.find((f) => f.key === "grup")?.count ?? 0)} />
      </div>

      <Divider />

      {/* BAND 2 — Funnel + Needs Attention */}
      <SectionHeader title="Ringkasan Pendaftaran" subtitle="Alur pendaftaran dan hal yang perlu tindakan admin." />
      {reg.rows.length === 0 ? (
        <EmptyState title="Tidak ada data pendaftaran untuk tahun ini." hint="Pilih tahun lain atau Semua Tahun." icon="🗂️" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
          <FunnelPanel funnel={reg.funnel} />
          <NeedsAttention needs={reg.needs} total={reg.needsTotal} matches={reg.matches} />
        </div>
      )}

      <Divider />

      {/* BAND 3 — Pendaftar Terbaru (full-width, expandable, inline edit) */}
      {reg.rows.length === 0 ? null : (
        <div className="mb-8 grid grid-cols-1 gap-6">
          <RecentTable recent={reg.recent} matches={reg.matches} rows={rows} onRefresh={onRefresh} />
        </div>
      )}

      <Divider />

      {/* BAND 4 — Sumber Pendaftaran (full-width, moved below Terbaru) */}
      {reg.rows.length === 0 ? null : (
        <div className="mb-8 grid grid-cols-1 gap-6">
          <div className="relative">
            {reg.sources.length ? (
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-2 z-10 rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.78rem] font-bold text-brand-hover"
              >
                {reg.sources.length}
              </span>
            ) : null}
            <SourcePanel sources={reg.sources} />
          </div>
        </div>
      )}

      <Divider />

      {/* BAND 5 — Analisis Per PIC (new full-width band) */}
      <SectionHeader
        title="Analisis Per PIC"
        subtitle="Perbandingan pembayaran per PIC — nama ditugaskan, sudah bayar, belum bayar, dan persentase pembayaran."
      />
      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <PicTable stats={reg.pics} />
        <PicChart stats={reg.pics} />
      </div>

      <Divider />

      {/* BAND 6 — Analisis WhatsApp Admin (folded, no regression) */}
      <section className="mb-8 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
        <button
          type="button"
          onClick={() => setAnalisisOpen(!analisisOpen)}
          aria-expanded={analisisOpen}
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-brand/5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="text-[1.1rem]">📊</span>
            <span className="text-[1.02rem] font-extrabold tracking-[-0.01em] text-ink">Analisis WhatsApp Admin</span>
          </span>
          <span aria-hidden className="shrink-0 text-[0.82rem] text-muted">{analisisOpen ? "▾" : "▸"}</span>
        </button>

        {analisisOpen ? (
          <div className="mt-4 space-y-8">
            {/* Post-junk empty state (V3 stops here — no leads at all) */}
            {stats.total === 0 && stats.closing === 0 ? (
              <EmptyState title={stats.closing > 0 ? "Tidak ada data funnel untuk bulan ini." : "Semua data berisi kategori yang dikecualikan."} hint="Hapus filter bulan atau isi Mekari Tag / Kategori untuk melihat leads." />
            ) : (
              <>
                {/* Filter Bulanan (D1/D7) */}
                <section className="mb-8 flex flex-wrap items-end gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
                  <div className="min-w-52">
                    <Select
                      label="Filter Bulan"
                      value={selMonth}
                      options={[
                        { value: allMonthsLabel, label: allMonthsLabel },
                        ...stats.months.map((m) => ({ value: m.period, label: m.label })),
                      ]}
                      onSelect={(v) => setSelMonth(v)}
                    />
                  </div>
                  {selMonth !== allMonthsLabel ? (
                    <Button variant="ghost" onClick={() => setSelMonth(allMonthsLabel)} className="shrink-0">
                      ✕ Reset
                    </Button>
                  ) : null}
                  <p className="ml-auto max-w-xs text-[0.82rem] leading-snug text-muted">
                    Filter berdasarkan tanggal masuk ({selMonth === allMonthsLabel ? "menampilkan semua bulan" : `menampilkan ${stats.months.find((m) => m.period === selMonth)?.label ?? selMonth}`}).
                  </p>
                </section>

                {/* 1. Metrik Kunci */}
                <SectionHeader title="Metrik Kunci" subtitle="Funnel leads menuju closing." />
                <MetricRow>
                  <MetricCard icon="👥" label="Total Pesan" value={String(stats.total)} />
                  <MetricCard icon="✅" label="Closing" value={String(stats.closing)} />
                  <MetricCard icon="📈" label="Conversion" value={stats.conversionLabel} />
                  <MetricCard icon="🎯" label="Closing / Target" value={stats.closingTargetLabel} />
                </MetricRow>

                <Divider />

                {/* 2. Visualisasi */}
                <SectionHeader title="Visualisasi" subtitle="Tren leads, distribusi status, dan sebaran per dimensi." />
                <div className="flex flex-col gap-8">
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <ChartContainer data={stats.trend} heightClass="h-72" label="Tren leads masuk per bulan">
                      {stats.trend.length ? <TrendLine trend={stats.trend} /> : null}
                    </ChartContainer>
                    <ChartContainer data={stats.statusDist} heightClass="h-[300px]" label="Distribusi Status">
                      {stats.statusDist.length ? <StatusDistribution dist={stats.statusDist} /> : null}
                    </ChartContainer>
                  </div>

                  <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <ChartContainer data={stats.picDist} heightClass="h-64" label="Pesan Total Per PIC">
                      {stats.picDist.length ? <DistBars dist={stats.picDist} color={PALETTE.brand} /> : null}
                    </ChartContainer>
                    <ChartContainer data={stats.mekariDist} heightClass="h-64" label="Mekari Tag">
                      {stats.mekariDist.length ? <MekariTagList dist={stats.mekariDist} /> : null}
                    </ChartContainer>
                  </div>

                  <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <ChartContainer data={stats.kategoriDist} heightClass="h-64" label="Pembagian Intensi Pesan (Kategori)">
                      {stats.kategoriDist.length ? <DistBars dist={stats.kategoriDist} color={PALETTE.success} labelWidth="w-32" /> : null}
                    </ChartContainer>
                    {stats.sources.col && stats.sources.sources.length > 0 ? (
                      <ChartContainer data={stats.sources.sources} heightClass="h-64" label="Asal Prospek">
                        <DistBars dist={stats.sources.sources} color={PALETTE.pink} labelWidth="w-32" />
                      </ChartContainer>
                    ) : (
                      <div />
                    )}
                  </div>

                  <ChartContainer data={stats.asalItems} heightClass="h-72" label="Tag Asal (Treemap — sebaran lead per asal, ukuran blok = jumlah lead)">
                    {stats.asalItems.length ? <TagAsalTreemap items={stats.asalItems} /> : null}
                  </ChartContainer>
                </div>

                {/* 3. Tabel Operasional */}
                <Divider />
                <SectionHeader title="Tabel Operasional" subtitle="Lead per tahap funnel: CLOSING, SALES PROGRESS, PENDING FORM - L1, dan FUTURE PROSPECT." />
                <div className="grid gap-6 xl:grid-cols-2">
                  <OperationalTable title="CLOSING" icon="✅" color={PALETTE.success} rows={stats.closingRows} columns={stats.operationalCols} emptyHint="Belum ada lead berstatus Closing." />
                  <OperationalTable title="SALES PROGRESS" icon="📈" color={PALETTE.brand} rows={stats.salesProgress} columns={stats.operationalCols} emptyHint="Belum ada lead berstatus Sales Progress." />
                  <OperationalTable title="PENDING FORM - L1" icon="📝" color={PALETTE.warning} rows={stats.pendingForm} columns={stats.operationalCols} emptyHint="Belum ada lead berstatus Pending Registration." />
                  <OperationalTable title="FUTURE PROSPECT" icon="⏳" color={PALETTE.pink} rows={stats.futureProspect} columns={stats.operationalCols} emptyHint="Belum ada lead dengan tag Mekari &quot;Future Prospect&quot;." />
                </div>

                <Divider />

                {/* 4. Detail Status */}
                <SectionHeader title="Detail Status" subtitle="Pilih status untuk melihat leads." />
                {stats.statusCol ? (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-4">
                      <Select
                        label="Filter Status"
                        value={selStatus}
                        options={[{ value: allStatusesLabel, label: allStatusesLabel }, ...stats.options.map((o) => ({ value: o, label: o }))]}
                        onSelect={(v) => setSelStatus(v)}
                      />
                      <div className="ml-auto rounded-[14px] border border-border bg-surface px-4 py-2 shadow-[var(--dm-shadow-xs)]">
                        <span className="text-[0.82rem] font-semibold text-muted">Jumlah </span>
                        <span className="text-[1.1rem] font-extrabold text-ink">{detailRows.length}</span>
                      </div>
                      <Button
                        variant={tableExpanded ? "secondary" : "ghost"}
                        onClick={() => setTableExpanded(!tableExpanded)}
                        className="shrink-0"
                      >
                        {tableExpanded ? "⤡ Tutup" : "⤢ Tampilkan Semua"}
                      </Button>
                    </div>
                    {detailRows.length ? (
                      <DataTable
                        rows={detailRows}
                        columns={stats.detailCols}
                        maxHeightClass={tableExpanded ? "max-h-[70vh]" : "max-h-[360px]"}
                        emptyTitle="Tidak ada data untuk status ini."
                      />
                    ) : (
                      <EmptyState title="Tidak ada data untuk status ini." hint="Pilih status lain." icon="🧾" />
                    )}
                  </>
                ) : (
                  <EmptyState title="Tidak ada data untuk status ini." hint="Kolom status tidak ditemukan." icon="🧾" />
                )}

                <Divider />

                {/* 5. Ekspor */}
                <SectionHeader title="Ekspor" subtitle="Unduh CSV, pilih periode, lalu cetak Laporan Bulanan (PDF) untuk atasan." />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-64">
                    <Select
                      label="Periode Laporan Bulanan"
                      value={selPeriod}
                      options={periodOptions}
                      onSelect={(v) => setSelPeriod(v)}
                    />
                  </div>
                  <div className="min-w-48">
                    <label htmlFor="wa-report-custom-month" className="mb-1 block text-[0.68rem] font-bold uppercase tracking-[0.04em] text-muted">
                      Atau pilih bulan lain
                    </label>
                    <input
                      id="wa-report-custom-month"
                      type="month"
                      value={customMonth}
                      onChange={(e) => setCustomMonth(e.target.value)}
                      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[0.84rem] text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary" onClick={handleExport}>
                      ⬇️ Unduh Data (CSV)
                    </Button>
                    <Button variant="secondary" onClick={handleExportPdf}>
                      🖨️ Cetak Laporan Bulanan (PDF)
                    </Button>
                  </div>
                </div>

                <div className="mt-6 print-only-report">
                  <QuickReport stats={stats} monthLabel={activeMonthLabel} />
                </div>

                <div className="mt-6 print-only-report">
                  <WaMonthlyReport report={monthlyReport} />
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      </main>
      </div>
    </>
  );
}