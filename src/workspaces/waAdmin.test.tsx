import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WaAdminDashboard } from "@/workspaces/WaAdminDashboard";
import { WebsiteDashboard } from "@/workspaces/WebsiteDashboard";
import {
  junkFiltered,
  normalizeStatuses,
  statusColumn,
  deriveWaAdminStats,
  closingCount,
  monthlyTrend,
  picBreakdown,
  mekariTagBreakdown,
  statusOptions,
  detailColumns,
  toCsv,
  csvFilename,
  monthOptions,
  filterByMonth,
  closingRows,
  categoryRows,
  salesProgressRows,
  futureProspectRows,
  asalBreakdown,
  buildTreemap,
} from "@/workspaces/waAdmin";
import { parseCSV } from "@/lib/csv";
import type { Row } from "@/server/adapter/source";

/** Exact wa_admin declared status column (V3 last "Status" col, not "Mekari"). */
const STATUS = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const SUMBER = "Sumber (Ads/Organik/Sales)";

/** NOW pin: September 2026 (current-year trend filter keyed to this). */
const NOW = new Date(2026, 8, 15); // 2026-09-15

function waRow(partial: Partial<Row>): Row {
  return {
    f: 1,
    "Tanggal Masuk": "",
    "No Hp": "",
    "Jam Chat Masuk": "",
    PIC: "",
    Nama: "",
    Asal: "",
    [SUMBER]: "",
    Pertanyaan: "",
    "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "",
    "Mekari Tag": "",
    [STATUS]: "",
    "Keterangan Admin": "",
    Database: "",
    ...partial,
  };
}

const KATEG = "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)";

const FIXTURE: Row[] = [
  // r1: junk via "Mekari Tag" -> dropped from funnel, BUT status "Closing"
  // counts toward Closing (measured pre-junk, REVISI 2026-09).
  waRow({ f: 1, "Tanggal Masuk": "01/09/2026", Nama: "A", PIC: "BELIA", "Mekari Tag": "partnership", [STATUS]: "Closing" }),
  // r2: kept, STATUS "CLOSING" -> counts as closing
  waRow({ f: 2, "Tanggal Masuk": "10/09/2026", Nama: "B", PIC: "BELIA", [SUMBER]: "Organik", [KATEG]: "Pendaftaran", "Mekari Tag": "Cold Lead", [STATUS]: "CLOSING" }),
  // r3: junk via "Kategori" exact-name too -> dropped
  waRow({ f: 3, "Tanggal Masuk": "15/08/2026", Nama: "C", [SUMBER]: "Ads", "Mekari Tag": "alumni", [KATEG]: "persyaratan", [STATUS]: "Follow Up" }),
  // r4: kept, blank status -> "Belum Terupdate", "nan" source excluded
  waRow({ f: 4, "Tanggal Masuk": "20/09/2026", Nama: "D", PIC: "DEA", Asal: "", [SUMBER]: "nan", [KATEG]: "Biaya", [STATUS]: "" }),
  // r5: kept, parseable-only exclusion from trend
  waRow({ f: 5, "Tanggal Masuk": "not-a-date", Nama: "E", PIC: "BELIA", [SUMBER]: "Sales", [KATEG]: "", [STATUS]: "Interview" }),
  // r6: Mekari Tag EXACT "Closed - Registered" -> junk-dropped from prepared.
  // Blank status => does NOT count toward Closing (REVISI: status-based).
  waRow({ f: 6, "Tanggal Masuk": "05/09/2026", Nama: "F", PIC: "EJAK", [KATEG]: "Lainnya", "Mekari Tag": "Closed - Registered", [STATUS]: "" }),
];

