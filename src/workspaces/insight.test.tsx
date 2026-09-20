import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InsightDashboard } from "@/workspaces/InsightDashboard";
import {
  buildInsightModel,
  dataQuality,
  deriveMetrics,
  filterInsightRows,
  funnel,
  funnelConversionRate,
  insightDate,
  metricAvailable,
  multiTrend,
  periodSummary,
  platformAvailability,
  platformComparison,
  rate,
  sumMetrics,
  trendSeries,
} from "@/workspaces/insight";
import type { Row } from "@/server/adapter/source";

/* ---------------------------------------------------------------------------
 * Fixture rows mirror the declared INSIGHT schema columns, sorted by date,
 * including: an Instagram set, a TikTok set (one with REACH=0), an unknown
 * platform (Facebook), and a negative-follower row.
 * ------------------------------------------------------------------------ */
function row(partial: Partial<Row>): Row {
  return {
    TANGGAL: "01/09/2026",
    PLATFORM: "Instagram",
    VIEW: 0,
    REACH: 0,
    "CONTENT INTERACTION": 0,
    "PROFILE VISIT": 0,
    "LINK CLICKS": 0,
    FOLLOWER: 0,
    ...partial,
  };
}

const IG_1 = row({ TANGGAL: "01/09/2026", PLATFORM: "Instagram", VIEW: 1000, REACH: 500, "CONTENT INTERACTION": 50, "PROFILE VISIT": 25, "LINK CLICKS": 10, FOLLOWER: 5 });
const TT_1 = row({ TANGGAL: "01/09/2026", PLATFORM: "TikTok", VIEW: 2000, REACH: 0, "CONTENT INTERACTION": 80, "PROFILE VISIT": 30, "LINK CLICKS": 12, FOLLOWER: 9 });
const IG_2 = row({ TANGGAL: "02/09/2026", PLATFORM: "Instagram", VIEW: 1500, REACH: 700, "CONTENT INTERACTION": 70, "PROFILE VISIT": 40, "LINK CLICKS": 15, FOLLOWER: 7 });
const TT_2 = row({ TANGGAL: "02/09/2026", PLATFORM: "TikTok", VIEW: 3000, REACH: 900, "CONTENT INTERACTION": 120, "PROFILE VISIT": 60, "LINK CLICKS": 20, FOLLOWER: 11 });
const FB_1 = row({ TANGGAL: "03/09/2026", PLATFORM: "Facebook", VIEW: 500, REACH: 200, "CONTENT INTERACTION": 10, "PROFILE VISIT": 5, "LINK CLICKS": 2, FOLLOWER: 1 });
const IG_NEG = row({ TANGGAL: "03/09/2026", PLATFORM: "Instagram", VIEW: 800, REACH: 400, "CONTENT INTERACTION": 30, "PROFILE VISIT": 15, "LINK CLICKS": 6, FOLLOWER: -3 });

const FIXTURE: Row[] = [IG_1, TT_1, IG_2, TT_2, FB_1, IG_NEG]; // already date-ascending

describe("insight parsing & transformation", () => {
  it("parses day-first and ISO TANGGAL", () => {
    const d1 = insightDate(IG_1);
    expect(d1 ? [d1.getFullYear(), d1.getMonth() + 1, d1.getDate()] : null).toEqual([2026, 9, 1]);
    const d2 = insightDate(row({ TANGGAL: "2026-09-05" }));
    expect(d2 ? [d2.getFullYear(), d2.getMonth() + 1, d2.getDate()] : null).toEqual([2026, 9, 5]);
    expect(insightDate(row({ TANGGAL: "not-a-date" }))).toBeNull();
  });

  it("parses numeric strings defensively (thousand separators stripped)", () => {
    const r = row({ VIEW: "1.234", REACH: "5,6", "PROFILE VISIT": "12,500" });
    const m = sumMetrics([r]);
    expect(m.views).toBe(1234);
    expect(m.reach).toBe(56);
    expect(m.profileVisit).toBe(12500);
  });
});

describe("executive totals (spec 3)", () => {
  it("sums all six metrics across the selection", () => {
    const m = sumMetrics(FIXTURE);
    expect(m.views).toBe(8800);
    expect(m.reach).toBe(2700);
    expect(m.contentInteraction).toBe(360);
    expect(m.profileVisit).toBe(175);
    expect(m.linkClicks).toBe(65);
    expect(m.netFollower).toBe(30); // 5+7+9+11+1-3
  });
});

