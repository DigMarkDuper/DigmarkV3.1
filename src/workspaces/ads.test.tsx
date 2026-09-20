import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import { AdsDashboard } from "@/workspaces/AdsDashboard";
import {
  adsTab,
  spendOf,
  waSourceCol,
  waStatusCol,
  mekariStats,
  dropTotalRows,
  buildMekariRow,
  todayStamp,
  parseFileToAoa,
  TIKTOK_TAB,
  META_TAB,
} from "@/workspaces/ads";
import { columnsFor } from "@/server/adapter/schema";

type Row = Record<string, unknown>;
const COLS_T = columnsFor("ads_tiktok");
const COLS_M = columnsFor("ads_meta");
const COLS_K = columnsFor("mekari");

// --- spend / leads / closing / CPL (V3 _spend_of + _ads_tab) ---------------

describe("spendOf", () => {
  it("sums cleanIdr over the first column whose lowercase name contains a cost key", () => {
    const rows: Row[] = [
      { "Campaign name": "A", Cost: "Rp 500.000,00" },
      { "Campaign name": "B", Cost: 500_000 },
    ];
    expect(spendOf(rows, ["cost", "spent", "spend"])).toBe(1_000_000);
  });

  it("returns 0 when no column matches the cost keys", () => {
    expect(spendOf([{ name: "A", views: 10 }], ["cost", "spent", "spend"])).toBe(0);
    expect(spendOf([], ["cost"])).toBe(0);
  });
});

describe("adsTab (V3 _ads_tab)", () => {
  const WA: Row[] = [
    { Sumber: "Tiktok Ads", Status: "Closing" },
    { Sumber: "Instagram", Status: "Closing" },
    { Sumber: "tiktok", Status: "Follow Up" },
  ];

  it("resolves the WA source col (first containing 'Sumber') and status col", () => {
    expect(waSourceCol(WA)).toBe("Sumber");
    expect(waStatusCol(WA)).toBe("Status");
    expect(waStatusCol([{ "Mekari Status": "x", Status: "y" }])).toBe("Status");
    expect(waSourceCol([{ Nama: "x" }])).toBeUndefined();
    expect(waStatusCol([{ Nama: "x" }])).toBeUndefined();
  });

  it("counts spend + WA leads/closing by source pattern (case-insensitive) and CPL", () => {
    const tk: Row[] = [{ Cost: "500.000" }, { Cost: 500_000 }];
    const s = adsTab(tk, WA, TIKTOK_TAB.costKeys, TIKTOK_TAB.sourcePat);
    expect(s.spend).toBe(1_000_000);
    expect(s.leads).toBe(2); // Tiktok Ads + tiktok
    expect(s.closing).toBe(1); // only "Tiktok Ads / Closing"
    expect(s.cpl).toBe("Rp 500.000"); // 1_000_000 / 2, dot-grouped
  });

  it("CPL is '—' when there are no matching leads", () => {
    const s = adsTab([{ Cost: 100 }], [{ Sumber: "Organik", Status: "Closing" }], TIKTOK_TAB.costKeys, TIKTOK_TAB.sourcePat);
    expect(s.leads).toBe(0);
    expect(s.cpl).toBe("—");
  });

  it("Meta uses (spent,spend,cost) keys and the IG|FB source pattern", () => {
    const metaRows: Row[] = [{ "Amount spent (IDR)": 200_000, Cost: 999 }];
    const wa: Row[] = [{ Sumber: "Facebook Ads", Status: "Follow Up" }];
    const s = adsTab(metaRows, wa, META_TAB.costKeys, META_TAB.sourcePat);
    expect(s.spend).toBe(200_000); // "spent" matched first, not "cost"
    expect(s.leads).toBe(1);
  });

  it("closing is EXACT 'closing' over the LAST non-Mekari status col (no substring, no first-col)", () => {
    const WA: Row[] = [
      { Sumber: "Tiktok Ads", "Mekari Status": "closed - registered", "Status": "closing" },
      { Sumber: "Tiktok Ads", "Mekari Status": "x", "Status": "Closed - Registered" },
      { Sumber: "Tiktok Ads", "Mekari Status": "x", "Status": "closing process" },
    ];
    // waStatusCol converges to LAST non-Mekari status column = "Status".
    expect(waStatusCol(WA)).toBe("Status");
    // Only the exact "closing" row counts toward closing (all 3 are leads).
    const s = adsTab([], WA, TIKTOK_TAB.costKeys, TIKTOK_TAB.sourcePat);
    expect(s.leads).toBe(3);
    expect(s.closing).toBe(1);
  });
});

// --- Mekari stats -----------------------------------------------------------

describe("mekariStats", () => {
  it("counts rows, resolves biaya col (contains 'biaya'), sums cleanIdr", () => {
    const rows: Row[] = [
      { "Total Biaya (Rp)": "Rp1.000.000" },
      { "Total Biaya (Rp)": 500_000 },
    ];
    const s = mekariStats(rows);
    expect(s.total).toBe(2);
    expect(s.biaya).toBe(1_500_000);
    expect(s.biayaCol).toBe("Total Biaya (Rp)");
    expect(s.biayaPer).toBe("Rp 750.000");
  });

  it("falls back to the 'cost' column and returns '—' per-interaksi when empty", () => {
    const s = mekariStats([{ Cost: 100 }]);
    expect(s.biayaCol).toBe("Cost");
    expect(mekariStats([]).biayaPer).toBe("—");
  });
});

// --- Mekari special import (client-side transform) --------------------------

