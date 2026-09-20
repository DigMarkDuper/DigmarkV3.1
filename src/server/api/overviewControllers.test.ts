import { describe, expect, it } from "vitest";
import { overviewMetricsController } from "./overviewControllers";
import { makeFakeSource, makeSession } from "./testHelpers";
import { columnsFor } from "@/server/adapter/schema";
import type { RegistrationSource } from "@/server/adapter/sheets/registration";
import type { Row } from "@/server/adapter/source";

const STATUS_COL = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const body = async (res: Response) => res.json() as Promise<unknown>;

/** Seed wa_admin with 2 leads: 1 Closing, 1 Follow Up. */
function seedWaAdmin(title: string, appKey: string): unknown[][] {
  const headers = columnsFor(appKey);
  if (appKey !== "wa_admin") return [headers];
  const status = headers.indexOf(STATUS_COL);
  const row = (s: string, name: string) => {
    const cells = new Array(headers.length).fill("");
    cells[status] = s;
    const nm = headers.indexOf("Nama");
    if (nm >= 0) cells[nm] = name;
    return cells;
  };
  return [headers, row("Closing", "Ani"), row("Follow Up", "Budi")];
}

const INSIGHT = {
  VIEW: 500,
  REACH: 200,
  "CONTENT INTERACTION": 70,
  "PROFILE VISIT": 90,
  "LINK CLICKS": 20,
};

/** Seed the insight tab with a single data row of known totals. */
function seedInsight(title: string, appKey: string): unknown[][] {
  const headers = columnsFor(appKey);
  if (appKey !== "insight") return [headers];
  const cells = new Array(headers.length).fill("");
  for (const key of Object.keys(INSIGHT) as (keyof typeof INSIGHT)[]) {
    cells[headers.indexOf(key)] = INSIGHT[key];
  }
  return [headers, cells];
}

function seedAll(title: string, appKey: string): unknown[][] {
  return appKey === "wa_admin"
    ? seedWaAdmin(title, appKey)
    : seedInsight(title, appKey);
}

/** Registration rows: 3 in 2026 (latest), 2 in 2025. */
function registrationFixture(): Row[] {
  const mk = (year: number, name: string): Row => ({
    Timestamp: `1/1/${year} 09:00:00`,
    "Nama Lengkap": name,
    "Nomor Whatsapp": "",
    Email: "",
    "MENGETAHUI DUTA PERSADA DARI": "",
  });
  return [
    mk(2025, "Old1"),
    mk(2025, "Old2"),
    mk(2026, "A"),
    mk(2026, "B"),
    mk(2026, "C"),
  ];
}

/** A fake registration source factory returning normalized rows. */
function makeFakeRegistration(rows: Row[]): () => RegistrationSource {
  return () => ({ fetch: async () => [...rows] } as unknown as RegistrationSource);
}

