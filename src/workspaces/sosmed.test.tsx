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
    expect(html).toContain("Master Production Pipeline");
    expect(html).toContain("Simpan Perubahan");
    expect(html).toContain("Hutang Post IG");
  });

  it("renders read-only (no save control) for a viewer", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor={false} onRefresh={() => {}} />);
    expect(html).toContain("Master Production Pipeline");
    // The subtitle mentions 'Simpan Perubahan' too, but the SAVE BUTTON (💾 prefix)
    // must be absent for a viewer (server also 403s viewer PATCH).
    expect(html).not.toContain("💾 Simpan Perubahan");
  });

  it("renders the empty guard when no PROSES column / no data", () => {
    const noProses = [{ "Kode Konten": "K1", Output: "Video", PIC: "Ejak" }]; // no PROSES key
    const html = renderToStaticMarkup(<SosmedDashboard rows={noProses} isEditor onRefresh={() => {}} />);
    expect(html).toContain("Data sosmed tidak tersedia atau kosong.");
    expect(html).not.toContain("Master Production Pipeline");

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
    for (const t of ["Production Overview", "Production Funnel", "Status Breakdown", "Workload per PIC", "Deadline Monitoring", "Publishing Tracker", "Content Strategy", "Output Trend", "Action Required", "Master Production Pipeline", "Total Planned", "Completion Rate"]) {
      expect(html).toContain(t);
    }
    expect(html).toContain("💾 Simpan Perubahan"); // editor still present
  });
});

describe("Sosmed filter bar — searchable multi-select dropdown (redesign)", () => {
  it("renders the six searchable dropdown triggers instead of the old checkbox grid", () => {
    const html = renderToStaticMarkup(<SosmedDashboard rows={FIXTURE} isEditor onRefresh={() => {}} />);
    // Six triggers, all closed by default, exposed as listbox popovers.
    expect((html.match(/aria-haspopup="listbox"/g) ?? []).length).toBe(6);
    for (const t of ["PIC", "Bulan Deadline", "Status", "Platform", "Content Pillar", "Format"]) {
      expect(html).toContain(`aria-label="${t}"`);
    }
    // Full selection default -> each trigger's summary chip reads "Semua"; no active filter state.
    expect(html).toContain("Semua");
    // Reset stays visible; the Active Filter Summary (incl. "Hapus Semua") is hidden while nothing is filtered.
    expect(html).toContain("Reset");
    expect(html).not.toContain("Filter Aktif");
    expect(html).not.toContain("Hapus Semua");
    // Old always-open checkbox columns are gone.
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