describe("dropTotalRows", () => {
  it("drops data rows whose first cell lowercased starts with 'total'", () => {
    const { data, dropped } = dropTotalRows([
      ["Campaign", "Spend"],
      ["Summer", 10],
      ["Total", 100],
      ["total spend", 50],
      ["Launch", 5],
    ]);
    expect(dropped).toBe(2);
    expect(data).toHaveLength(3); // header + 2 kept data rows
    expect(data[1][0]).toBe("Summer");
    expect(data[2][0]).toBe("Launch");
  });
});

describe("buildMekariRow", () => {
  it("WA Campaign Logs: summed 'deducted balance' + summed 'broadcast amount'", () => {
    const r = buildMekariRow([
      ["deducted balance", "broadcast amount"],
      [100_000, 2],
      [200_000, 3],
    ], new Date(2026, 8, 16, 9, 30));
    expect(r.warning).toBeUndefined();
    expect(r.jenis).toBe("WA Campaign Logs");
    expect(r.row["Total Interaksi"]).toBe(5);
    expect(r.row["Total Biaya (Rp)"]).toBe("Rp300.000");
    expect(r.row["Periode"]).toBe("periode");
    expect(r.row["Tanggal Input"]).toBe("2026-09-16 09:30");
  });

  it("drops a trailing Total row so it is not double-counted in Campaign mode", () => {
    const r = buildMekariRow([
      ["deducted balance", "broadcast amount"],
      [100_000, 2],
      ["Total", 10],
    ], new Date(2026, 8, 16));
    expect(r.dropped).toBe(1);
    expect(r.row["Total Biaya (Rp)"]).toBe("Rp100.000");
    expect(r.row["Total Interaksi"]).toBe(2);
  });

  it("WA Billing Logs: 'credit' summed, msg count = len(file)", () => {
    const r = buildMekariRow([
      ["credit", "note"],
      [50_000, "a"],
      ["Rp50.000", "b"],
    ], new Date(2026, 8, 16));
    expect(r.jenis).toBe("WA Billing Logs");
    expect(r.row["Total Interaksi"]).toBe(2);
    expect(r.row["Total Biaya (Rp)"]).toBe("Rp100.000");
  });

  it("Manual: first column containing 'biaya', cleanIdr sum", () => {
    const r = buildMekariRow([
      ["nama", "biaya"],
      ["a", "Rp1.000"],
      ["b", "2.000"],
    ], new Date(2026, 8, 16));
    expect(r.jenis).toBe("Manual");
    expect(r.row["Total Interaksi"]).toBe(2);
    expect(r.row["Total Biaya (Rp)"]).toBe("Rp3.000");
  });

  it("Manual with no 'biaya' column -> warning (abort)", () => {
    const r = buildMekariRow([["naam", "costx"], [1, 2]], new Date(2026, 8, 16));
    expect(r.warning).toBe("Kolom biaya tidak dikenali dalam file ini.");
  });

  it("todayStamp formats YYYY-MM-DD HH:MM", () => {
    expect(todayStamp(new Date(2026, 8, 5, 7, 3))).toBe("2026-09-05 07:03");
  });
});

describe("parseFileToAoa (browser file parsing)", () => {
  it("parses CSV into an array-of-arrays (header row first)", async () => {
    const file = new File(["a,b\n1,2\n"], "report.csv", { type: "text/csv" });
    const aoa = await parseFileToAoa(file);
    expect(aoa).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("parses XLSX into an array-of-arrays", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["deducted balance", "broadcast amount"], [100_000, 2]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const file = new File([new Uint8Array(buf)], "report.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const aoa = await parseFileToAoa(file);
    expect(aoa[0]).toEqual(["deducted balance", "broadcast amount"]);
    expect(aoa[1][0]).toBe(100_000);
  });
});

// --- Rendering (react-dom/server, no browser) -------------------------------

const FIXTURE_METRICS = { spend: 1_000_000, leads: 2, closing: 1, cac: 1_000_000, roas: 25.99, omzet: 12_995_000 };

describe("AdsDashboard (react-dom/server)", () => {
  const base = {
    tiktokRows: [{ Cost: "500.000" }],
    metaRows: [] as Row[],
    mekariRows: [] as Row[],
    waRows: [{ Sumber: "Tiktok Ads", Status: "Closing" }],
    metrics: FIXTURE_METRICS,
    columns: { tiktok: COLS_T, meta: COLS_M, mekari: COLS_K },
  };

  it("renders hero, ROI overview, tabs and per-platform KPIs", () => {
    const html = renderToStaticMarkup(<AdsDashboard {...base} role="viewer" />);
    expect(html).toContain("Ads Performance");
    expect(html).toContain("Ringkasan ROI");
    expect(html).toContain("Total Spend");
    expect(html).toContain("TikTok");
    expect(html).toContain("Meta/IG");
    expect(html).toContain("Mekari");
    expect(html).toContain("KPI TikTok");
    expect(html).toContain("Import data TikTok");
    expect(html).toContain("Refresh Data");
  });

  it("hides clear controls for a viewer and shows them for an editor", () => {
    const viewer = renderToStaticMarkup(<AdsDashboard {...base} role="viewer" />);
    const editor = renderToStaticMarkup(<AdsDashboard {...base} role="editor" />);
    expect(viewer).not.toContain("Kosongkan tab TikTok");
    expect(editor).toContain("Kosongkan tab TikTok");
  });

  it("renders ROI scalars with '—' when metrics are empty (all-zero)", () => {
    const empty = { ...base, metrics: { spend: 0, leads: 0, closing: 0, cac: 0, roas: 0, omzet: 0 } };
    const html = renderToStaticMarkup(<AdsDashboard {...empty} role="viewer" />);
    // Mirrors the Overview route's degraded "—" handling for empty data.
    expect(html).toContain("—");
  });
});