import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { selectionSummary, RowDetailDrawer } from "@/workspaces/sosmedUiShared";
import { SosmedPlanningDashboard } from "@/workspaces/SosmedPlanningDashboard";
import { SosmedReportingDashboard } from "@/workspaces/SosmedReportingDashboard";
import { SosmedLanding } from "@/workspaces/SosmedLanding";
import {
  SOSMED_BOOL_COLS,
  SOSMED_TEXT_COLS,
  SOSMED_EDITABLE_TEXT_COLS,
  deadlineMonth,
  diffPatches,
  filterRows,
  filterSosmedRows,
  isDone,
  isOverdue,
  isVideo,
  latestDeadlineMonthSet,
  prevDeadlineMonthSet,
  picOptions,
  sosmedMetrics,
  sosmedMonths,
  truthy,
  workload,
  actionRequired,
  calendarDefaultMonth,
  contentStrategy,
  deadlineDate,
  deadlineMonitor,
  distinctValues,
  outputTrend,
  picWorkload,
  productionFunnel,
  productionOverview,
  publishingTracker,
  stageOf,
  statusBreakdown,
  type SosmedFilters,
} from "@/workspaces/sosmed";
import { updateCellController } from "@/server/api/tableControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { makeFakeSource, makeSession } from "@/server/api/testHelpers";
import { columnsFor } from "@/server/adapter/schema";
import type { Row } from "@/server/adapter/source";

/* ---------------------------------------------------------------------------
 * Fixture rows mirror the declared SOSMED schema + the V3 metrics examples.
 * ------------------------------------------------------------------------ */
function row(partial: Partial<Row>): Row {
  return { ...partial };
}

const FIXTURE: Row[] = [
  row({ "Kode Konten": "K1", "Tanggal Posting": "05/09/2026", "Tanggal Deadline": "18/09/2026", Output: "Video Reels", PIC: "Ejak", "Judul Konten": "J1", PROSES: "DONE", IG: "V", YT: "1", TIKTOK: true }),
  row({ "Kode Konten": "K2", "Tanggal Posting": "10/09/2026", "Tanggal Deadline": "25/09/2026", Output: "Design Feed", PIC: "Hana", "Judul Konten": "J2", PROSES: "DONE", IG: "V", YT: "2", TIKTOK: false }),
  row({ "Kode Konten": "K3", "Tanggal Posting": "15/09/2026", "Tanggal Deadline": "02/10/2026", Output: "Video Youtube", PIC: "Ejak", "Judul Konten": "J3", PROSES: "PENDING", IG: "V", YT: "", TIKTOK: false }),
  row({ "Kode Konten": "K4", "Tanggal Posting": "02/10/2026", "Tanggal Deadline": "05/10/2026", Output: "Static", PIC: "Abi", "Judul Konten": "J4", PROSES: "DONE", IG: "checked", YT: "V", TIKTOK: "yes" }),
  row({ "Kode Konten": "K5", "Tanggal Posting": "bad-date", "Tanggal Deadline": "bad-date", Output: "Video", PIC: "Hana", "Judul Konten": "J5", PROSES: "DONE", IG: "V", YT: "V", TIKTOK: "V" }),
];

describe("sosmed derivations (grouping by BULAN DEADLINE)", () => {
  it("derives the DEADLINE month label from Tanggal Deadline (not posting)", () => {
    expect(deadlineMonth(FIXTURE[0])).toBe("September 2026"); // posting 05/09, deadline 18/09
    expect(deadlineMonth(FIXTURE[2])).toBe("October 2026");   // posting 15/09, deadline 02/10
    expect(deadlineMonth(FIXTURE[4])).toBe(""); // unparseable -> graceful ""
  });

  it("returns distinct DEADLINE months in appearance order (bad-date skipped)", () => {
    expect(sosmedMonths(FIXTURE)).toEqual(["September 2026", "October 2026"]);
  });

  it("picOptions = sorted distinct non-null PIC values", () => {
    expect(picOptions(FIXTURE)).toEqual(["Abi", "Ejak", "Hana"]);
  });

  it("picOptions falls back to sorted PIC_LIST when PIC column absent", () => {
    const noPic = FIXTURE.map((r) => {
      const out: Row = {};
      for (const k of Object.keys(r)) if (k !== "PIC") out[k] = r[k];
      return out;
    });
    expect(picOptions(noPic)).toEqual(["Abi", "Angel", "Ejak", "Hana"]);
  });

  it("truthy matches V3 _truthy keyword set for bool strings", () => {
    for (const v of ["V", "v", "TRUE", "1", "YES", "checked"]) expect(truthy(v)).toBe(true);
    expect(truthy("no")).toBe(false);
    expect(truthy("")).toBe(false);
    expect(truthy(null)).toBe(false);
    expect(truthy(undefined)).toBe(false);
    expect(truthy(true)).toBe(true);
    expect(truthy(false)).toBe(false);
  });

  it("isDone / isVideo match V3 semantics", () => {
    expect(isDone(FIXTURE[0])).toBe(true);   // "DONE"
    expect(isDone(FIXTURE[2])).toBe(false);  // "PENDING"
    expect(isVideo(FIXTURE[0])).toBe(true);  // "Video Reels"
    expect(isVideo(FIXTURE[1])).toBe(false); // "Design Feed"
  });

  it("filterSosmedRows keeps PIC selection then DEADLINE-month selection, default-all default", () => {
    const all = filterSosmedRows(FIXTURE, new Set(["Abi", "Ejak", "Hana"]), new Set(["September 2026", "October 2026"]));
    // PIC: Ejak/Hana/Abi (K1,K2,K3,K4); Sept+Oct deadline filter drops K5 bad-date -> K1,K2,K3,K4 remaining
    expect(all.map((r) => r["Kode Konten"])).toEqual(["K1", "K2", "K3", "K4"]);

    const octOnly = filterSosmedRows(FIXTURE, new Set(["Ejak"]), new Set(["October 2026"]));
    // Ejak rows: K1 (deadline Sept), K3 (deadline Oct) -> only K3 in October by DEADLINE
    expect(octOnly.map((r) => r["Kode Konten"])).toEqual(["K3"]);
  });

  it("groups by DEADLINE month, NOT posting month (posting Sept, deadline Oct -> October)", () => {
    // K3: posting 15/09/2026 but deadline 02/10/2026 -> must fall in October by deadline.
    const oct = filterSosmedRows(FIXTURE, new Set(["Ejak", "Hana", "Abi"]), new Set(["October 2026"]));
    expect(oct.map((r) => r["Kode Konten"])).toEqual(["K3", "K4"]);
    // September by deadline holds K1 (18/09 deadline) & K2 (25/09 deadline), NOT K3.
    const sept = filterSosmedRows(FIXTURE, new Set(["Ejak", "Hana", "Abi"]), new Set(["September 2026"]));
    expect(sept.map((r) => r["Kode Konten"])).toEqual(["K1", "K2"]);
  });

  it("skips the month filter entirely when NO month is derivable (V3 if months: branch)", () => {
    const noDate = FIXTURE.map((r) => ({ ...r, "Tanggal Deadline": "n/a" }));
    const all = filterSosmedRows(noDate, new Set(["Abi", "Ejak", "Hana"]), new Set());
    // month set ignored; only PIC filter applied -> all 5 rows (n/a month not in selection anyway)
    expect(all.map((r) => r["Kode Konten"])).toEqual(["K1", "K2", "K3", "K4", "K5"]);
  });

  it("computes V3 key metrics over filtered rows", () => {
    const m = sosmedMetrics([FIXTURE[0], FIXTURE[1], FIXTURE[2], FIXTURE[3]]);
    expect(m.total).toBe(4);
    expect(m.done).toBe(3); // K1,K2,K4
    // video rows: K1 (Video Reels), K3 (Video Youtube) -> 2; done video: K1
    expect(m.videoLabel).toBe("1/2");
    // design rows: K2, K4 -> 2; done design: K2,K4 -> 2
    expect(m.designLabel).toBe("2/2");
    // hutang done & ~post_done:
    // K1 done, IG ok, YT "1"(ok), TIKTOK true(ok)
    // K2 done, IG ok, YT "2"(false), TIKTOK false -> TikTok debt, but design so no YT debt
    // K4 done, IG checked(ok), YT V(ok), TIKTOK yes(ok)
    expect(m.hutangIg).toBe(0);
    // Hutang YT = done & video & ~post_done.YT; video done row = K1, K1 YT truthy -> 0
    expect(m.hutangYt).toBe(0);
    expect(m.hutangTiktok).toBe(1); // K2 (done & ~post_done.TIKTOK)
  });

  it("workload computes Selesai (DONE) vs Hutang per selected PIC present", () => {
    const wl = workload([FIXTURE[0], FIXTURE[1], FIXTURE[2], FIXTURE[3]], ["Ejak", "Hana", "Abi"]);
    const byPic = Object.fromEntries(wl.map((w) => [w.pic, w]));
    expect(byPic.Ejak.selesai).toBe(1); // K1
    expect(byPic.Ejak.hutang).toBe(1);  // K3 pending
    expect(byPic.Hana.selesai).toBe(1);  // K2
    expect(byPic.Hana.hutang).toBe(0);
    expect(byPic.Abi.selesai).toBe(1);   // K4
    expect(byPic.Abi.hutang).toBe(0);
  });
});