describe("derived metrics with zero-denominator handling (spec 4)", () => {
  it("computes rates from correct denominators when reach > 0", () => {
    const d = deriveMetrics([IG_1, IG_2]); // reach 1200
    expect(d.engagement).toBeCloseTo((50 + 70) / 1200 * 100, 6);
    expect(d.profileVisitRate).toBeCloseTo((25 + 40) / 1200 * 100, 6);
    expect(d.linkCtr).toBeCloseTo((10 + 15) / 1200 * 100, 6);
    expect(d.profileToClick).toBeCloseTo((10 + 15) / (25 + 40) * 100, 6);
  });

  it("returns null (never NaN/infinity) when Reach = 0", () => {
    const d = deriveMetrics([TT_1]); // REACH=0
    expect(d.engagement).toBeNull();
    expect(d.profileVisitRate).toBeNull();
    expect(d.linkCtr).toBeNull();
    // Profile->Click still computable: profileVisit=30, linkClicks=12
    expect(d.profileToClick).toBeCloseTo(12 / 30 * 100, 6);
  });

  it("returns null for ALL four rates when both Reach and Profile Visit are 0", () => {
    const zero = row({ REACH: 0, "PROFILE VISIT": 0, "LINK CLICKS": 5 });
    const d = deriveMetrics([zero]);
    expect(d.engagement).toBeNull();
    expect(d.profileVisitRate).toBeNull();
    expect(d.linkCtr).toBeNull();
    expect(d.profileToClick).toBeNull();
  });

  it("rate() helper guards division by zero (never 0% / NaN)", () => {
    expect(rate(10, 0)).toBeNull();
    expect(rate(10, -5)).toBeNull();
    expect(rate(2, 50)).toBe(4);
  });
});

describe("social media funnel (spec 5) — INSIGHT only, no CRM/Lead", () => {
  it("builds the 4 INSIGHT stages in order, from summed metrics", () => {
    const stages = funnel(sumMetrics(FIXTURE));
    expect(stages.map((s) => s.stage)).toEqual(["Reach", "Interaksi Konten", "Kunjungan Profil", "Klik Link"]);
    expect(stages.map((s) => s.value)).toEqual([2700, 360, 175, 65]);
  });
});

describe("platform comparison (spec 6) — raw + derived, no ranking", () => {
  it("splits Instagram vs TikTok without leaking other platforms", () => {
    const cmp = platformComparison(FIXTURE);
    const ig = cmp.Instagram;
    expect(ig.views).toBe(3300); // 1000+1500+800
    expect(ig.reach).toBe(1600);
    expect(ig.engagement).toBeCloseTo(150 / 1600 * 100, 6);
    expect(ig.profileToClick).toBeCloseTo(31 / 80 * 100, 6);
    const tt = cmp.TikTok;
    expect(tt.views).toBe(5000); // 2000+3000
    expect(tt.reach).toBe(900); // 0 (TT_1) + 900
    expect(tt.linkCtr).toBeCloseTo(32 / 900 * 100, 6);
  });
});

describe("date-range + platform filtering (spec 2)", () => {
  it("filters by platform (All / Instagram / TikTok)", () => {
    const tiktok = FIXTURE.filter((r) => filterInsightRows([r], { from: null, to: null, platform: "TikTok" }).length > 0);
    expect(tiktok).toHaveLength(2);
    for (const r of tiktok) expect(r.PLATFORM).toBe("TikTok");
    const instagram = FIXTURE.filter((r) => filterInsightRows([r], { from: null, to: null, platform: "Instagram" }).length > 0);
    expect(instagram.map((r) => String(r.VIEW)).join(",")).toBe("1000,1500,800");
  });

  it("filters by inclusive date range and combines with platform", () => {
    const all = filterInsightRows(FIXTURE, { from: new Date(2026, 8, 2), to: new Date(2026, 8, 3), platform: "all" });
    expect(all).toHaveLength(4); // IG_2, TT_2 (02) + FB_1, IG_NEG (03)
    const tiktok = filterInsightRows(FIXTURE, { from: new Date(2026, 8, 2), to: new Date(2026, 8, 3), platform: "TikTok" });
    expect(tiktok.map((r) => String(r.VIEW))).toEqual(["3000"]);
  });
});

