/**
 * InsightDashboard — presentational body of the Social Media Insight page (/insight).
 *
 * READ-ONLY analytics: given normalized rows from GET /api/tables/insight, renders
 * filters, KPI metrics, performance summary, funnel, platform comparison, trend,
 * collapsible period summaries, and the raw detail table. All business math lives
 * in @/workspaces/insight (buildInsightModel + granular helpers); this file only
 * shapes data for display. Charts are hand-rolled dependency-free SVG.
 *
 * REVISI 2026-09 (NEO spec): visual parity with /wa-admin (single 1220-1240px
 * band, page header w/ Refresh top-right, filter card), plus compactness — the
 * three period tables + raw detail table are collapsed by default. "0 ≠
 * unavailable" (metricAvailable) drives N/A vs genuine 0 in KPIs and the platform
 * comparison. A Performance Summary (derived rates) sits before the funnel (see
 * insight.ts availability rule comment). UI copy is Indonesian.
 */
"use client";
import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Row } from "@/server/adapter/source";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { PALETTE, formatCount, formatPercent } from "@/components/ui-common";
import {
  INSIGHT_METRIC_COLS,
  INSIGHT_METRIC_LABELS,
  METRIC_FIELD_BY_COL,
  PLATFORMS,
  buildInsightModel,
  funnelConversionRate,
  metricAvailable,
  multiTrend,
  toNum,
  type FunnelStage,
  type Granularity,
  type InsightMetric,
  type PlatformKey,
  type PlatformName,
  type QualityIssue,
} from "@/workspaces/insight";
import { InsightUploadCard } from "@/workspaces/InsightUploadCard";

export interface InsightDashboardProps {
  rows: Row[];
  onRefresh?: () => void;
}

const KPI_ITEMS: { icon: string; label: string; col: InsightMetric }[] = [
  { icon: "👁️", label: "Views", col: "VIEW" },
  { icon: "📶", label: "Reach", col: "REACH" },
  { icon: "💬", label: "Interaksi", col: "CONTENT INTERACTION" },
  { icon: "👤", label: "Profile Visit", col: "PROFILE VISIT" },
  { icon: "🔗", label: "Link Click", col: "LINK CLICKS" },
  { icon: "👥", label: "Net Follower", col: "FOLLOWER" },
];

/** Platform identity hues (NEO §6.4) — documented brand-decorative (Instagram pink /
    TikTok black are the platforms' own identity colors, kept outside the cat* pastel
    family on purpose so the comparison keeps its primary visual distinction). */
const PLATFORM_COLORS: Record<PlatformName, string> = {
  Instagram: "#E1306C",
  TikTok: "#010101",
};

/** Collapsible titles for the three period groups (NEO brief: four siblings). */
const PERIOD_TITLE: Record<Granularity, string> = {
  daily: "Ringkasan Per Hari",
  weekly: "Ringkasan Per Minggu",
  monthly: "Ringkasan Per Bulan",
};