describe("GET /api/overview/metrics", () => {
  it("returns final scalar KPIs plus the funnel block (server-side derivation)", async () => {
    const reg = makeFakeRegistration(registrationFixture());
    const { source } = makeFakeSource({ seed: seedAll });
    const res = await overviewMetricsController(makeSession("v", "viewer"), source, reg);
    expect(res.status).toBe(200);
    const b = (await body(res)) as {
      ok: boolean;
      metrics: { leads: number; closing: number; conversion: number; spend: number; cac: number; roas: number; omzet: number };
      funnel: Record<string, number | null>;
    };
    expect(b.ok).toBe(true);
    // Top-level KPI fields stay intact (Hero depends on them).
    expect(b.metrics.leads).toBe(2);
    expect(b.metrics.closing).toBe(1);
    expect(b.metrics.conversion).toBe(50);
    expect(b.metrics.spend).toBe(0);
    expect(b.metrics.roas).toBe(0);
    expect(b.metrics.omzet).toBe(12_995_000);
    // Funnel values from insight + wa_admin + latest-year registration.
    expect(b.funnel.reach).toBe(200);
    expect(b.funnel.views).toBe(500);
    expect(b.funnel.linkClick).toBe(20);
    expect(b.funnel.interaction).toBe(70);
    expect(b.funnel.profileVisit).toBe(90);
    expect(b.funnel.lead).toBe(2); // wa_admin post-junk total
    expect(b.funnel.daftar).toBe(3); // latest-year (2026) only, not all-time (5)
    expect(b.funnel.closing).toBe(1); // STATUS col L == "closing", pre-junk
    // Linear rates.
    expect(b.funnel.reachToClickRate).toBe(10); // 20/200*100
    expect(b.funnel.clickToLeadRate).toBe(10); // 2/20*100
    expect(b.funnel.leadToDaftarRate).toBeCloseTo(150); // 3/2*100
    expect(b.funnel.daftarToClosingRate!).toBeCloseTo(100 / 3); // 1/3*100
    expect(b.funnel.overallRate).toBe(50); // 1/2*100
    // No credentials/auth internals leak into the payload.
    expect(JSON.stringify(b)).not.toMatch(/secret|password|token/i);
  });

  it("returns zeroed metrics when the source tabs are empty, funnel rates null on zero divisors", async () => {
    const reg = makeFakeRegistration([
      { Timestamp: "2/2/2026 10:00:00", "Nama Lengkap": "X" },
    ]);
    const { source } = makeFakeSource(); // headers only, no data rows (wa empty -> lead=0)
    const res = await overviewMetricsController(makeSession("v"), source, reg);
    expect(res.status).toBe(200);
    const b = (await body(res)) as {
      metrics: { leads: number; closing: number; conversion: number; spend: number; cac: number; roas: number; omzet: number };
      funnel: Record<string, number | null>;
    };
    expect(b.metrics).toEqual({ leads: 0, closing: 0, conversion: 0, spend: 0, cac: 0, roas: 0, omzet: 0 });
    // Empty insight -> reach/linkClick = 0 -> those rates null, not NaN/Infinity.
    expect(b.funnel.reach).toBe(0);
    expect(b.funnel.views).toBe(0);
    expect(b.funnel.linkClick).toBe(0);
    expect(b.funnel.reachToClickRate).toBeNull();
    expect(b.funnel.clickToLeadRate).toBeNull(); // lead/linkClick, linkClick=0
    expect(b.funnel.leadToDaftarRate).toBeNull(); // daftar/lead, lead=0
    expect(b.funnel.overallRate).toBeNull(); // closing/lead, lead=0
    // daftar still counts latest-year even when wa is empty.
    expect(b.funnel.daftar).toBe(1);
    expect(b.funnel.lead).toBe(0);
  });

  it("uses the latest year (not all-time) for daftar", async () => {
    const reg = makeFakeRegistration(registrationFixture()); // 5 total, 3 in 2026
    const { source } = makeFakeSource({ seed: seedAll });
    const res = await overviewMetricsController(makeSession("v"), source, reg);
    const b = (await body(res)) as { funnel: { daftar: number; lead: number } };
    expect(b.funnel.daftar).toBe(3); // NOT 5 (all-time)
    expect(b.funnel.lead).toBe(2);
  });

  it("Hero funnel matches /wa-admin: leads post-junk, closing pre-junk exact (the intended correctness fix)", async () => {
    // Two INSTANCE seeds build on the same session-seed helper.
    const status = columnsFor("wa_admin").indexOf(STATUS_COL);
    const mk = (s: string, tag: string) => {
      const cells = new Array(columnsFor("wa_admin").length).fill("");
      cells[status] = s;
      const mkT = columnsFor("wa_admin").indexOf("Mekari Tag");
      if (mkT >= 0) cells[mkT] = tag;
      return cells;
    };
    function seedEdge(title: string, appKey: string): unknown[][] {
      const headers = columnsFor(appKey);
      if (appKey !== "wa_admin") return [headers];
      return [
        headers,
        mk("closing", "partnership"), // junk'd Mekari tag but STATUS == closing (pre-junk)
        mk("Closing", ""),            // kept, exact closing (post-junk)
        mk("Follow Up", ""),          // kept
      ];
    }
    const { source } = makeFakeSource({ seed: seedEdge });
    const reg = makeFakeRegistration([]);
    const res = await overviewMetricsController(makeSession("v"), source, reg);
    const b = (await body(res)) as {
      metrics: { leads: number; closing: number; omzet: number };
      funnel: { lead: number; closing: number; closingDefinition: string };
    };
    // leads = post-junk total (2: Closing + Follow Up — the junk row is dropped).
    expect(b.metrics.leads).toBe(2);
    expect(b.funnel.lead).toBe(2);
    // closing = EXACT "closing" over SOURCE (pre-junk) rows (3: incl. junk row) — same as /wa-admin.
    expect(b.metrics.closing).toBe(2);
    expect(b.funnel.closing).toBe(2);
    // omzet derives from the SAME pre-junk closing (2 * BIAYA_PELATIHAN).
    expect(b.metrics.omzet).toBe(2 * 12_995_000);
    // explicit definition field present.
    expect(b.funnel.closingDefinition).toBe("status==closing pre-junk");
  });

  it("401 when unauthenticated, without touching the registration factory", async () => {
    let factoryCalled = false;
    const { source } = makeFakeSource();
    const reg = () => {
      factoryCalled = true;
      return { fetch: async (): Promise<Row[]> => [] } as unknown as RegistrationSource;
    };
    const res = await overviewMetricsController(null, source, reg);
    expect(res.status).toBe(401);
    expect(factoryCalled).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Ground-truth functional assertion (offline, deterministic).
 * Values verified against the live master on 2026-09-17 — the funnel block
 * MUST reproduce these exact numbers from seeded source rows.
 * ------------------------------------------------------------------------ */
const GT = {
  reach: 2_841_036,
  views: 7_363_486,
  linkClick: 25_550,
  interaction: 74_954,
  profileVisit: 133_314,
  lead: 1_436,
  daftar: 184,
  closing: 70,
};

describe("GET /api/overview/metrics — ground truth funnel", () => {
  function seedGroundTruth(title: string, appKey: string): unknown[][] {
    const headers = columnsFor(appKey);
    if (appKey === "wa_admin") {
      // 1436 post-junk leads, 70 of which are STATUS == "closing" (pre-junk).
      const status = headers.indexOf(STATUS_COL);
      const row = (statusValue: string) => {
        const cells = new Array(headers.length).fill("");
        cells[status] = statusValue;
        return cells;
      };
      const out: unknown[][] = [headers];
      for (let i = 0; i < GT.closing; i++) out.push(row("Closing"));
      for (let i = 0; i < GT.lead - GT.closing; i++) out.push(row("Follow Up"));
      return out;
    }
    if (appKey === "insight") {
      const cells = new Array(headers.length).fill("");
      cells[headers.indexOf("REACH")] = GT.reach;
      cells[headers.indexOf("VIEW")] = GT.views;
      cells[headers.indexOf("LINK CLICKS")] = GT.linkClick;
      cells[headers.indexOf("CONTENT INTERACTION")] = GT.interaction;
      cells[headers.indexOf("PROFILE VISIT")] = GT.profileVisit;
      return [headers, cells];
    }
    return [headers];
  }

  /** Latest-year (2026) pendaftar count = 184; older years present too. */
  function groundTruthRegistration(): Row[] {
    const rows: Row[] = [];
    for (let i = 0; i < 100; i++) rows.push({ Timestamp: "1/2/2025 09:00:00" });
    for (let i = 0; i < GT.daftar; i++) rows.push({ Timestamp: "1/2/2026 09:00:00" });
    return rows;
  }

  it("returns the exact live funnel scalars + linear rates", async () => {
    const { source } = makeFakeSource({ seed: seedGroundTruth });
    const reg = makeFakeRegistration(groundTruthRegistration());
    const res = await overviewMetricsController(makeSession("v"), source, reg);
    expect(res.status).toBe(200);
    const b = (await body(res)) as {
      funnel: {
        reach: number; views: number; linkClick: number; interaction: number; profileVisit: number;
        lead: number; daftar: number; closing: number; spend: number;
        reachToClickRate: number | null; clickToLeadRate: number | null;
        leadToDaftarRate: number | null; daftarToClosingRate: number | null; overallRate: number | null;
      };
    };
    expect(b.funnel.reach).toBe(GT.reach);
    expect(b.funnel.views).toBe(GT.views);
    expect(b.funnel.linkClick).toBe(GT.linkClick);
    expect(b.funnel.interaction).toBe(GT.interaction);
    expect(b.funnel.profileVisit).toBe(GT.profileVisit);
    expect(b.funnel.lead).toBe(GT.lead);
    expect(b.funnel.daftar).toBe(GT.daftar); // latest year (2026), not all-time (284)
    expect(b.funnel.closing).toBe(GT.closing);
    // Linear rates (2dp precision covers the live 0.9 / 5.62 / 12.81 / 38.04 / 4.87).
    expect(b.funnel.reachToClickRate!).toBeCloseTo((GT.linkClick / GT.reach) * 100, 2);
    expect(b.funnel.clickToLeadRate!).toBeCloseTo((GT.lead / GT.linkClick) * 100, 2);
    expect(b.funnel.leadToDaftarRate!).toBeCloseTo((GT.daftar / GT.lead) * 100, 2);
    expect(b.funnel.daftarToClosingRate!).toBeCloseTo((GT.closing / GT.daftar) * 100, 2);
    expect(b.funnel.overallRate!).toBeCloseTo((GT.closing / GT.lead) * 100, 2);
  });
});