describe("performance trend (spec 7)", () => {
  it("aggregates per-day values, ascending, for a metric", () => {
    const t = trendSeries(FIXTURE, "VIEW");
    expect(t.map((p) => p.value)).toEqual([3000, 4500, 1300]); // 01: IG1000+TT2000, 02: 1500+3000, 03: 500+800
    expect(t[0].label).toBe("01 Sep");
    expect(t[2].label).toBe("03 Sep");
  });

  it("multiTrend aligns multiple metrics on shared date keys", () => {
    const mt = multiTrend(FIXTURE, ["VIEW", "REACH"]);
    expect(mt.labels).toHaveLength(3);
    expect(mt.series[0].values).toEqual([3000, 4500, 1300]);
    expect(mt.series[1].values).toEqual([500, 1600, 600]); // reach: 500, 700+900, 200+400
  });
});

describe("period performance (spec 8) — daily / weekly / monthly", () => {
  it("groups daily (three distinct dates)", () => {
    const daily = periodSummary(FIXTURE)[0];
    expect(daily.granularity).toBe("daily");
    expect(daily.groups.map((g) => g.label)).toEqual(["01 Sep", "02 Sep", "03 Sep"]);
    expect(daily.groups[0].metrics.views).toBe(3000);
  });

  it("groups weekly (all fixture days fall in one ISO week)", () => {
    const weekly = periodSummary(FIXTURE)[1];
    expect(weekly.groups).toHaveLength(1);
    expect(weekly.groups[0].metrics.views).toBe(8800);
    expect(weekly.groups[0].label).toMatch(/^Wk /);
  });

  it("groups monthly with a single Indonesian month bucket", () => {
    const monthly = periodSummary(FIXTURE)[2];
    expect(monthly.groups.map((g) => g.label)).toEqual(["Sep 2026"]);
    expect(monthly.groups[0].metrics.netFollower).toBe(30);
  });
});

describe("data-quality detection (spec 9) — read-only, never alters data", () => {
  it("flags Reach=0, negative follower, and unknown platform", () => {
    const q = dataQuality(FIXTURE);
    expect(q.count).toBeGreaterThan(0);
    expect(q.issues.some((i) => i.kind === "reachZero")).toBe(true);
    expect(q.issues.some((i) => i.kind === "negativeFollower")).toBe(true);
    expect(q.issues.some((i) => i.kind === "unknownPlatform")).toBe(true);
    expect(q.issues.some((i) => i.kind === "outOfOrder")).toBe(false); // fixture is date-sorted
    expect(q.platformCounts["Facebook"]).toBe(1);
  });

  it("detects duplicate date+platform pairs", () => {
    const withDup = [...FIXTURE, IG_1]; // duplicate (01/09, Instagram)
    const q = dataQuality(withDup);
    expect(q.issues.some((i) => i.kind === "duplicateDate")).toBe(true);
  });

  it("detects out-of-order dates and empty data", () => {
    const shuffled = [IG_2, IG_1]; // 02 then 01
    const q = dataQuality(shuffled);
    expect(q.issues.some((i) => i.kind === "outOfOrder")).toBe(true);
    const empty = dataQuality([]);
    expect(empty.issues.some((i) => i.kind === "empty")).toBe(true);
  });
});

describe("buildInsightModel (spec 12 — centralized composition)", () => {
  it("default (full span) has no previous baseline -> deltas null, no fake comp", () => {
    const m = buildInsightModel(FIXTURE, { platform: "all" });
    expect(m.hasPrevious).toBe(false);
    expect(m.filtered).toHaveLength(6);
    expect(m.metrics.views).toBe(8800);
    for (const c of ["VIEW", "REACH", "CONTENT INTERACTION", "PROFILE VISIT", "LINK CLICKS", "FOLLOWER"] as const) {
      expect(m.deltas[c]).toBeNull();
    }
    expect(m.funnelStages).toHaveLength(4);
    expect(m.periodSections.length).toBe(3);
  });

  it("computes previous-period deltas for a narrowed date range", () => {
    const m = buildInsightModel(FIXTURE, { from: "2026-09-02", to: "2026-09-03", platform: "all" });
    expect(m.hasPrevious).toBe(true);
    // previous = [31/08, 01/09] -> IG_1 + TT_1
    expect(m.previous).toHaveLength(2);
    // current = IG_2,TT_2,FB_1,IG_NEG -> views 5800 vs prev 3000
    expect(m.metrics.views).toBe(5800);
    expect(m.deltas.VIEW).toBeCloseTo((5800 - 3000) / 3000 * 100, 6);
    expect(m.deltas.FOLLOWER).toBeCloseTo((16 - 14) / 14 * 100, 6);
  });
});