describe("waAdmin derivations (V3 4_WA_Admin.py parity + REVISI FITUR 2026-09)", () => {
  it("junk filter drops only rows whose present Mekari Tag / Kategori matches", () => {
    const kept = junkFiltered(FIXTURE);
    expect(kept).toHaveLength(3);
    expect(kept.map((r) => r.f)).toEqual([2, 4, 5]);
    // r6 "Closed - Registered" IS junk-dropped from the visible funnel (JUNK_TAGS
    // has "closed - registered"), but a "Kategori (...)"-suffixed column (not exact
    // "Kategori") does NOT fire the junk filter.
    const suffixed = junkFiltered([
      waRow({ "Mekari Tag": "ok", "Kategori (Persyaratan/Biaya/Loker/dll)": "partnership" }),
    ]);
    expect(suffixed).toHaveLength(1);
  });

  it("junk filter is a no-op when neither junk column is present", () => {
    const rows = [{ Nama: "X", [STATUS]: "Closing" }];
    expect(junkFiltered(rows)).toHaveLength(1);
  });

  it("resolves the status col as the last non-Mekari column containing Status", () => {
    expect(statusColumn(FIXTURE)).toBe(STATUS);
    const withMekariStatus = [
      { "Mekari Tag (Status Terakhir)": "x", "Status": "Closing" },
    ];
    expect(statusColumn(withMekariStatus)).toBe("Status");
  });

  it("normalizes blank statuses to Belum Terupdate", () => {
    const col = statusColumn(FIXTURE)!;
    const normalized = normalizeStatuses(junkFiltered(FIXTURE), col);
    const byF = Object.fromEntries(normalized.map((r) => [r.f, String(r[col])]));
    expect(byF[2]).toBe("CLOSING");
    expect(byF[4]).toBe("Belum Terupdate");
    expect(byF[6]).toBeUndefined();
    const blank = normalizeStatuses(junkFiltered([waRow({ [STATUS]: "" })]), col);
    expect(String(blank[0][col])).toBe("Belum Terupdate");
  });

  it("computes KPIs: total / closing / conversion(1dp) / closing-target (status-based closing)", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    expect(s.total).toBe(3); // r2, r4, r5 (r1/r3/r6 junk-dropped from funnel)
    expect(s.closing).toBe(2); // r1 + r2: STATUS == "closing" (case-insens), pre-junk
    expect(s.conversionLabel).toBe("66.7%");
    expect(s.closingTargetLabel).toBe("2/45");
  });

  it("closingCount counts only STATUS == closing (case-insens after trim), over all rows", () => {
    // Closing, CLOSING, "  closing " all count; non-closing statuses and empty do not.
    expect(closingCount(FIXTURE)).toBe(2);
    expect(
      closingCount([
        waRow({ [STATUS]: "Closing", "Mekari Tag": "Closed - Registered" }),
        waRow({ [STATUS]: "closing", "Mekari Tag": "" }),
        waRow({ [STATUS]: "  CLOSING  ", "Mekari Tag": "x" }),
        waRow({ [STATUS]: "Not Closing", "Mekari Tag": "Closed - Registered" }),
        waRow({ [STATUS]: "" }),
      ]),
    ).toBe(3);
    expect(closingCount([])).toBe(0);
  });

  it("conversion is an em-dash when there are no leads", () => {
    const empty = deriveWaAdminStats([], NOW);
    expect(empty.conversionLabel).toBe("—");
    expect(empty.total).toBe(0);
  });

  it("monthly trend keeps only the current year, labeled MMM YYYY, sorted", () => {
    expect(monthlyTrend(junkFiltered(FIXTURE), NOW)).toEqual([
      { period: "2026-09", label: "Sep 2026", leads: 2 },
    ]);
    const past = deriveWaAdminStats(
      [{ "Tanggal Masuk": "15/08/2025", [STATUS]: "x" }],
      NOW,
    );
    expect(past.trend).toEqual([]);
  });

  it("status distribution counts normalized statuses, count-descending", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    const byName = Object.fromEntries(s.statusDist.map((d) => [d.name, d.n]));
    expect(byName).toEqual({ CLOSING: 1, "Belum Terupdate": 1, Interview: 1 });
  });

  it("source breakdown excludes empty and nan, uses first Sumber column", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    expect(s.sources.col).toBe(SUMBER);
    const byName = Object.fromEntries(s.sources.sources.map((x) => [x.name, x.n]));
    expect(byName).toEqual({ Organik: 1, Sales: 1 }); // r6 has blank Sumber, r4 "nan" excluded
    const noSource = deriveWaAdminStats([{ Nama: "X", [STATUS]: "Closing" }], NOW);
    expect(noSource.sources.col).toBeUndefined();
    expect(noSource.sources.sources).toEqual([]);
  });

  it("Pesan Total Per PIC groups by actual PIC values, excludes empty, count-desc", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    const byName = Object.fromEntries(s.picDist.map((x) => [x.name, x.n]));
    expect(byName).toEqual({ BELIA: 2, DEA: 1 });
    expect(s.picDist.map((p) => p.name)).not.toContain("Hana");
    expect(picBreakdown([])).toEqual([]);
  });

  it("Mekari Tag chart uses actual tag values, excludes empty", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    const byName = Object.fromEntries(s.mekariDist.map((x) => [x.name, x.n]));
    expect(byName).toEqual({ "Cold Lead": 1 }); // r1/r3/r6 junk-dropped
    expect(mekariTagBreakdown([])).toEqual([]);
  });

  it("Pembagian Intensi Pesan groups by the actual Kategori column (suffixed live header)", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    expect(s.kategoriCol).toBe(KATEG);
    const byName = Object.fromEntries(s.kategoriDist.map((x) => [x.name, x.n]));
    expect(byName).toEqual({ Pendaftaran: 1, Biaya: 1 });
    expect(byName["Lainnya"]).toBeUndefined();
  });

  it("status options exclude empty/nan and are sorted", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    expect(statusOptions(s.rows, s.statusCol)).toEqual(["Belum Terupdate", "CLOSING", "Interview"]);
  });

  it("detail columns include the Mekari Tag addition over present V3 desirables", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    expect(detailColumns(s.rows, s.statusCol)).toEqual([
      "Tanggal Masuk", "Nama", "No Hp", "Asal", "Mekari Tag", STATUS,
    ]);
  });
});