/** Derived-rate cell: null denom -> "N/A" (never a fake percentage). */
function rateStr(v: number | null | undefined): string {
  return v === null || v === undefined ? "N/A" : `${v.toFixed(1)}%`;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/* ---------------------------------------------------------------------------
 * Local private components (NEW — kept inside this file)
 * ------------------------------------------------------------------------ */

/** Slim warning strip + expandable issue list (NEO §5.2). Collapsed by default. */
function DataQualityStrip({ count, issues }: { count: number; issues: QualityIssue[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div role="alert" className="mt-5 rounded-[12px] border border-warning/30 bg-warning/10 px-3 py-2 text-[0.84rem] text-ink">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="font-bold text-warning">⚠ Data Quality Issues: {count}</span>
        <span className="text-muted" aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && issues.length ? (
        <ul id={listId} className="mt-2 space-y-1">
          {issues.map((iss, i) => (
            <li key={iss.kind + i} className="text-[0.84rem] text-muted">• {iss.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Generic ▸/▾ accordion wrapper (NEO §6.6). Collapsed by default. */
function CollapsibleSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-[var(--dm-shadow-xs)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-[0.92rem] font-extrabold text-ink">
          <span className="mr-2 inline-block w-4 text-muted" aria-hidden>{open ? "▾" : "▸"}</span>
          {title}
        </span>
        {trailing ? <span className="shrink-0 text-[0.8rem] font-semibold text-muted">{trailing}</span> : null}
      </button>
      {open ? (
        <div id={bodyId} className="border-t border-divider p-3">{children}</div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Funnel (Reach -> Interaksi -> Profil -> Klik) — dependency-free SVG
 * with inter-stage conversion % (NEO §6.3)
 * ------------------------------------------------------------------------ */

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const W = 560;
  const H = stages.length * 56 + 12;
  const rowH = 34;
  const max = stages[0]?.value || 1;
  const bandX = 138;
  const bandW = W - bandX - 66; // label(138) + right value margin
  // Categorical funnel — distinct multi-hue (brand on the primary/largest stage).
  const colors = [PALETTE.brand, PALETTE.catTeal, PALETTE.catGreen, PALETTE.catOrange];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sosial media funnel" className="h-full w-full">
      {stages.map((s, i) => {
        const y = i * 56 + 8;
        const w = Math.max((s.value / max) * bandW, 26);
        const x = bandX + (bandW - w) / 2;
        const conv = i > 0 ? funnelConversionRate(stages[i - 1].value, s.value) : null;
        const convTxt = conv === null ? "N/A" : formatPercent(conv, true);
        return (
          <g key={s.stage}>
            <text x="0" y={y + rowH / 2 + 4} fontSize="13" fontWeight="700" fill={PALETTE.muted}>
              {s.stage}
            </text>
            <rect x={x} y={y} width={w} height={rowH} rx={rowH / 2} fill={colors[i % colors.length]} opacity={0.9} />
            <text x={W - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="13" fontWeight="800" fill={PALETTE.ink}>
              {formatCount(s.value)}
            </text>
            {i > 0 ? (
              <text x="2" y={i * 56 + 53} fontSize="11" fontWeight="700" fill={PALETTE.muted}>
                ↳ {convTxt}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Trend chart (line + optional area fill) — dependency-free SVG,
 * legend row above + native <title> tooltips (NEO §6.5)
 * ------------------------------------------------------------------------ */

interface TrendSeries {
  name: string;
  color: string;
  values: number[];
}

function TrendChart({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  const W = 700;
  const H = 260;
  const padX = 46;
  const padY = 30;
  const allMax = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const stepX = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => H - padY - (v / allMax) * (H - padY * 2);
  const baseY = H - padY;
  const single = series.length === 1;

  const paths = series.map((s) => s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tren performa" className="h-full w-full">
      {/* gridlines */}
      {[0, 1, 2, 3].map((g) => {
        const gy = padY + (g / 3) * (H - padY * 2);
        return <line key={g} x1={padX} x2={W - padX} y1={gy} y2={gy} stroke={PALETTE.grid} strokeWidth="1" />;
      })}
      {series.map((s, si) => (
        <g key={s.name}>
          {single ? (
            <polygon
              points={`${padX},${baseY.toFixed(1)} ${paths[0]} ${(W - padX).toFixed(1)},${baseY.toFixed(1)}`}
              fill={s.color}
              opacity={0.18}
            />
          ) : null}
          <polyline points={paths[si]} fill="none" stroke={s.color} strokeWidth={single ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
          {s.values.map((v, i) => (
            <circle key={`${s.name}-${i}`} cx={x(i)} cy={y(v)} r={single ? 3.5 : 2.6} fill={s.color} stroke="#fff" strokeWidth="1.5">
              <title>{`${s.name}: ${formatCount(v)}`}</title>
            </circle>
          ))}
        </g>
      ))}
      {/* x labels (sample to avoid clutter) */}
      {labels.map((l, i) => {
        const every = Math.max(1, Math.ceil(n / 8));
        if (i % every !== 0 && i !== n - 1) return null;
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={PALETTE.muted}>
            {l}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------ */

export function InsightDashboard({ rows, onRefresh }: InsightDashboardProps) {
  // Filters — plain date strings ('' = full span) + platform.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [platform, setPlatform] = useState<PlatformKey>("all");
  const [trendSel, setTrendSel] = useState<string>("__pair__");

  const model = useMemo(
    () => buildInsightModel(rows, { from, to, platform }),
    [rows, from, to, platform],
  );

  const trendTitle = trendSel === "__pair__" ? "Views + Reach" : INSIGHT_METRIC_LABELS[trendSel as InsightMetric];
  const trendData = useMemo(() => {
    if (trendSel === "__pair__") {
      const t = multiTrend(model.filtered, ["VIEW", "REACH"]);
      return {
        labels: t.labels,
        series: [
          { name: "Views", color: PALETTE.brand, values: t.series[0].values },
          { name: "Reach", color: PALETTE.accentDeep, values: t.series[1].values },
        ],
      };
    }
    const t = multiTrend(model.filtered, [trendSel as InsightMetric]);
    return { labels: t.labels, series: [{ name: trendTitle, color: PALETTE.brand, values: t.series[0].values }] };
  }, [model.filtered, trendSel, trendTitle]);

  const empty = rows.length === 0;

  /** Performance Summary tiles — derived rates only, null base -> "—". */
  const perfTiles: { label: string; value: number | null; hasBase: boolean }[] = [
    { label: "Engagement Rate", value: model.metrics.engagement, hasBase: model.metrics.reach > 0 },
    { label: "Profile Visit Rate", value: model.metrics.profileVisitRate, hasBase: model.metrics.reach > 0 },
    { label: "Link CTR", value: model.metrics.linkCtr, hasBase: model.metrics.reach > 0 },
    { label: "Profile → Click", value: model.metrics.profileToClick, hasBase: model.metrics.profileVisit > 0 },
  ];

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {empty ? (
          <>
            <ModuleHero
              icon="📈"
              title="Social Media Insight"
              desc="Analisis performa kanal sosial (Instagram & TikTok): KPI, funnel, tren waktu, dan perbandingan platform dari Master Data INSIGHT."
            />
            <EmptyState title="Data insight tidak tersedia atau kosong." />
            <Divider />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onRefresh}>🔄 Refresh Data</Button>
            </div>
          </>
        ) : (
          <>
            {/* Page header + primary action (parity with /wa-admin) */}
            <header className="mb-6 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
                  Insight Sosial Media
                </h1>
                <p className="mt-1 text-[0.92rem] text-muted">
                  KPIs, funnel, tren waktu, dan perbandingan platform dari Master Data INSIGHT.
                </p>
              </div>
              <Button variant="secondary" onClick={onRefresh} className="shrink-0">
                🔄 Refresh Data
              </Button>
            </header>

            {/* Filters — wa-admin filter card treatment */}
            <section className="mb-8 flex flex-wrap items-end gap-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
              <div className="min-w-52">
                <label className="mb-1 block text-[0.82rem] font-semibold text-muted" htmlFor="insight-from">Tanggal Awal</label>
                <input
                  id="insight-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink focus:border-brand focus:ring-2 focus:ring-brand focus:ring-offset-2"
                />
              </div>
              <div className="min-w-52">
                <label className="mb-1 block text-[0.82rem] font-semibold text-muted" htmlFor="insight-to">Tanggal Akhir</label>
                <input
                  id="insight-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink focus:border-brand focus:ring-2 focus:ring-brand focus:ring-offset-2"
                />
              </div>
              <div className="min-w-52">
                <Select
                  label="Platform"
                  value={platform}
                  options={[{ value: "all", label: "Semua Platform" }, ...PLATFORMS.map((p) => ({ value: p, label: p }))]}
                  onSelect={(v) => setPlatform(v as PlatformKey)}
                />
              </div>
              <p className="ml-auto max-w-xs flex-1 basis-full text-[0.82rem] leading-snug text-muted sm:basis-0">
                Perbandingan dengan periode sebelumnya pada filter yang sama. Net Follower = total kolom Follower per hari (bisa negatif).
              </p>
            </section>

            {/* Upload Insight — primary write affordance, compact when idle
                (spec §2 placement: first section after the filter card).
                Renders regardless of the active filters (headless). */}
            <InsightUploadCard onRefresh={onRefresh} />

            {/* Data quality indicator — compact + collapsed */}
            {model.quality.count > 0 ? (
              <DataQualityStrip count={model.quality.count} issues={model.quality.issues} />
            ) : null}

            {model.filtered.length === 0 ? (
              <>
                <div className="mt-6">
                  <EmptyState title="Tidak ada data sesuai filter." hint="Perluas rentang tanggal atau platform." />
                </div>
                <Divider />
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={onRefresh}>🔄 Refresh Data</Button>
                </div>
              </>
            ) : (
              <>
                {/* 1. KPI */}
                <SectionHeader title="Metrik Kunci" subtitle="Total kinerja pada periode aktif." />
                <MetricRow>
                  {KPI_ITEMS.map((it) => {
                    const field = METRIC_FIELD_BY_COL[it.col];
                    const delta = model.deltas[it.col];
                    const available = metricAvailable(model.filtered, it.col);
                    return (
                      <MetricCard
                        key={it.col}
                        icon={it.icon}
                        label={it.label}
                        value={available ? formatCount(model.metrics[field]) : "N/A"}
                        delta={model.hasPrevious && delta !== null ? Math.round(delta) : undefined}
                        deltaLabel="vs periode sebelumnya"
                      />
                    );
                  })}
                </MetricRow>

                <Divider />

                {/* 2. Performance Summary — derived rates only, BEFORE funnel */}
                <SectionHeader title="Ringkasan Performa" subtitle="Rasio turunan dari total metrik pada periode aktif." />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {perfTiles.map((t) => (
                    <div key={t.label} className="rounded-[16px] border border-border bg-white/70 p-4">
                      <div className="text-[0.74rem] font-bold uppercase tracking-[0.04em] text-muted">{t.label}</div>
                      <div className="mt-1 text-[1.35rem] font-extrabold text-ink">
                        {t.value === null ? "—" : formatPercent(t.value, t.hasBase)}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[0.74rem] leading-snug text-muted">Denominator nol → ditampilkan —.</p>

                <Divider />

                {/* 3. Funnel */}
                <SectionHeader title="Sosial Media Funnel" subtitle="Reach → Interaksi Konten → Kunjungan Profil → Klik Link." />
                <ChartContainer data={model.funnelStages} heightClass="h-[240px]" label="Funnel dari data INSIGHT (tanpa CRM/Lead)">
                  <FunnelChart stages={model.funnelStages} />
                </ChartContainer>

                <Divider />

                {/* 4. Platform comparison */}
                <SectionHeader title="Perbandingan Platform" subtitle="Instagram vs TikTok (data mentah + rate turunan, tanpa peringkat)." />
                <div className="overflow-x-auto rounded-[16px] border border-border bg-surface p-2 backdrop-blur-[8px] shadow-[var(--dm-shadow)]">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead className="border-b border-divider">
                      <tr>
                        <th className="px-3 py-2 text-left text-[0.8rem] font-semibold uppercase tracking-[0.02em] text-muted">Metrik</th>
                        {PLATFORMS.map((p) => (
                          <th key={p} className="px-3 py-2 text-left text-[0.82rem] font-bold text-ink">
                            <span aria-hidden className="inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                            <span className="ml-1.5 align-middle">{p}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {INSIGHT_METRIC_COLS.map((c) => (
                        <tr key={c} className="border-b border-divider last:border-0">
                          <td className="px-3 py-2 text-sm font-semibold text-ink">{INSIGHT_METRIC_LABELS[c]}</td>
                          {PLATFORMS.map((p) => {
                            const avail = model.platformAvail[p][c];
                            const sum = model.platforms[p][METRIC_FIELD_BY_COL[c]];
                            return (
                              <td key={p} className="px-3 py-2 text-sm text-ink">
                                {avail ? formatCount(sum) : <span className="text-muted">N/A</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {(
                        [
                          ["Engagement Rate", "engagement"],
                          ["Profile Visit Rate", "profileVisitRate"],
                          ["Link CTR", "linkCtr"],
                          ["Profile → Click", "profileToClick"],
                        ] as [string, keyof typeof model.platforms.Instagram][]
                      ).map(([label, key]) => (
                        <tr key={label} className="border-b border-divider last:border-0">
                          <td className="px-3 py-2 text-sm font-semibold text-ink">{label}</td>
                          {PLATFORMS.map((p) => (
                            <td key={p} className="px-3 py-2 text-sm tabular-nums text-ink">
                              {rateStr(model.platforms[p][key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Divider />

                {/* 5. Performance trend */}
                <SectionHeader title="Tren Performa" subtitle="Pilih metrik untuk melihat perubahan seiring waktu." />
                <div className="mb-3 max-w-xs">
                  <Select
                    label="Metrik Tren"
                    value={trendSel}
                    options={[{ value: "__pair__", label: "Views + Reach" }, ...INSIGHT_METRIC_COLS.map((c) => ({ value: c, label: INSIGHT_METRIC_LABELS[c] }))]}
                    onSelect={setTrendSel}
                  />
                </div>
                <ChartContainer data={trendData.labels} heightClass="h-72" label={`Tren harian — ${trendTitle}`}>
                  <div className="flex h-full flex-col">
                    <div className="flex flex-wrap items-center gap-4 pt-1 pb-2">
                      {trendData.series.map((s) => (
                        <span key={s.name} className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink">
                          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      ))}
                    </div>
                    <div className="min-h-0 flex-1">
                      <TrendChart labels={trendData.labels} series={trendData.series} />
                    </div>
                  </div>
                </ChartContainer>

                <Divider />

                {/* 6. Ringkasan Periode — three sibling collapsibles (collapsed) */}
                <div className="flex flex-col gap-3">
                  {model.periodSections.map((sec) => (
                    <CollapsibleSection key={sec.granularity} title={PERIOD_TITLE[sec.granularity]} trailing={`${sec.groups.length} periode`}>
                      <div className="overflow-x-auto rounded-[12px] border border-border bg-white/60 p-2">
                        {sec.groups.length === 0 ? (
                          <p className="px-2 py-4 text-[0.82rem] text-muted">Tidak ada data.</p>
                        ) : (
                          <table className="w-full min-w-[300px] border-collapse text-left">
                            <thead className="border-b border-divider">
                              <tr>
                                <th className="px-2 py-1.5 text-left text-[0.72rem] font-semibold uppercase text-muted">Periode</th>
                                {INSIGHT_METRIC_COLS.map((c) => (
                                  <th key={c} className="px-2 py-1.5 text-right text-[0.72rem] font-semibold uppercase text-muted">{INSIGHT_METRIC_LABELS[c]}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sec.groups.map((g, i) => (
                                <tr key={g.label} className={i % 2 === 0 ? "bg-white/60" : "bg-white/80"}>
                                  <td className="px-2 py-1.5 text-[0.82rem] font-bold text-ink">{g.label}</td>
                                  {INSIGHT_METRIC_COLS.map((c) => (
                                    <td key={c} className="px-2 py-1.5 text-right text-[0.82rem] tabular-nums text-ink">
                                      {formatCount(g.metrics[METRIC_FIELD_BY_COL[c]])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </CollapsibleSection>
                  ))}
                </div>

                <Divider />

                {/* 7. Detail Data — collapsible (collapsed) */}
                <CollapsibleSection title="Detail Data INSIGHT" trailing={`${model.filtered.length} baris`}>
                  <div className="overflow-x-auto rounded-[12px] border border-border bg-white/60 p-2">
                    <table className="w-full min-w-[760px] border-collapse text-left">
                      <thead className="border-b border-divider">
                        <tr>
                          {["TANGGAL", "PLATFORM", ...INSIGHT_METRIC_COLS].map((c) => (
                            <th key={c} className="px-3 py-2 text-left text-[0.74rem] font-semibold uppercase tracking-[0.02em] text-muted">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {model.filtered.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white/60" : "bg-white/80"}>
                            <td className="px-3 py-2 text-sm text-ink">{str(r.TANGGAL)}</td>
                            <td className="px-3 py-2 text-sm text-ink">{str(r.PLATFORM)}</td>
                            {INSIGHT_METRIC_COLS.map((c) => (
                              <td key={c} className="px-3 py-2 text-right text-sm tabular-nums text-ink">{formatCount(toNum(r[c]))}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CollapsibleSection>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
