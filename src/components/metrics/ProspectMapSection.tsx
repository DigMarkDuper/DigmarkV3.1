"use client";
/**
 * ProspectMapSection — Home section: bulan filter + KPI ringkas + peta interaktif
 * + daftar "Top Wilayah" + diagnostik "Lokasi tidak terpetakan".
 *
 * Pure presentational: given wa_admin rows, recomputes everything locally when
 * the month filter changes (via aggregateProspectDistribution + monthOptions).
 * Uses the app's PALETTE / card / Select / MetricCard design tokens. Indonesian UI.
 */
import { useMemo, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { Select } from "@/components/ui/Field";
import { MetricCard } from "@/components/metrics/MetricCard";
import { BRAND_RAMP, formatCount, formatPercent } from "@/components/ui-common";
import { aggregateProspectDistribution, monthOptions } from "@/location/aggregation";
import { IndonesiaMap } from "@/components/map/IndonesiaMap";

export interface ProspectMapSectionProps {
  rows: Row[];
}

const ALL_MONTHS = "__all__";

export function ProspectMapSection({ rows }: ProspectMapSectionProps) {
  const [month, setMonth] = useState<string>(ALL_MONTHS);

  const options = useMemo(() => {
    const m = monthOptions(rows);
    return [{ value: ALL_MONTHS, label: "Semua Bulan" }, ...m.map((o) => ({ value: o.period, label: o.label }))];
  }, [rows]);

  const agg = useMemo(
    () => aggregateProspectDistribution(rows, month === ALL_MONTHS ? undefined : month),
    [rows, month],
  );

  const mappedTotal = agg.summary.totalMapped;
  const totalProspek = agg.summary.totalRows;
  const topShareLabel = mappedTotal > 0 ? formatPercent(agg.summary.topShare, true) : "—";

  return (
    <section className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-[260px]">
          <Select
            id="map-month"
            label="Periode"
            options={options}
            value={month}
            onSelect={setMonth}
          />
        </div>
        <div className="text-[0.76rem] text-muted">
          {agg.unmapped.count > 0
            ? `Lokasi tidak terpetakan: ${formatCount(agg.unmapped.count)}`
            : "Lokasi tidak terpetakan: 0"}
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon="🧭" label="Total Prospek" value={formatCount(totalProspek)} />
        <MetricCard icon="🗺️" label="Wilayah Terjangkau" value={`${formatCount(agg.summary.regions)} Provinsi`} />
        <MetricCard icon="🏆" label="Wilayah Teratas" value={agg.summary.topProvince} />
        <MetricCard icon="📊" label="Kontribusi Terbesar" value={topShareLabel} />
      </div>

      {/* Map */}
      <div className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]">
        <IndonesiaMap provinces={agg.provinces} provinceRegions={agg.provinceRegions} />
      </div>

      {/* Top 5 region list + legend */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]">
          <h3 className="text-[0.94rem] font-bold text-ink">TOP WILAYAH</h3>
          <ol className="mt-3 flex flex-col gap-1.5">
            {agg.top.map((t, i) => (
              <li key={t.province} className="flex items-center gap-3">
                <span className="w-6 text-[0.82rem] font-extrabold text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[0.86rem] font-semibold text-ink">{t.province}</span>
                    <span className="shrink-0 text-[0.8rem] text-muted">{formatCount(t.count)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-grid">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: mappedTotal > 0 ? `${(t.count / mappedTotal) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              </li>
            ))}
            {agg.top.length === 0 ? (
              <li className="text-[0.84rem] text-muted">Belum ada data wilayah terpetakan.</li>
            ) : null}
          </ol>
        </div>

        {/* Heat legend */}
        <div className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]">
          <h3 className="text-[0.94rem] font-bold text-ink">Tingkat Kepadatan Prospek</h3>
          <div className="mt-3 h-3 w-full rounded-full" style={{ background: `linear-gradient(to right, ${BRAND_RAMP.join(", ")})` }} />
          <div className="mt-1 flex justify-between text-[0.72rem] text-muted">
            <span>Rendah</span>
            <span>Tinggi</span>
          </div>
          <p className="mt-3 text-[0.78rem] leading-relaxed text-muted">
            Warna provinsi menunjukkan jumlah prospek; lingkaran biru menandakan lokasi prospek
            terbanyak. Klik provinsi untuk melihat rincian per wilayah.
          </p>
        </div>
      </div>
    </section>
  );
}