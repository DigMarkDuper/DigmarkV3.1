import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SosmedDashboard, selectionSummary } from "@/workspaces/SosmedDashboard";
import {
  SOSMED_BOOL_COLS,
  SOSMED_TEXT_COLS,
  deadlineMonth,
  diffPatches,
  filterRows,
  filterSosmedRows,
  isDone,
  isOverdue,
  isVideo,
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

describe("SosmedDashboard (react-dom/server, no browser)", () => {
  it("renders hero, metrics, workload, editor, and save control for an editor", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Social Media");
    expect(html).toContain("Production Overview");
    expect(html).toContain("Workload per PIC");
    expect(html).toContain("Master Content Data Explorer");
    expect(html).toContain("Simpan Perubahan");
    expect(html).toContain("Hutang Post IG");
  });

  it("renders read-only (no save control) for a viewer", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor={false} onRefresh={() => {}} />);
    expect(html).toContain("Master Content Data Explorer");
    // The subtitle mentions 'Simpan Perubahan' too, but the SAVE BUTTON (💾 prefix)
    // must be absent for a viewer (server also 403s viewer PATCH).
    expect(html).not.toContain("💾 Simpan Perubahan");
  });

  it("renders the empty guard when no PROSES column / no data", () => {
    const noProses = [{ "Kode Konten": "K1", Output: "Video", PIC: "Ejak" }]; // no PROSES key
    const html = renderToStaticMarkup(<SosmedDashboard rows={noProses} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Data sosmed tidak tersedia atau kosong.");
    expect(html).not.toContain("Master Content Data Explorer");

    const emptyRows = renderToStaticMarkup(<SosmedDashboard rows={[]} isEditor onRefresh={() => {}} />);
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

  it("SosmedDashboard renders new sections alongside legacy ones", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    for (const t of ["Production Overview", "Production Funnel", "Status Breakdown", "Workload per PIC", "Deadline Monitoring", "Publishing Tracker", "Content Strategy", "Output Trend", "Action Required", "Master Content Data Explorer", "Content Planning", "Kalender", "Total Planned", "Completion Rate"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("+ Content Plan"); // header action cluster
    expect(html).toContain("💾 Simpan Perubahan"); // editor still present
  });
});

describe("Sosmed filter bar — searchable multi-select dropdown (redesign)", () => {
  it("renders the six GLOBAL searchable dropdown triggers (section-1 filter) + six explorer filters", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // 6 global filter triggers + 6 explorer filter triggers = 12 listbox popovers.
    expect((html.match(/aria-haspopup="listbox"/g) ?? []).length).toBe(12);
    for (const t of ["PIC", "Bulan Deadline", "Status", "Platform", "Content Pillar", "Format"]) {
      expect(html).toContain(`aria-label="${t}"`);
    }
    // Full selection default -> each trigger's summary chip reads "Semua"; no active filter state.
    expect(html).toContain("Semua");
    // Reset stays visible; the Active Filter Summary (incl. "Hapus Semua") is hidden while nothing is filtered.
    expect(html).toContain("Reset");
    expect(html).not.toContain("Filter Aktif");
    expect(html).not.toContain("Hapus Semua");
    expect((html.match(/max-h-\[160px\]/g) ?? []).length).toBe(0);
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

  it("SC6 Expand/fullscreen path: Explorer COLUMN catalog + default columns (code/title/deadline/pic/format/status/platform)", () => {
    expect(EXPLORER_DEFAULT_COLS).toEqual(["code", "title", "deadline", "pic", "format", "status", "platform"]);
    expect(COLUMN_DEFS.length).toBe(14); // 7 default + 7 extra
    // extra columns are present in order
    expect(COLUMN_DEFS.map((d) => d.key)).toEqual([...EXPLORER_DEFAULT_COLS, "pillar", "process", "ig", "tiktok", "yt", "reference", "notes"]);
  });
});