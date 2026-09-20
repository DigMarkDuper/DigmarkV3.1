import { describe, expect, it } from "vitest";
import { adsMetricsController } from "./adsControllers";
import { makeFakeSource, makeSession } from "./testHelpers";
import { columnsFor } from "@/server/adapter/schema";

const STATUS_COL = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const body = async (res: Response) => res.json() as Promise<unknown>;

/** Seed wa_admin (2 leads, 1 Closing) + ads_tiktok with a Cost column. */
function seed(title: string, appKey: string): unknown[][] {
  const headers = columnsFor(appKey);
  if (appKey === "wa_admin") {
    const status = headers.indexOf(STATUS_COL);
    const row = (s: string) => {
      const cells = new Array(headers.length).fill("");
      cells[status] = s;
      return cells;
    };
    return [headers, row("Closing"), row("Follow Up")];
  }
  if (appKey === "ads_tiktok") {
    const cost = headers.indexOf("Cost");
    const row = new Array(headers.length).fill("");
    row[cost] = "Rp 500.000,00";
    return [headers, row];
  }
  return [headers];
}

describe("GET /api/ads/metrics", () => {
  it("returns final ROI scalars computed server-side via roi()", async () => {
    const { source } = makeFakeSource({ seed });
    const res = await adsMetricsController(makeSession("v", "viewer"), source);
    expect(res.status).toBe(200);
    const b = (await body(res)) as {
      ok: boolean;
      metrics: { spend: number; leads: number; closing: number; cac: number; roas: number; omzet: number };
    };
    expect(b.ok).toBe(true);
    expect(b.metrics.spend).toBe(500_000);
    expect(b.metrics.leads).toBe(2);
    expect(b.metrics.closing).toBe(1);
    expect(b.metrics.cac).toBe(500_000); // spend / closing
    expect(b.metrics.omzet).toBe(12_995_000); // closing * BIAYA_PELATIHAN
    expect(b.metrics.roas).toBe(12_995_000 / 500_000); // omzet / spend
    // Server-only math: no auth/internals leak.
    expect(JSON.stringify(b)).not.toMatch(/secret|password|token/i);
  });

  it("returns zeroed metrics when source tabs are empty", async () => {
    const { source } = makeFakeSource(); // headers only
    const res = await adsMetricsController(makeSession("v"), source);
    expect(res.status).toBe(200);
    const b = (await body(res)) as { metrics: { spend: number; leads: number } };
    expect(b.metrics).toEqual({ spend: 0, leads: 0, closing: 0, cac: 0, roas: 0, omzet: 0 });
  });

  it("401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await adsMetricsController(null, source);
    expect(res.status).toBe(401);
  });
});