describe("INLINE EDITOR diff — writes PATCH only for changed cells", () => {
  it("sends NO patch when the working draft equals the original", () => {
    const full = draftFor([FIXTURE[0]]);
    expect(diffPatches([FIXTURE[0]], full)).toEqual([]);
  });

  it("diffs one bool cell -> ONE patch with a REAL boolean (not 'true'/'false')", () => {
    const full = draftFor([FIXTURE[0]]);
    full[0]["YT"] = false; // original YT '1' truthy=true -> toggle to false
    const patches = diffPatches([FIXTURE[0]], full);
    expect(patches).toEqual([{ rowIndex: 0, column: "YT", value: false }]);
    expect(typeof patches[0].value).toBe("boolean");
  });

  it("sends patches only for CHANGED cells only — unchanged cells produce no request", () => {
    const rows = [FIXTURE[0], FIXTURE[1]];
    const full = draftFor(rows);
    // change K1 PROSES -> DONE but it's already DONE? K1 PROSES is DONE already.
    // Change K2's PIC and K1's IG to a new real bool.
    full[0]["IG"] = false;   // K1 IG 'V' truthy true -> false (changed)
    full[1]["IG"] = true;    // K1... K2 IG 'V' -> stays true (unchanged) -> no patch
    full[1]["PIC"] = "Ejak"; // K2 PIC Hana -> Ejak (changed)
    const patches = diffPatches(rows, full);
    // Only 2 patches: K1.IG(false), K2.PIC('Ejak'). Everything else unchanged.
    expect(patches).toHaveLength(2);
    expect(patches[0]).toEqual({ rowIndex: 0, column: "IG", value: false });
    expect(patches[1]).toEqual({ rowIndex: 1, column: "PIC", value: "Ejak" });
    expect(typeof patches[0].value).toBe("boolean");
  });

  it("trims text patches and skips empty/null new values", () => {
    const rows = [FIXTURE[0]];
    const full = draftFor(rows);
    full[0]["PROSES"] = "  done  "; // original "DONE" -> trims to "done" (changed)
    const patches = diffPatches(rows, full);
    expect(patches).toEqual([{ rowIndex: 0, column: "PROSES", value: "done" }]);

    // empty new value is skipped (V3 `if pd.isna(new): continue`)
    const full2 = draftFor(rows);
    full2[0]["PIC"] = "";
    expect(diffPatches(rows, full2)).toEqual([]);
  });

  it("keeps rowIndex = ORIGINAL (unfiltered) index even when filter empties", () => {
    const rows = [FIXTURE[0], FIXTURE[1], FIXTURE[2]];
    const full = draftFor(rows);
    full[2]["PROSES"] = "DONE";
    const patches = diffPatches(rows, full);
    expect(patches[0].rowIndex).toBe(2); // original index, not filtered position 0
  });

  it("PATCHes newly-editable source columns (Platform / Tanggal Posting) that diffPatches previously dropped", () => {
    // Platform — added to the patchable text set; FIXTURE[1] has no Platform value.
    const rows = [FIXTURE[1]];
    const draft: Record<number, Record<string, string | boolean>> = { 0: { Platform: "Instagram" } };
    expect(diffPatches(rows, draft)).toEqual([{ rowIndex: 0, column: "Platform", value: "Instagram" }]);
    // Tanggal Posting — date column, edited via the explorer date field.
    const draft2: Record<number, Record<string, string | boolean>> = { 0: { "Tanggal Posting": "06/09/2026" } };
    expect(diffPatches(rows, draft2)).toEqual([{ rowIndex: 0, column: "Tanggal Posting", value: "06/09/2026" }]);
    // every editable source column is covered by the whitelist
    expect(SOSMED_EDITABLE_TEXT_COLS).toContain("Platform");
    expect(SOSMED_EDITABLE_TEXT_COLS).toContain("Tanggal Posting");
    expect(SOSMED_EDITABLE_TEXT_COLS).toContain("LINK COVER");
    expect(SOSMED_EDITABLE_TEXT_COLS).toContain("Konten Pillar");
  });

  it("NEVER patches Kode Konten — it stays readonly/preserved", () => {
    const rows = [FIXTURE[0]]; // Kode Konten "K1"
    const draft: Record<number, Record<string, string | boolean>> = { 0: { "Kode Konten": "K7" } };
    expect(diffPatches(rows, draft)).toEqual([]);
  });

  it("blanking a newly-editable column produces NO patch — preserves existing data (validation)", () => {
    const rows = [FIXTURE[0]];
    const draft: Record<number, Record<string, string | boolean>> = { 0: { Platform: "", "Judul Konten": "   " } };
    expect(diffPatches(rows, draft)).toEqual([]);
  });
});

