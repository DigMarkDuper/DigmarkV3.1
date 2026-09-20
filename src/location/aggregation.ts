/**
 * Pure aggregation: rows (+ optional month filter) -> province distribution.
 *
 * Composition:
 *   - `normalize` (normalizer.ts) -> canonical region
 *   - `resolve`   (mapping.ts)    -> province key (or unknown)
 *
 * Empty / null / "nan" / whitespace Asal are EXCLUDED from every count.
 * Recognized non-empty values count toward a province (mapped). Unrecognized
 * non-empty values go to `unmapped` and are excluded from the mapped bubbles +
 * totals. A province key that isn't in INDONESIA_PROVINCES is treated as
 * unmapped. Never throws — all inputs are tolerated.
 *
 * Month filtering reuses `filterByMonth` from @/workspaces/waAdmin; `monthOptions`
 * is re-exported here so the section needn't import two modules.
 */
import type { Row } from "@/server/adapter/source";
import { monthOptions, filterByMonth, type MonthOption } from "@/workspaces/waAdmin";
import { normalize } from "./normalizer";
import { resolve } from "./mapping";
import { INDONESIA_PROVINCES } from "./indonesiaProvinces";

export { monthOptions };
export type { MonthOption };

export interface ProvinceStat {
  province: string;
  count: number;
  /** Share of the MAPPED total (0-100). */
  pct: number;
}

export interface RegionStat {
  region: string;
  count: number;
}

export interface ProvinceDistribution {
  /** Province stats, count-descending. One entry per province with >=1 mapped row. */
  provinces: ProvinceStat[];
  /** Per-province regency breakdown (canonical region -> count), count-descending. */
  provinceRegions: Record<string, RegionStat[]>;
  /** Top 5 provinces by count. */
  top: ProvinceStat[];
  summary: {
    /** Rows that mapped to a real province (bubble/total basis). */
    totalMapped: number;
    /** All source rows after the optional month filter (Total Prospek metric).
     *  Includes empty/unmapped Asal, because a prospect is a prospect even when
     *  its location is unknown. */
    totalRows: number;
    /** Number of distinct provinces reached. */
    regions: number;
    /** Top province name, or "—" when nothing mapped. */
    topProvince: string;
    /** Top province share of the mapped total (0-100), or 0. */
    topShare: number;
  };
  unmapped: {
    /** Rows that were non-empty but unresolved. */
    count: number;
    /** Distinct unrecognized canonical values (for the diagnostic). */
    values: string[];
  };
}

/** Percent helpers — no fabricated rounding for zero mapped. */
export function pctOf(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

/**
 * Aggregate prospect distribution over rows. `month` is "YYYY-MM" (or undefined
 * = Semua Bulan). Reuses waAdmin's `filterByMonth` — do not re-derive here.
 */
export function aggregateProspectDistribution(rows: Row[], month?: string): ProvinceDistribution {
  const source = month ? filterByMonth(rows, month) : rows;

  const provinceCount = new Map<string, number>();
  const regionCount = new Map<string, RegionStat>();
  let totalMapped = 0;
  let unmappedCount = 0;
  const unmappedSet = new Set<string>();

  for (const r of source) {
    const canonical = normalize(r["Asal"]);
    if (canonical === "") continue; // empty/null/nan/whitespace — excluded entirely

    const { province, known } = resolve(canonical);
    if (known && Object.prototype.hasOwnProperty.call(INDONESIA_PROVINCES, province)) {
      provinceCount.set(province, (provinceCount.get(province) ?? 0) + 1);
      const regionKey = `${province}\u0000${canonical}`;
      const prev = regionCount.get(regionKey);
      if (prev) prev.count += 1;
      else regionCount.set(regionKey, { region: canonical, count: 1 });
      totalMapped += 1;
    } else {
      unmappedCount += 1;
      unmappedSet.add(canonical);
    }
  }

  const provinces: ProvinceStat[] = [...provinceCount.entries()]
    .map(([province, count]) => ({ province, count, pct: pctOf(count, totalMapped) }))
    .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province));

  // Per-province region breakdown.
  const provinceRegions: Record<string, RegionStat[]> = {};
  for (const province of provinceCount.keys()) {
    const stats: RegionStat[] = [];
    for (const [key, val] of regionCount.entries()) {
      if (key.startsWith(`${province}\u0000`)) stats.push({ region: val.region, count: val.count });
    }
    stats.sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
    provinceRegions[province] = stats;
  }

  const topProvince = provinces.length ? provinces[0].province : "—";

  return {
    provinces,
    provinceRegions,
    top: provinces.slice(0, 5),
    summary: {
      totalMapped,
      totalRows: source.length,
      regions: provinces.length,
      topProvince,
      topShare: provinces.length ? provinces[0].pct : 0,
    },
    unmapped: {
      count: unmappedCount,
      values: [...unmappedSet].sort((a, b) => a.localeCompare(b)),
    },
  };
}