describe("InsightDashboard (react-dom/server, no browser)", () => {
  it("renders all priority sections with Indonesian copy", () => {
    const html = renderToStaticMarkup(<InsightDashboard rows={FIXTURE} onRefresh={() => {}} />);
    expect(html).toContain("Insight Sosial Media");
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Ringkasan Performa");
    expect(html).toContain("Sosial Media Funnel");
    expect(html).toContain("Perbandingan Platform");
    expect(html).toContain("Tren Performa");
    expect(html).toContain("Ringkasan Per Hari");
    expect(html).toContain("Ringkasan Per Minggu");
    expect(html).toContain("Ringkasan Per Bulan");
    expect(html).toContain("Detail Data INSIGHT");
    expect(html).toContain("Data Quality Issues:");
  });

  it("uses short KPI labels (Views / Reach / Interaksi / Profile Visit / Link Click / Net Follower)", () => {
    const html = renderToStaticMarkup(<InsightDashboard rows={FIXTURE} onRefresh={() => {}} />);
    expect(html).toContain(">Views<");
    expect(html).toContain(">Reach<");
    expect(html).toContain(">Interaksi<");
    expect(html).toContain(">Profile Visit<");
    expect(html).toContain(">Link Click<");
    expect(html).toContain(">Net Follower<");
  });

  it("shows 'N/A' (never a fake percentage) for zero-denominator rates", () => {
    // TikTok-only, reach 0 -> all reach-based rates N/A; Instagram absent -> N/A too.
    const html = renderToStaticMarkup(<InsightDashboard rows={[TT_1]} onRefresh={() => {}} />);
    expect(html).toContain("N/A");
    expect(html).not.toContain("NaN%");
    expect(html).not.toContain("Infinity");
  });

  it("renders trend dates in Indonesian 'D MMM' format", () => {
    const html = renderToStaticMarkup(<InsightDashboard rows={FIXTURE} onRefresh={() => {}} />);
    expect(html).toContain("01 Sep");
    expect(html).not.toContain("01/09");
  });
});

describe("metric availability (0 ≠ unavailable)", () => {
  it("is unavailable when every row in the scope is 0/empty for that metric", () => {
    // TT_1 has REACH=0 and no other TikTok row in this scope -> reach unavailable.
    expect(metricAvailable([TT_1], "REACH")).toBe(false);
    expect(metricAvailable([TT_1], "VIEW")).toBe(true);
    // Empty scope -> unavailable.
    expect(metricAvailable([], "VIEW")).toBe(false);
  });

  it("distinguishes a genuine summed 0 from an unavailable metric", () => {
    // A positive and negative row cancel to a genuine 0 sum while the column
    // is populated -> metricAvailable stays true (real "0", not N/A).
    const cancels = row({ REACH: 5 });
    const cancelsNeg = row({ REACH: -5 });
    expect(metricAvailable([cancels, cancelsNeg], "REACH")).toBe(true);
    expect(sumMetrics([cancels, cancelsNeg]).reach).toBe(0);
    // All-zero column throughout -> unavailable.
    expect(metricAvailable([row({ REACH: 0 }), row({ REACH: 0 })], "REACH")).toBe(false);
  });

  it("reports per-platform availability (TikTok Reach unavailable when all its rows are 0)", () => {
    const avail = platformAvailability([IG_1, TT_1]);
    expect(avail.TikTok.REACH).toBe(false); // TT_1 reach = 0
    expect(avail.TikTok.VIEW).toBe(true); // TT_1 view = 2000
    expect(avail.Instagram.REACH).toBe(true); // IG_1 reach = 500
  });
});

describe("funnel conversion rate (adjacent stages)", () => {
  it("computes cur/prev % and returns null when the base is 0", () => {
    expect(funnelConversionRate(100, 25)).toBe(25);
    expect(funnelConversionRate(25, 5)).toBe(20);
    // Base (top) stage zero/unavailable -> N/A semantics.
    expect(funnelConversionRate(0, 5)).toBeNull();
    expect(funnelConversionRate(-4, 5)).toBeNull();
  });

  it("feeds the funnel stages (Reach -> Interaksi -> Profil -> Klik)", () => {
    // reach=2700 -> interaksi=360 -> profil=175 -> klik=65 over FIXTURE.
    const [reach, interaksi, profil, klik] = funnel(sumMetrics(FIXTURE));
    expect(funnelConversionRate(reach.value, interaksi.value)).toBeCloseTo((360 / 2700) * 100, 6);
    expect(funnelConversionRate(interaksi.value, profil.value)).toBeCloseTo((175 / 360) * 100, 6);
    expect(funnelConversionRate(profil.value, klik.value)).toBeCloseTo((65 / 175) * 100, 6);
  });
});