describe("PATCH path (mock source) — editor contract", () => {
  function sosmedSource() {
    const cols = columnsFor("sosmed");
    return makeFakeSource({
      seed: (title, key) =>
        cols.length && key === "sosmed"
          ? [cols, ["K1", "", "05/09/2026", "Video", "", "", "Ejak", "J1", "", "", "", "DONE", "", "V", "1", ""]]
          : cols.length ? [cols] : [],
    });
  }

  it("BOOL stays a REAL boolean through PATCH (adapter writes bool→bool)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(
      makeSession("editor-user", "editor"),
      src.source,
      "sosmed",
      { rowIndex: 0, column: "IG", value: false },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(200);
    // Read back through the adapter -> IG physically stored as boolean false, not "false".
    const rows = await src.source.fetchTable("sosmed");
    expect(rows[0]["IG"]).toBe(false);
    expect(typeof rows[0]["IG"]).toBe("boolean");
  });

  it("viewer PATCH -> 403 (server guards the editor control)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(
      makeSession("v", "viewer"),
      src.source,
      "sosmed",
      { rowIndex: 0, column: "PROSES", value: "DONE" },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(403);
  });

  it("non-scalar (object) value -> 400; unknown column -> 400; negative rowIndex -> 400", async () => {
    const src = sosmedSource();
    const audit = new MemoryAuditLog();
    const e = makeSession("e", "editor");
    expect((await updateCellController(e, src.source, "sosmed", { rowIndex: 0, column: "PROSES", value: { n: 1 } }, audit)).status).toBe(400);
    expect((await updateCellController(e, src.source, "sosmed", { rowIndex: 0, column: "Nope", value: "x" }, audit)).status).toBe(400);
    expect((await updateCellController(e, src.source, "sosmed", { rowIndex: -1, column: "PROSES", value: "x" }, audit)).status).toBe(400);
  });
});