describe("CSV export (utf-8-sig BOM)", () => {
  it("serializes all junk-filtered rows with a BOM and roundtrips via parseCSV", () => {
    const s = deriveWaAdminStats(FIXTURE, NOW);
    const csv = toCsv(s.rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parseCSV(csv);
    expect(rows.length).toBe(1 + s.rows.length);
    expect(rows[0]).toContain(STATUS);
    const names = rows.slice(1).map((r) => r[rows[0].indexOf("Nama")]);
    expect(names).toEqual(["B", "D", "E"]);
  });

  it("produces the V3 filename wa_admin_YYYYMMDD.csv", () => {
    expect(csvFilename(NOW)).toBe("wa_admin_20260915.csv");
  });
});

describe("WaAdminDashboard (react-dom/server, no browser)", () => {
  const columns = [
    "f", "Tanggal Masuk", "No Hp", "Jam Chat Masuk", "PIC", "Nama", "Asal",
    SUMBER, "Pertanyaan", KATEG, "Mekari Tag", STATUS, "Keterangan Admin", "Database",
  ];

  it("renders header, registration bands and export section (Analisis folded by default)", () => {
    const html = renderToStaticMarkup(<WaAdminDashboard rows={FIXTURE} columns={columns} />);
    expect(html).toContain("WhatsApp Admin");
    expect(html).toContain("Ringkasan Pendaftaran");
    expect(html).toContain("Filter Tahun");
    expect(html).toContain("Total Pendaftar");
    expect(html).toContain("Analisis WhatsApp Admin");
    expect(html).toContain("Refresh Data");
  });

  it("renders the folded Analisis band's preserved content when opened (initialAnalisisOpen)", () => {
    const html = renderToStaticMarkup(<WaAdminDashboard rows={FIXTURE} columns={columns} initialAnalisisOpen />);
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Total Pesan");
    expect(html).toContain("66.7%");
    expect(html).toContain("2/45");
    expect(html).toContain("Pesan Total Per PIC");
    expect(html).toContain("Mekari Tag");
    expect(html).toContain("Pembagian Intensi Pesan");
    expect(html).toContain("Distribusi Status");
    expect(html).toContain("Unduh Data (CSV)");
  });

  it("renders the post-junk empty state when every row is junked", () => {
    const allJunk = [waRow({ "Mekari Tag": "double chat", [STATUS]: "x" })];
    const html = renderToStaticMarkup(<WaAdminDashboard rows={allJunk} columns={columns} initialAnalisisOpen />, {});
    expect(html).toContain("Semua data berisi kategori yang dikecualikan.");
  });

  it("keeps the /website visual shell tokens (UI parity, widened to 1720/1700)", () => {
    const wa = renderToStaticMarkup(<WaAdminDashboard rows={FIXTURE} columns={columns} />);
    const site = renderToStaticMarkup(
      <WebsiteDashboard rows={[]} columns={[]} onRefresh={() => {}} />,
    );
    expect(wa).toContain("max-w-[1720px] px-4 sm:px-6 lg:px-8");
    expect(wa).toContain("max-w-[1700px]");
    expect(wa).toContain("text-[1.7rem] font-extrabold");
    expect(wa).toContain("text-[0.78rem] font-bold uppercase");
    expect(wa).toContain("dm-metric");
    expect(site).toContain("max-w-[1240px] px-4 sm:px-6");
  });

  it("renders the monthly filter, treemap and the four operational tables (initialAnalisisOpen)", () => {
    const html = renderToStaticMarkup(<WaAdminDashboard rows={FIXTURE} columns={columns} initialAnalisisOpen />);
    expect(html).toContain("Filter Bulan");
    expect(html).toContain("Semua Bulan");
    expect(html).toContain("Tabel Operasional");
    expect(html).toContain("CLOSING");
    expect(html).toContain("SALES PROGRESS");
    expect(html).toContain("PENDING FORM - L1");
    expect(html).toContain("FUTURE PROSPECT");
    expect(html).toContain("Tag Asal");
  });
});

describe("WA Admin operational categories + month filter + treemap (REVISI 2026-09)", () => {
  const catRows = [
    // closing (green) — only via STATUS == "closing"
    waRow({ f: 1, "Tanggal Masuk": "10/09/2026", "Mekari Tag": "Cold Lead", Asal: "Instagram", [STATUS]: "Closing" }),
    waRow({ f: 8, "Tanggal Masuk": "17/09/2026", "Mekari Tag": "Closed - Registered", Asal: "TikTok", [STATUS]: "CLOSING" }),
    // sales progress (blue) — via STATUS == "sales progress"
    waRow({ f: 2, "Tanggal Masuk": "11/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Sales Progress", Asal: "Instagram" }),
    waRow({ f: 3, "Tanggal Masuk": "12/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Interview", Asal: "TikTok" }),
    // pending form L1 (orange) — live value "Pending Registration"
    waRow({ f: 4, "Tanggal Masuk": "13/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Pending Registration", Asal: "Instagram" }),
    // future prospect (pink) — via MEKARI TAG == "future prospect"
    waRow({ f: 5, "Tanggal Masuk": "14/09/2026", "Mekari Tag": "Future Prospect", [STATUS]: "No Response", Asal: "" }),
    waRow({ f: 9, "Tanggal Masuk": "18/09/2026", "Mekari Tag": "future prospect", [STATUS]: "", Asal: "Website" }),
    // unmatched -> no palette
    waRow({ f: 6, "Tanggal Masuk": "15/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Lainnya", Asal: "Website" }),
    waRow({ f: 7, "Tanggal Masuk": "16/09/2026", "Mekari Tag": "Future Prospect", [STATUS]: "No Response", Asal: "TikTok" }),
  ];

  it("derives closing by STATUS, sales progress by STATUS, future prospect by MEKARI TAG", () => {
    const s = deriveWaAdminStats(catRows, NOW);
    // closing = STATUS "closing"/"CLOSING" (pre-junk) => r1, r8
    expect(s.closing).toBe(2);
    expect(s.closingRows.map((r) => r.f)).toEqual([1, 8]);
    // sales progress = STATUS "sales progress" => r2 (r3=Interview NOT included)
    expect(s.salesProgress.map((r) => r.f)).toEqual([2]);
    // future prospect = MEKARI TAG "future prospect" (case-insens) => r5, r9, r7
    expect(s.futureProspect.map((r) => r.f).sort()).toEqual([5, 7, 9]);
    // pending form = status "Pending Registration" => r4
    expect(s.pendingForm.map((r) => r.f)).toEqual([4]);
  });

  it("closingRows matches STATUS == closing case-insensitively, table==KPI", () => {
    const s = deriveWaAdminStats(catRows, NOW);
    expect(s.closingRows.length).toBe(s.closing);
    expect(
      closingRows([
        waRow({ [STATUS]: "Closing" }),
        waRow({ [STATUS]: "closing" }),
        waRow({ [STATUS]: "CLOSING" }),
        waRow({ [STATUS]: "Not" }),
      ]),
    ).toHaveLength(3);
    expect(closingRows([])).toEqual([]);
  });

  it("salesProgressRows = EXACT STATUS 'sales progress' (no Mekari proxy)", () => {
    const rows = [
      waRow({ f: 1, [STATUS]: "Sales Progress", "Mekari Tag": "Future Prospect" }), // matches status
      waRow({ f: 2, [STATUS]: "sales progress" }),                                   // case-insens
      waRow({ f: 3, [STATUS]: "  SALES PROGRESS  " }),                               // trimmed
      waRow({ f: 4, [STATUS]: "Sales Progress Extra" }),                             // no substring
      waRow({ f: 5, [STATUS]: "Follow Up", "Mekari Tag": "Sales Progress" }),        // wrong status
    ];
    expect(salesProgressRows(rows).map((r) => r.f)).toEqual([1, 2, 3]);
    expect(salesProgressRows([])).toEqual([]);
  });

  it("futureProspectRows = EXACT MEKARI TAG 'future prospect' (case-insens), no status proxy", () => {
    const rows = [
      waRow({ f: 1, "Mekari Tag": "Future Prospect", [STATUS]: "No Response" }), // matches tag
      waRow({ f: 2, "Mekari Tag": "future prospect" }),
      waRow({ f: 3, "Mekari Tag": "FUTURE PROSPECT" }),
      waRow({ f: 4, "Mekari Tag": "Future Prospect - Extra" }), // no substring
      waRow({ f: 5, "Mekari Tag": "Cold Lead", [STATUS]: "No Response" }), // wrong tag
    ];
    expect(futureProspectRows(rows).map((r) => r.f)).toEqual([1, 2, 3]);
    expect(futureProspectRows([])).toEqual([]);
  });

  it("derive stats drives Future Prospect from MEKARI TAG over source rows", () => {
    const tag = [
      waRow({ "Tanggal Masuk": "10/09/2026", "Mekari Tag": "Future Prospect", [STATUS]: "No Response" }),
      waRow({ "Tanggal Masuk": "12/09/2026", "Mekari Tag": "Future Prospect" }),
      waRow({ "Tanggal Masuk": "13/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "No Response" }),
    ];
    const s = deriveWaAdminStats(tag, NOW, "2026-09");
    expect(s.futureProspect).toHaveLength(2);
    expect(s.futureProspect.some((r) => String(r["Mekari Tag"]).trim().toLowerCase() !== "future prospect")).toBe(false);
  });

  it("categoryRows handles only pendingForm; closing/salesProgress/futureProspect return []", () => {
    expect(categoryRows(catRows, STATUS, "closing")).toEqual([]);
    expect(categoryRows(catRows, STATUS, "salesProgress")).toEqual([]);
    expect(categoryRows(catRows, STATUS, "futureProspect")).toEqual([]);
    expect(categoryRows(catRows, undefined, "pendingForm")).toEqual([]);
  });

  it("operational table columns reuse the shared set, status last", () => {
    const s = deriveWaAdminStats(catRows, NOW);
    const cols = s.operationalCols;
    expect(cols).toContain("Tanggal Masuk");
    expect(cols).toContain("Nama");
    expect(cols).toContain("No Hp");
    expect(cols).toContain("Asal");
    expect(cols).toContain("PIC");
    expect(cols).toEqual([...cols.slice(0, -1), STATUS]); // status is last
  });

  it("monthOptions lists distinct YYYY-MM labelled MMMM YYYY, ascending", () => {
    const m = monthOptions(catRows);
    expect(m).toEqual([{ period: "2026-09", label: "September 2026" }]);
    const two = monthOptions([
      waRow({ "Tanggal Masuk": "01/11/2026" }),
      waRow({ "Tanggal Masuk": "20/09/2026" }),
      waRow({ "Tanggal Masuk": "not-a-date" }),
    ]);
    expect(two.map((x) => x.period)).toEqual(["2026-09", "2026-11"]);
    expect(two[1].label).toBe("November 2026");
    expect(monthOptions([])).toEqual([]);
  });

  it("filterByMonth keeps only rows whose Tanggal Masuk falls in the period", () => {
    const rows = [
      waRow({ "Tanggal Masuk": "15/09/2026", Nama: "A" }),
      waRow({ "Tanggal Masuk": "02/10/2026", Nama: "B" }),
      waRow({ "Tanggal Masuk": "not-a-date", Nama: "C" }),
    ];
    expect(filterByMonth(rows, "2026-09").map((r) => r.Nama)).toEqual(["A"]);
    expect(filterByMonth(rows, "2026-10").map((r) => r.Nama)).toEqual(["B"]);
    expect(filterByMonth(rows, "2026-11")).toEqual([]);
  });

  it("deriveWaAdminStats(month) filters KPIs, categories AND closing, but months stays global", () => {
    const monthly = [
      waRow({ "Tanggal Masuk": "10/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Sales Progress" }),
      waRow({ "Tanggal Masuk": "05/10/2026", "Mekari Tag": "Future Prospect" }),
      waRow({ "Tanggal Masuk": "12/09/2026", "Mekari Tag": "Cold Lead", [STATUS]: "Closing" }),
    ];
    const sep = deriveWaAdminStats(monthly, NOW, "2026-09");
    expect(sep.total).toBe(2);           // Cold Lead (SP) + Cold Lead (Closing)
    expect(sep.closing).toBe(1);         // Sept Closing
    expect(sep.salesProgress).toHaveLength(1); // Sept Sales Progress
    const oct = deriveWaAdminStats(monthly, NOW, "2026-10");
    expect(oct.total).toBe(1);
    expect(oct.closing).toBe(0);
    expect(oct.salesProgress).toHaveLength(0);
    expect(oct.futureProspect).toHaveLength(1); // Oct Future Prospect tag
    const all = deriveWaAdminStats(monthly, NOW);
    expect(all.total).toBe(3);
    expect(all.closing).toBe(1);
    expect(all.salesProgress).toHaveLength(1);
    expect(all.futureProspect).toHaveLength(1);
    expect(all.months.map((m) => m.period)).toEqual(["2026-09", "2026-10"]);
  });

  it("asalBreakdown shows every valid Asal value and EXCLUDES empty/null/nan", () => {
    const rows = [
      waRow({ Asal: "Instagram" }),
      waRow({ Asal: "tiktok" }),
      waRow({ Asal: "" }),
      waRow({ Asal: "nan" }),
      waRow({ Asal: "Instagram" }),
      waRow({ Asal: "  " }),
    ];
    const items = asalBreakdown(rows);
    expect(items).toEqual([
      { name: "Instagram", n: 2 },
      { name: "tiktok", n: 1 },
    ]);
    for (const it of items) {
      expect(["Onbekend", "Andere", "Unknown", "Other"]).not.toContain(it.name);
    }
    expect(asalBreakdown([])).toEqual([]);
  });

  it("asalBreakdown keeps ALL valid categories — never caps or aggregates into Andere", () => {
    const many = Array.from({ length: 12 }, (_, i) => waRow({ Asal: `Src${i}` }));
    const items = asalBreakdown(many);
    expect(items.map((x) => x.name)).toEqual(Array.from({ length: 12 }, (_, i) => `Src${i}`));
    expect(items).toHaveLength(12);
    expect(items.every((x) => x.n === 1)).toBe(true);
    expect(items.some((x) => x.name === "Andere")).toBe(false);
  });

  it("buildTreemap packs items into a full W×H viewBox, area ∝ n", () => {
    const rects = buildTreemap([{ name: "A", n: 3 }, { name: "B", n: 1 }], 100, 50);
    expect(rects).toHaveLength(2);
    const area = rects.reduce((s, r) => s + r.w * r.h, 0);
    expect(area).toBe(100 * 50);
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
    const a = rects.find((r) => r.name === "A")!;
    expect((a.w * a.h) / (100 * 50)).toBeCloseTo(0.75, 6);
    expect(buildTreemap([], 100, 50)).toEqual([]);
  });
});