describe("SosmedLanding (react-dom/server, no browser)", () => {
  it("renders the two choice cards with landing copy and route links", () => {
    const html = renderToStaticMarkup(<SosmedLanding />);
    expect(html).toContain("Social Media");
    expect(html).toContain("Planning Social Media");
    expect(html).toContain("Reporting &amp; Production");
    expect(html).toContain("/sosmed/planning");
    expect(html).toContain("/sosmed/reporting");
    // Perencanaan: konten yang akan dibuat. Reporting: hasil yang sudah terjadi.
    expect(html).toContain("Perencanaan");
    // static — no filter dims, no explorer popovers on the landing.
    expect((html.match(/aria-haspopup=\"listbox\"/g) ?? []).length).toBe(0);
  });

  it("landing needs no data props but may mention section names in card copy", () => {
    const html = renderToStaticMarkup(<SosmedLanding />);
    expect(html).toContain("Planning Social Media");
    // Landing is static — no metric cards / no analytics values rendered.
    expect(html).not.toContain("Total Planned");
    expect(html).not.toContain("Simpan Perubahan");
    expect(html).not.toContain("Master Content Data Explorer");
  });
});

describe("SosmedPlanningDashboard (react-dom/server, no browser)", () => {
  it("renders planning sections, editor save, and + Content Plan for an editor", () => {
    const html = renderToStaticMarkup(<SosmedPlanningDashboard rows={FIXTURE} planRows={[]} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Social Media");
    expect(html).toContain("Total Planned");
    expect(html).toContain("Content Plan Storage");
    expect(html).toContain("Content Calendar");
    expect(html).toContain("Master Content Data Explorer");
    expect(html).toContain("Simpan Perubahan");
    expect(html).toContain("+ Content Plan");
    // calendar + list tabs
    expect(html).toContain("Kalender");
    expect(html).toContain("Daftar");
  });

  it("renders read-only (no save control) for a viewer", () => {
    const html = renderToStaticMarkup(<SosmedPlanningDashboard rows={FIXTURE} planRows={[]} isEditor={false} onRefresh={() => {}} />);
    expect(html).toContain("Master Content Data Explorer");
    expect(html).not.toContain("💾 Simpan Perubahan");
  });

  it("renders the empty guard when no PROSES column / no data", () => {
    const noProses = [{ "Kode Konten": "K1", Output: "Video", PIC: "Ejak" }]; // no PROSES key
    const html = renderToStaticMarkup(<SosmedPlanningDashboard rows={noProses} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Data sosmed tidak tersedia atau kosong.");
    expect(html).not.toContain("Master Content Data Explorer");

    const emptyRows = renderToStaticMarkup(<SosmedPlanningDashboard rows={[]} isEditor onRefresh={() => {}} />);
    expect(emptyRows).toContain("Data sosmed tidak tersedia atau kosong.");
  });
});

// Build a full draft grid that equals the original cell values (nothing changed).
function draftFor(rows: Row[]): Record<number, Record<string, string | boolean>> {
  const d: Record<number, Record<string, string | boolean>> = {};
  rows.forEach((r, i) => {
    d[i] = {
      ...Object.fromEntries(SOSMED_BOOL_COLS.map((c) => [c, truthy(r[c])])),
      ...Object.fromEntries(SOSMED_TEXT_COLS.map((c) => [c, r[c] === null || r[c] === undefined ? "" : String(r[c])])),
    };
  });
  return d;
}

/* ---------------------------------------------------------------------------
 * Content Operations Dashboard derivations
 * ------------------------------------------------------------------------ */
function opsRow(partial: Partial<Row>): Row {
  const base: Row = {
    "Kode Konten": "K",
    "Tanggal Deadline": "18/09/2026",
    "Tanggal Posting": "05/09/2026",
    Output: "Video",
    "Konten Pillar": "DuperPedia",
    Platform: "Instagram",
    PIC: "Ejak",
    "Judul Konten": "J",
    PROSES: "DONE",
    IG: "V",
    TIKTOK: false,
    YT: "1",
  };
  return { ...base, ...partial };
}
const OPS_TODAY = new Date(2026, 8, 20); // 2026-09-20

describe("Content Operations Dashboard derivations", () => {
  it("productionOverview computes planned/done/in-progress/overdue/completion", () => {
    const rows = [
      opsRow({ PROSES: "DONE", "Tanggal Deadline": "18/08/2026" }),        // done
      opsRow({ "Kode Konten": "K2", PROSES: "ON PROGRESS", "Tanggal Deadline": "10/09/2026" }), // in-progress, overdue
      opsRow({ "Kode Konten": "K3", PROSES: "PENDING", "Tanggal Deadline": "25/09/2026" }),     // in-progress, future
      opsRow({ "Kode Konten": "K4", PROSES: "", "Tanggal Deadline": "30/09/2026" }),            // not started, future
    ];
    const o = productionOverview(rows, OPS_TODAY);
    expect(o.planned).toBe(4);
    expect(o.done).toBe(1);
    expect(o.inProgress).toBe(2); // ON PROGRESS + PENDING
    expect(o.overdue).toBe(1);    // K2 (past deadline, not done)
    expect(o.completionRate).toBe(25.0);
  });

  it("productionOverview: empty rows -> 0 with null completion rate (no div-by-zero)", () => {
    const o = productionOverview([], OPS_TODAY);
    expect(o.planned).toBe(0);
    expect(o.done).toBe(0);
    expect(o.completionRate).toBeNull();
  });

  it("deadlineDate parses day-first dates and rejects invalid", () => {
    expect(deadlineDate(opsRow({ "Tanggal Deadline": "31/05/2026" }))?.getFullYear()).toBe(2026);
    expect(deadlineDate(opsRow({ "Tanggal Deadline": "bad" }))).toBeNull();
    expect(deadlineDate(opsRow({ "Tanggal Deadline": "" }))).toBeNull();
  });

  it("isOverdue true only for past deadline AND not done", () => {
    expect(isOverdue(opsRow({ PROSES: "DONE", "Tanggal Deadline": "18/08/2026" }), OPS_TODAY)).toBe(false); // done
    expect(isOverdue(opsRow({ PROSES: "", "Tanggal Deadline": "10/09/2026" }), OPS_TODAY)).toBe(true);
    expect(isOverdue(opsRow({ PROSES: "", "Tanggal Deadline": "25/09/2026" }), OPS_TODAY)).toBe(false); // future
    expect(isOverdue(opsRow({ PROSES: "", "Tanggal Deadline": "bad" }), OPS_TODAY)).toBe(false); // invalid
  });

  it("stageOf maps PROSES + posting flags to the fallback stages", () => {
    expect(stageOf(opsRow({ PROSES: "DONE", IG: "V", TIKTOK: false, YT: "1" }))).toBe("published");
    expect(stageOf(opsRow({ PROSES: "DONE", IG: "V", TIKTOK: false, YT: "" }))).toBe("published"); // IG posted
    expect(stageOf(opsRow({ PROSES: "DONE", IG: "", TIKTOK: false, YT: "" }))).toBe("done");        // done, not posted
    expect(stageOf(opsRow({ PROSES: "ON PROGRESS" }))).toBe("inProduction");
    expect(stageOf(opsRow({ PROSES: "PENDING" }))).toBe("notStarted");
    expect(stageOf(opsRow({ PROSES: "?" }))).toBe("notStarted"); // unknown -> safe bucket
  });

  it("productionFunnel: counts per stage, review/revision stay 0 (no source col)", () => {
    const rows = [
      opsRow({ PROSES: "DONE", IG: "V" }),
      opsRow({ "Kode Konten": "K2", PROSES: "ON PROGRESS" }),
      opsRow({ "Kode Konten": "K3", PROSES: "" }),
    ];
    const f = productionFunnel(rows);
    const byKey = Object.fromEntries(f.map((s) => [s.key, s]));
    expect(byKey.published.count).toBe(1);
    expect(byKey.done.count).toBe(0);
    expect(byKey.inProduction.count).toBe(1);
    expect(byKey.notStarted.count).toBe(1);
    expect(byKey.review.count).toBe(0);
    expect(byKey.revision.count).toBe(0);
  });

  it("statusBreakdown returns all six stages and never throws on bad rows", () => {
    const b = statusBreakdown([
      opsRow({ PROSES: "DONE", IG: "x" }),
      opsRow({ "Kode Konten": "K2", PROSES: null, "Tanggal Deadline": null }),
      {},
    ] as Row[]);
    expect(b).toHaveLength(6);
    const total = b.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(3); // every row lands somewhere
  });

  it("deadlineMonitor buckets overdue/today/thisWeek/completed with affected rows", () => {
    const rows = [
      opsRow({ PROSES: "DONE", "Tanggal Deadline": "10/08/2026", "Judul Konten": "C1" }),          // completed
      opsRow({ "Kode Konten": "K2", PROSES: "", "Tanggal Deadline": "20/09/2026", "Judul Konten": "C2" }), // due today (deadline == today)
      opsRow({ "Kode Konten": "K3", PROSES: "", "Tanggal Deadline": "23/09/2026", "Judul Konten": "C3" }), // due this week
      opsRow({ "Kode Konten": "K4", PROSES: "", "Tanggal Deadline": "01/09/2026", "Judul Konten": "C4" }), // overdue
      opsRow({ "Kode Konten": "K5", PROSES: "", "Tanggal Deadline": "bad", "Judul Konten": "C5" }), // invalid -> excluded
    ];
    const d = deadlineMonitor(rows, OPS_TODAY);
    expect(d.overdueCount).toBe(1);
    expect(d.dueTodayCount).toBe(1);
    expect(d.dueThisWeekCount).toBe(1);
    expect(d.completedCount).toBe(1);
    expect(d.overdue[0]["Judul Konten"]).toBe("C4");
    expect(d.dueToday[0]["Judul Konten"]).toBe("C2");
    expect(d.dueThisWeek[0]["Judul Konten"]).toBe("C3");
  });

  it("picWorkload reports total/done/pending/overdue/completion per PIC (capacity, not ranking)", () => {
    const rows = [
      opsRow({ PIC: "Ejak", PROSES: "DONE", "Tanggal Deadline": "10/08/2026" }),
      opsRow({ "Kode Konten": "K2", PIC: "Ejak", PROSES: "", "Tanggal Deadline": "01/09/2026" }),
      opsRow({ "Kode Konten": "K3", PIC: "Hana", PROSES: "DONE", "Tanggal Deadline": "10/08/2026" }),
      opsRow({ "Kode Konten": "K4", PIC: null }), // missing PIC -> skipped
    ];
    const w = picWorkload(rows, OPS_TODAY);
    const byPic = Object.fromEntries(w.map((x) => [x.pic, x]));
    expect(Object.keys(byPic)).toEqual(expect.arrayContaining(["Ejak", "Hana"]));
    expect(byPic.Ejak.total).toBe(2);
    expect(byPic.Ejak.done).toBe(1);
    expect(byPic.Ejak.pending).toBe(1);
    expect(byPic.Ejak.overdue).toBe(1);
    expect(byPic.Ejak.completionPct).toBe(50.0);
    expect(byPic.Hana.total).toBe(1);
  });

  it("publishingTracker counts per platform + cross-platform + finished-unpublished robustly", () => {
    const rows = [
      opsRow({ PROSES: "DONE", IG: true, TIKTOK: true, YT: false }), // 2 platforms
      opsRow({ "Kode Konten": "K2", PROSES: "DONE", IG: "V", TIKTOK: "1", YT: "yes" }), // 3 cross
      opsRow({ "Kode Konten": "K3", PROSES: "DONE", IG: false, TIKTOK: false, YT: false }), // finished, unpublished
      opsRow({ "Kode Konten": "K4", PROSES: "", IG: "V", TIKTOK: false, YT: false }), // IG only (not cross)
    ];
    const p = publishingTracker(rows);
    expect(p.crossPlatform).toBe(2); // K1 + K2 (2+ platforms)
    expect(p.finishedNotPublished).toBe(1); // K3
    expect(p.ig).toBe(3); // K1,K2,K4
    expect(p.tiktok).toBe(2); // K1,K2
  });

  it("contentStrategy groups by ACTUAL values (pillar/format/platform), excludes empty", () => {
    const rows = [
      opsRow({ "Konten Pillar": "DuperPedia", Output: "Video", Platform: "Instagram" }),
      opsRow({ "Kode Konten": "K2", "Konten Pillar": "ADS", Output: "Video", Platform: "Tiktok" }),
      opsRow({ "Kode Konten": "K3", "Konten Pillar": "", Output: "Design", Platform: "" }),
    ] as Row[];
    const s = contentStrategy(rows);
    expect(s.pillars.map((b) => b.value)).toEqual(["DuperPedia", "ADS"]);
    expect(s.formats.map((b) => b.value)).toContain("Design");
    // 1 x DuperPedia out of 3 rows (row3 has empty pillar)
    expect(s.pillars[0].sharePct).toBeCloseTo(100 / 3, 5);
    expect(s.platforms.map((b) => b.value)).toEqual(["Instagram", "Tiktok"]); // empty excluded
  });

  it("outputTrend groups by deadline week (Monday), ascending, invalid dates excluded", () => {
    const rows = [
      opsRow({ "Kode Konten": "K1", "Tanggal Deadline": "08/09/2026", PROSES: "DONE" }),
      opsRow({ "Kode Konten": "K2", "Tanggal Deadline": "10/09/2026", PROSES: "DONE" }), // same week (Mon 07/09)
      opsRow({ "Kode Konten": "K3", "Tanggal Deadline": "02/10/2026", PROSES: "" }),     // later week
      opsRow({ "Kode Konten": "K4", "Tanggal Deadline": "bad", PROSES: "" }),            // excluded
    ];
    const t = outputTrend(rows);
    expect(t).toHaveLength(2);
    expect(t[0].label).toBe("07/09/2026"); // Monday of week containing 08-10 Sep
    expect(t[0].planned).toBe(2);
    expect(t[0].done).toBe(2);
    expect(t[1].planned).toBe(1);
    expect(t[1].done).toBe(0);
    // ascending by week (parse the key as Y-M-D)
    const [y0, m0, d0] = t[0].key.split("-").map(Number);
    const [y1, m1, d1] = t[1].key.split("-").map(Number);
    expect(new Date(y0, m0, d0).getTime()).toBeLessThan(new Date(y1, m1, d1).getTime());
  });

  it("actionRequired collects overdue / review / revision / finished-unpublished", () => {
    const rows = [
      opsRow({ "Judul Konten": "A", PROSES: "", "Tanggal Deadline": "01/09/2026" }),               // overdue
      opsRow({ "Kode Konten": "K2", "Judul Konten": "B", PROSES: "ON PROGRESS", "Tanggal Deadline": "25/09/2026" }), // waiting review, future
      opsRow({ "Kode Konten": "K3", "Judul Konten": "C", PROSES: "DONE", IG: "", TIKTOK: false, YT: "" }), // finished, unpublished
    ];
    const a = actionRequired(rows, OPS_TODAY);
    expect(a.overdue.map((x) => x.title)).toEqual(["A"]);
    expect(a.reviewNeeded.map((x) => x.title)).toEqual(["B"]);
    expect(a.inRevision).toEqual([]); // no REVISION status in data
    expect(a.finishedNotPublished.map((x) => x.title)).toEqual(["C"]);
  });

  it("filterRows ANDs every non-empty dimension; empty sets pass everything", () => {
    const rows = [
      opsRow({ "Kode Konten": "K1", PIC: "Ejak", "Konten Pillar": "DuperPedia", Platform: "Instagram", Output: "Video", PROSES: "DONE", IG: "V" }),
      opsRow({ "Kode Konten": "K2", PIC: "Hana", "Konten Pillar": "ADS", Platform: "Tiktok", Output: "Design", PROSES: "ON PROGRESS" }),
      opsRow({ "Kode Konten": "K3", PIC: "Ejak", "Konten Pillar": "DuperPedia", Platform: "Both", Output: "Video", PROSES: "PENDING" }),
    ];
    const allOn = (set: string[]) => new Set(set);
    const f = (over: Partial<SosmedFilters> = {}) =>
      filterRows(rows, {
        pics: allOn(["Ejak", "Hana"]),
        months: new Set(sosmedMonths(rows)),
        statuses: allOn(["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"]),
        platforms: allOn(["Instagram", "Tiktok", "Both"]),
        pillars: allOn(["DuperPedia", "ADS"]),
        formats: allOn(["Video", "Design"]),
        ...over,
      });
    expect(f().map((r) => r["Kode Konten"])).toEqual(["K1", "K2", "K3"]); // all pass default
    expect(f({ pics: new Set(["Hana"]) }).map((r) => r["Kode Konten"])).toEqual(["K2"]);
    expect(f({ statuses: new Set(["Published"]) }).map((r) => r["Kode Konten"])).toEqual(["K1"]);
    expect(f({ pillars: new Set(["ADS"]) }).map((r) => r["Kode Konten"])).toEqual(["K2"]);
    // combined: Hana + Tiktok -> K2
    expect(f({ pics: new Set(["Hana"]), platforms: new Set(["Tiktok"]) }).map((r) => r["Kode Konten"])).toEqual(["K2"]);
  });

  it("distinctValues returns sorted non-empty values", () => {
    expect(distinctValues([opsRow({ "Konten Pillar": "B" }), opsRow({ "Kode Konten": "k2", "Konten Pillar": "A" }), opsRow({ "Kode Konten": "k3", "Konten Pillar": "" })], "Konten Pillar"))
      .toEqual(["A", "B"]);
  });

  it("SosmedReportingDashboard renders the reporting section set; planning excludes heavy analytics", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    for (const t of ["Production Overview", "Production Funnel", "Status Breakdown", "Workload per PIC", "Deadline Monitoring", "Publishing Tracker", "Content Strategy", "Output Trend", "Action Required"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("Total Planned");
    expect(html).toContain("Completion Rate");
    expect(html).toContain("Hutang Post IG");
    // reporting excludes planner/calendar/master:
    expect(html).not.toContain("Content Plan Storage");
    expect(html).not.toContain("Master Content Data Explorer");
    expect(html).not.toContain("+ Content Plan");
  });
});

describe("Sosmed filter bar — searchable multi-select dropdown (redesign)", () => {
  it("PLANNING renders five GLOBAL filter dims (Bulan/PIC/Platform/Pillar/Format, NO Status) + six explorer filters", () => {
    const html = renderToStaticMarkup(<SosmedPlanningDashboard rows={FIXTURE} planRows={[]} isEditor onRefresh={() => {}} />);
    // 5 global filter triggers + 6 explorer filter triggers = 11 listbox popovers (no Status on planning).
    expect((html.match(/aria-haspopup="listbox"/g) ?? []).length).toBe(11);
    for (const t of ["PIC", "Bulan Deadline", "Platform", "Content Pillar", "Format"]) {
      expect(html).toContain(`aria-label="${t}"`);
    }
    // planning's global dims are Bulan/PIC/Platform/Pillar/Format (NO Status); the only
    // "Status" listbox on planning is the explorer's own scoped filter (1 occurrence).
    expect((html.match(/aria-label="Status"/g) ?? []).length).toBe(1);
    // Default scope = LATEST deadline period (October 2026) -> Bulan is a single-month active filter.
    expect(html).toContain("Semua");
    expect(html).toContain("1 dipilih");
    expect(html).toContain("Reset");
    expect(html).toContain("Filter Aktif");
    expect(html).toContain("Hapus Semua");
    expect((html.match(/max-h-\[160px\]/g) ?? []).length).toBe(0);
  });

  it("REPORTING renders five GLOBAL filter dims (Periode/PIC/Platform/Status/Format, NO Pillar), no explorer", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // 5 global filter triggers only (no explorer on reporting).
    expect((html.match(/aria-haspopup="listbox"/g) ?? []).length).toBe(5);
    for (const t of ["PIC", "Periode", "Platform", "Status", "Format"]) {
      expect(html).toContain(`aria-label="${t}"`);
    }
    // reporting has NO global Content Pillar dimension.
    expect(html).not.toContain(`aria-label="Content Pillar"`);
  });

  it("selectionSummary derives Semua / N dipilih / active / allChecked from the state contract", () => {
    const opts = ["Ejak", "Hana", "Abi"];
    const all = selectionSummary(new Set(opts), opts);
    expect(all.chip).toBe("Semua");
    expect(all.active).toBe(false);
    expect(all.allChecked).toBe(true);
    const partial = selectionSummary(new Set(["Ejak", "Hana"]), opts);
    expect(partial.chip).toBe("2 dipilih");
    expect(partial.active).toBe(true);
    expect(partial.allChecked).toBe(false);
    const none = selectionSummary(new Set(), opts);
    expect(none.chip).toBe("0 dipilih");
    expect(none.active).toBe(true);
    expect(none.allChecked).toBe(false);
    // A selected value absent from options is counted (never silently dropped) and keeps the
    // dimension active, but all underlying options are still selected (allChecked stays true).
    const extra = selectionSummary(new Set([...opts, "Ghost"]), opts);
    expect(extra.chip).toBe("4 dipilih");
    expect(extra.active).toBe(true);
    expect(extra.allChecked).toBe(true);
  });
});

describe("Sosmed revisions — latest-period default scope + reworked layout (§1..§10)", () => {
  it("latestDeadlineMonthSet returns ONLY the max-deadline month label", () => {
    // FIXTURE deadlines: Sep 18, Sep 25, Oct 02, Oct 05 (+ unparseable K5). Latest = Oct 05.
    const months = ["September 2026", "October 2026"];
    expect(latestDeadlineMonthSet(months, FIXTURE)).toEqual(new Set(["October 2026"]));
    expect(latestDeadlineMonthSet(months, FIXTURE).size).toBe(1);
    // Single-month edge: behavior identical regardless of default.
    const single = [row({ "Kode Konten": "S1", "Tanggal Deadline": "15/03/2026" })];
    expect(latestDeadlineMonthSet(["March 2026"], single)).toEqual(new Set(["March 2026"]));
  });

  it("latestDeadlineMonthSet falls back to ALL months when no deadline parses or rows empty (§4.3)", () => {
    const months = ["September 2026", "October 2026"];
    expect(latestDeadlineMonthSet(months, [])).toEqual(new Set(months));
    expect(latestDeadlineMonthSet(months, [row({ "Kode Konten": "X", "Tanggal Deadline": "bad" }), row({ "Kode Konten": "Y", "Tanggal Deadline": "" })])).toEqual(new Set(months));
    // A derivable deadline wins even when the options array is empty — the label
    // comes from the data, and the `months` array only feeds the no-deadline fallback.
    expect(latestDeadlineMonthSet([], FIXTURE)).toEqual(new Set(["October 2026"]));
  });

  it("prevDeadlineMonthSet returns ONLY the PREVIOUS calendar month (relative to today)", () => {
    const prev = row({ "Kode Konten": "A", "Tanggal Deadline": "10/08/2026" });
    const cur = row({ "Kode Konten": "B", "Tanggal Deadline": "20/09/2026" });
    const months = ["August 2026", "September 2026"];
    const today = new Date(2026, 8, 24); // 2026-09-24 → previous calendar month = August 2026
    expect(prevDeadlineMonthSet(months, [prev, cur], today)).toEqual(new Set(["August 2026"]));
    expect(prevDeadlineMonthSet(months, [prev, cur], today).size).toBe(1);
  });

  it("prevDeadlineMonthSet crosses the year boundary (January → prior December)", () => {
    const dec = row({ "Kode Konten": "C", "Tanggal Deadline": "05/12/2026" });
    const jan = row({ "Kode Konten": "D", "Tanggal Deadline": "10/01/2027" });
    const months = ["December 2026", "January 2027"];
    expect(prevDeadlineMonthSet(months, [dec, jan], new Date(2027, 0, 15))).toEqual(new Set(["December 2026"]));
  });

  it("prevDeadlineMonthSet returns EMPTY (never drops data) when the previous month has no data", () => {
    const months = ["September 2026", "October 2026"];
    // FIXTURE deadlines are Sep/Oct 2026; previous month (Aug) has none.
    expect(prevDeadlineMonthSet(months, FIXTURE, new Date(2026, 8, 24))).toEqual(new Set([]));
    expect(prevDeadlineMonthSet(months, [], new Date(2026, 8, 24))).toEqual(new Set([]));
    // prev month has data but its label is absent from `months` → empty (guarded)
    expect(prevDeadlineMonthSet(["September 2026"], [row({ "Kode Konten": "A", "Tanggal Deadline": "10/08/2026" })], new Date(2026, 8, 24))).toEqual(new Set([]));
  });

  it("reporting layout: Production Overview renders ABOVE Deadline Monitoring (spec §4.3 order #2→#3)", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    const dmIdx = html.indexOf("Prioritas utama: Overdue, jatuh tempo hari ini/minggu ini, dan selesai.");
    const poIdx = html.indexOf("Ringkasan produksi: planned, done, in-progress, overdue, dan completion-rate.");
    expect(poIdx).toBeGreaterThan(-1);
    expect(dmIdx).toBeGreaterThan(poIdx);
    // Deadline Monitoring appears exactly once (reporting only — planning has none).
    expect((html.match(/Deadline Monitoring/g) ?? []).length).toBe(1);
  });

  it("reporting layout: compact 5-across grids for Production Overview (2 rows) + Publishing Tracker, keeping every metric (§5.2/§8.2)", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // 2 overview rows + publishing tracker = 3 compact-row uses of xl:5-cols,
    // plus the reporting 5-dim filter bar (also xl:grid-cols-5) = 4 total.
    expect((html.match(/xl:grid-cols-5/g) ?? []).length).toBe(4);
    for (const t of ["Total Planned", "Total Done", "In Progress", "Overdue", "Completion Rate",
      "Video Selesai", "Design Selesai", "Hutang Post IG", "Hutang Post TikTok", "Hutang Post YT",
      "Instagram Published", "TikTok Published", "YouTube Published", "Cross-platform", "Finished, Unpublished"]) {
      expect(html).toContain(t);
    }
  });

  it("reporting layout: Funnel|Breakdown and Workload|PIC render side-by-side 50/50 grids (§7/§8.1)", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // two 50/50 rows share the same splitRow utility.
    expect((html.match(/xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/g) ?? []).length).toBe(2);
    expect(html).toContain("Production Funnel &amp; Status Breakdown");
    expect(html).toContain("Berapa konten di setiap fase");
    expect(html).toContain("Monitoring dan kapasitas per PIC");
  });

  it("reporting: renders the interactive Output Trend: Indonesian legend + zoom toolbar + ariaLabels (§10)", () => {
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // FIXTURE (October scope) yields ≥1 trend week -> interactive chart, not the empty state.
    expect(html).toContain("Tren output per minggu — seri Rencana dan Selesai");
    expect(html).toContain("Rencana");
    expect(html).toContain("Selesai");
    expect(html).toContain('aria-label="Perbesar tren"');
    expect(html).toContain('aria-label="Perkecil tren"');
    expect(html).not.toContain("Belum ada data deadline untuk tren."); // has data
  });

  it("reporting: renders the Output Trend empty-state card when no deadline week parses (§10.3)", () => {
    const noTrend = [row({ "Kode Konten": "K1", PROSES: "DONE", "Tanggal Deadline": "bad" })];
    const html = renderToStaticMarkup(<SosmedReportingDashboard rows={noTrend} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Belum ada data deadline untuk tren.");
  });
});

/* ---------------------------------------------------------------------------
 * Social Media Command Center — new derivations covering the 8 test scenarios
 * (save plan, add-to-production ONE record, search, filter PIC/platform,
 * expand, pagination, edit-save) + division-by-zero / empty branches.
 * ------------------------------------------------------------------------ */
import {
  searchContents,
  deadlineBucket,
  paginationWindow,
  calendarCells,
  contentKode,
  buildProductionRow,
  buildPlanPayload,
  productionKodeExists,
  COLUMN_DEFS,
  EXPLORER_DEFAULT_COLS,
} from "@/workspaces/sosmed";
import { columnsFor as planColumnsFor } from "@/server/adapter/schema";

function planRow(partial: Partial<Row>): Row {
  return {
    "Judul / Ide Konten": "Launch Reels",
    "Tanggal Publish": "10/10/2026",
    "Deadline Produksi": "20/10/2026",
    "Content Pillar": "DuperPedia",
    "Format": "Video",
    "Platform": "Instagram",
    "PIC": "Ejak",
    "Brief": "Creative brief",
    "Reference Link": "https://ref.example",
    "Priority": "High",
    "Status Plan": "APPROVED",
    ...partial,
  } as Row;
}

describe("Sosmed Command Center — search / pagination / deadline / calendar", () => {
  it("SC1 searchContents finds rows across Kode/Judul/Pillar/Platform/Format/PIC (case-insensitive)", () => {
    expect(searchContents(FIXTURE, "")).toEqual(FIXTURE); // empty -> all unchanged
    expect(searchContents(FIXTURE, "  ")).toEqual(FIXTURE);
    expect(searchContents(FIXTURE, "J1").map((r) => r["Kode Konten"])).toEqual(["K1"]);      // Judul
    expect(searchContents(FIXTURE, "ejak").map((r) => r["Kode Konten"]).sort()).toEqual(["K1", "K3"]); // PIC
    expect(searchContents(FIXTURE, "youtube").map((r) => r["Kode Konten"])).toEqual(["K3"]); // Output
    expect(searchContents(FIXTURE, "no-match")).toEqual([]);
  });

  it("SC1 paginationWindow always shows 1, total, current ±1 with ellipsis collapse", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
    expect(paginationWindow(1, 3)).toEqual([1, 2, 3]);
    // 20 pages, current 10 -> 1 … 9 10 11 … 20
    expect(paginationWindow(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(paginationWindow(1, 20)).toEqual([1, 2, "…", 20]);
    expect(paginationWindow(20, 20)).toEqual([1, "…", 19, 20]);
    // division-by-zero / degenerate guards
    expect(paginationWindow(1, 0)).toEqual([1]);
    expect(paginationWindow(999, 5)).toContain(5); // clamped to totalPages
  });

  it("SC1 deadlineBucket classifies overdue/dueToday/dueThisWeek/future/completed/ALL", () => {
    const today = new Date(2026, 8, 20); // 2026-09-20
    expect(deadlineBucket(opsRow({ PROSES: "DONE", "Tanggal Deadline": "10/08/2026" }), today)).toBe("completed");
    expect(deadlineBucket(opsRow({ PROSES: "", "Tanggal Deadline": "01/09/2026" }), today)).toBe("overdue");
    expect(deadlineBucket(opsRow({ PROSES: "", "Tanggal Deadline": "20/09/2026" }), today)).toBe("dueToday");
    expect(deadlineBucket(opsRow({ PROSES: "", "Tanggal Deadline": "22/09/2026" }), today)).toBe("dueThisWeek");
    expect(deadlineBucket(opsRow({ PROSES: "", "Tanggal Deadline": "30/09/2026" }), today)).toBe("future");
    expect(deadlineBucket(opsRow({ PROSES: "", "Tanggal Deadline": "bad" }), today)).toBe("ALL");
  });

  it("SC1 calendarCells puts deadline rows on their day across a Monday-first grid", () => {
    // June 2026: Jun 1 is a Monday. Deadline 03/06 -> cell day 3, fine.
    const today = new Date(2026, 5, 10);
    const rows = [opsRow({ "Tanggal Deadline": "03/06/2026", "Judul Konten": "C1" })];
    const cells = calendarCells(rows, 2026, 5, today);
    // First cell (offset 0, Monday) is day 1; iterate even though it's mid-grid.
    const day3 = cells.find((c) => c.day === 3 && !c.isOutside)!;
    expect(day3).not.toBeUndefined();
    expect(day3.rows.map((r) => r["Judul Konten"])).toEqual(["C1"]);
    // 7 columns render: total cells is a multiple of 7.
    expect(cells.length % 7).toBe(0);
    expect(cells.find((c) => c.day === today.getDate() && !c.isOutside)?.isToday).toBe(true);
    // 31 days in June -> all in-month cells present.
    expect(cells.filter((c) => !c.isOutside).length).toBe(30);
  });

  it("SC1 calendarDefaultMonth opens on a populated month, else today (data-aware §4.2)", () => {
    const today = new Date(2026, 8, 21); // 2026-09-21
    // Only past-month deadlines (Apr–Aug) -> must jump to the busiest month, earliest tie-break.
    const rows = [
      opsRow({ "Tanggal Deadline": "12/06/2026" }), // Jun
      opsRow({ "Tanggal Deadline": "03/04/2026" }), // Apr
      opsRow({ "Tanggal Deadline": "28/06/2026" }), // Jun
      opsRow({ "Tanggal Deadline": "15/08/2026" }), // Aug
      opsRow({ "Tanggal Deadline": "19/08/2026" }), // Aug
    ];
    // Jun has 2 rows -> Jun wins; earliest tie-break among counts.
    const d = calendarDefaultMonth(rows, today);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-indexed)
    expect(d.getDate()).toBe(1);
    // Today's month present -> stays on today's month.
    const current = [...rows, opsRow({ "Tanggal Deadline": "10/09/2026" })];
    const c = calendarDefaultMonth(current, today);
    expect(c.getMonth()).toBe(8);
    expect(c.getFullYear()).toBe(2026);
    // Tie between two months -> earliest month (Apr vs May) wins.
    const tie = [
      opsRow({ "Tanggal Deadline": "05/05/2026" }),
      opsRow({ "Tanggal Deadline": "09/05/2026" }),
      opsRow({ "Tanggal Deadline": "06/04/2026" }),
      opsRow({ "Tanggal Deadline": "08/04/2026" }),
    ];
    const t = calendarDefaultMonth(tie, today);
    expect(t.getMonth()).toBe(3); // April
    // Bad-date rows + empty -> fallback to today's month.
    const empty = [opsRow({ "Tanggal Deadline": "bad" }), opsRow({ "Tanggal Deadline": "" })];
    const fb = calendarDefaultMonth(empty, today);
    expect(fb.getMonth()).toBe(8);
    expect(calendarDefaultMonth([], today).getMonth()).toBe(8);
  });

  it("SC8 inline editor Save iterates the page slice and PATCHes only changed cells (edit-save)", () => {
    const rows = [opsRow({ "Kode Konten": "K1", "Judul Konten": "A", PROSES: "DONE" }), opsRow({ "Kode Konten": "K2", "Judul Konten": "B", PROSES: "PENDING" })];
    const full = draftFor(rows);
    full[1]["PROSES"] = "DONE"; // change one cell on the page slice
    const patches = diffPatches(rows, full);
    expect(patches).toEqual([{ rowIndex: 1, column: "PROSES", value: "DONE" }]);
    // one-cell scope (page slice of 1) with no change -> no PATCH (edit-save no-op)
    const single = draftFor([rows[0]]);
    expect(diffPatches([rows[0]], single)).toEqual([]);
  });
});

describe("Sosmed Command Center — Content Planner + Add-to-Production", () => {
  it("SC1 buildPlanPayload produces EXACTLY the 11 declared content_plan columns", () => {
    const cols = planColumnsFor("content_plan");
    const payload = buildPlanPayload({
      judul: "  Launch Reels  ", publish: "2026-10-10", deadlineProduksi: "2026-10-20",
      pillar: "DuperPedia", format: "Video", platform: "Instagram", pic: "Ejak",
      brief: "brief", reference: "https://x", priority: "High", statusPlan: "PLANNED",
    });
    expect(Object.keys(payload).sort()).toEqual(cols.slice().sort()); // same key set
    expect(payload["Judul / Ide Konten"]).toBe("Launch Reels"); // trimmed
    expect(payload["Status Plan"]).toBe("PLANNED");
    // empty status defaults to IDEA
    const dflt = buildPlanPayload({ judul: "x", publish: "", deadlineProduksi: "", pillar: "", format: "", platform: "", pic: "", brief: "", reference: "", priority: "", statusPlan: "" });
    expect(dflt["Status Plan"]).toBe("IDEA");
  });

  it("SC2 Add-to-Production maps a plan to EXACTLY ONE sosmed row with the right columns", () => {
    const today = new Date(2026, 8, 21); // 2026-09-21
    const kode = contentKode(today, 42);
    expect(kode).toBe("CT-20260921-0042"); // deterministic kode generator
    const row = buildProductionRow(planRow({ "Deadline Produksi": "20/10/2026", Format: "Video", Platform: "Instagram", PIC: "Ejak", "Judul / Ide Konten": "Launch Reels", Brief: "brief", "Reference Link": "https://r" }), today, kode);
    const sosmedCols = planColumnsFor("sosmed");
    expect(Object.keys(row).sort()).toEqual(sosmedCols.slice().sort()); // EXACT sosmed columns
    expect(row["Kode Konten"]).toBe(kode);
    expect(row["Tanggal Deadline"]).toBe("20/10/2026");
    expect(row["Output"]).toBe("Video");
    expect(row["Konten Pillar"]).toBe("DuperPedia");
    expect(row["Platform"]).toBe("Instagram");
    expect(row["PIC"]).toBe("Ejak");
    expect(row["Judul Konten"]).toBe("Launch Reels");
    expect(row["Materi Konten"]).toBe("brief");
    expect(row["LINK COVER"]).toBe("https://r");
    expect(row["PROSES"]).toBe("PENDING");
    expect(row["IG"]).toBe(false); expect(row["TIKTOK"]).toBe(false); expect(row["YT"]).toBe(false);
    // one record (object, not array) — the "ONE record" requirement
    expect(Array.isArray(row)).toBe(false);
  });

  it("SC2 duplicate prevention: same kode already in sosmed rows -> Kode collision detected", () => {
    const today = new Date(2026, 8, 21);
    const kode = contentKode(today, 7);
    expect(productionKodeExists([opsRow({ "Kode Konten": "OTHER" })], kode)).toBe(false);
    expect(productionKodeExists([opsRow({ "Kode Konten": kode })], kode)).toBe(true);
    // deterministic: same plan row -> same kode (re-push would collide)
    expect(contentKode(today, 7)).toBe(contentKode(today, 7));
  });

  it("SC4/SC5 filter rows by PIC and by platform (explorer filters AND global filter)", () => {
    const rows = [FIXTURE[0], FIXTURE[1], FIXTURE[2]];
    // PIC filter -> only Hana (FIXTURE[1])
    const byPic = filterRows(rows, { pics: new Set(["Hana"]), months: new Set(), statuses: new Set(), platforms: new Set(), pillars: new Set(), formats: new Set() });
    expect(byPic.map((r) => r["Kode Konten"])).toEqual(["K2"]);
    // platform filter (Both/Instagram/Tiktok)
    const withPlatform = [opsRow({ Platform: "Instagram" }), opsRow({ "Kode Konten": "K2", Platform: "Tiktok" }), opsRow({ "Kode Konten": "K3", Platform: "Both" })];
    const byPlat = filterRows(withPlatform, { pics: new Set(), months: new Set(), statuses: new Set(), platforms: new Set(["Tiktok"]), pillars: new Set(), formats: new Set() });
    expect(byPlat.map((r) => r["Kode Konten"])).toEqual(["K2"]);
  });

  it("SC6 Expand/fullscreen path: Explorer COLUMN catalog + default columns (code/title/deadline/posting/pic/format/status/platform)", () => {
    expect(EXPLORER_DEFAULT_COLS).toEqual(["code", "title", "deadline", "posting", "pic", "format", "status", "platform"]);
    expect(COLUMN_DEFS.length).toBe(15); // 8 default + 7 extra
    // Tanggal Posting column sits directly after deadline in the default set
    expect(COLUMN_DEFS.map((d) => d.key)).toEqual([
      ...EXPLORER_DEFAULT_COLS, "pillar", "process", "ig", "tiktok", "yt", "reference", "notes",
    ]);
    const posting = COLUMN_DEFS.find((d) => d.key === "posting")!;
    expect(posting.source).toBe("Tanggal Posting");
    expect(posting.header).toBe("Tanggal Posting");
  });

  it("Detail drawer (`RowDetailDrawer`) renders Drive links from the STORED value as clickable anchors — no URL generation", () => {
    const drive = "https://drive.google.com/drive/folders/abc123?usp=sharing";
    const r: Row = row({
      "Kode Konten": "K9", "Judul Konten": "J9", "LINK COVER": drive,
      "LINK KONTEN JADI": drive, "Tanggal Deadline": "18/09/2026", "Tanggal Posting": "05/09/2026",
      Output: "Video", "Konten Pillar": "DuperPedia", Platform: "Instagram", PIC: "Ejak",
      PROSES: "DONE", IG: "V", YT: "1", TIKTOK: false,
    });
    const html = renderToStaticMarkup(
      <RowDetailDrawer row={r} rowIndex={0} onClose={() => {}} isEditor={false} editing={false} setEditing={() => {}}
        pics={[]} draft={{}} setCell={() => {}} saving={false} runSave={() => {}} saveMsg={null} />
    );
    // the stored value is used verbatim as both the href and the visible text (twice: Link Cover + Link Konten Jadi)
    expect(html.match(/href="https:\/\/drive\.google\.com\/drive\/folders\/abc123\?usp=sharing"/g)?.length ?? 0).toBe(2);
    expect(html.includes(`>${drive}</a>`)).toBe(true);
    // it is an opening, clickable anchor in a new tab — not generated/transformed
    expect(html.includes('target="_blank" rel="noreferrer"')).toBe(true);
  });
});