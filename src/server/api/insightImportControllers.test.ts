import { describe, expect, it } from "vitest";
import { insightImportController } from "./insightImportControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { makeFakeSource, makeSession } from "./testHelpers";
import { columnsFor } from "@/server/adapter/schema";
import {
  TIKTOK_OVERVIEW_FULL_ROWS,
  TIKTOK_FOLLOWER_FULL_ROWS,
  IG_FILES_6,
  IG_DATES_28,
  instagramBytes,
} from "@/insight-import/__fixtures__";

const body = async (res: Response) => res.json() as Promise<InsightResp>;
interface InsightResp {
  [k: string]: unknown;
  ok: boolean;
  platform: string;
  platformDetected: boolean;
  rowCount: number;
  newRows: Array<Record<string, unknown>>;
  potentialDuplicates: Array<Record<string, unknown>>;
  preview: Array<Record<string, unknown>>;
  validation: { ok: boolean };
  blockReasons: string[];
  rowsProcessed: number;
  rowsImported: number;
  duplicatesSkipped: number;
}

function tiktokOverviewCsv(rows = TIKTOK_OVERVIEW_FULL_ROWS): string {
  const lines = ['"Date","Video Views","Profile Views","Likes","Comments","Shares"'];
  for (const [d, vv, pv, l, c, s] of rows) {
    lines.push(`"${d}","${vv}","${pv}","${l}","${c}","${s}"`);
  }
  return lines.join("\n");
}

function tiktokFollowerCsv(rows = TIKTOK_FOLLOWER_FULL_ROWS): string {
  const lines = ['"Date","Followers","Difference in followers from previous day"'];
  for (const [d, f, delta] of rows) {
    lines.push(`"${d}","${f}","${delta}"`);
  }
  return lines.join("\n");
}

const enc = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Six real IG per-metric files merged (UTF-16 bytes), base64. */
function igFilesB64(): Array<{ name: string; contentB64: string }> {
  const titles = ["Views", "Viewers", "Content interactions", "Facebook visits", "Facebook link clicks", "Facebook follows"];
  return titles.map((t) => {
    const rows: Array<[string, number]> = IG_DATES_28.map((d, i) => [d, IG_FILES_6[t][i]]);
    return { name: `${t}.csv`, contentB64: instagramBytes(t, rows).toString("base64") };
  });
}

describe("POST /api/insight/import — preview (confirm=false)", () => {
  it("detects Instagram and merges 6 files -> 28 new rows (no write)", async () => {
    const { source, api } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const before = api.find("INSIGHT").values.length;
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: igFilesB64(), confirm: false }, audit,
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.platform).toBe("Instagram");
    expect(b.rowCount).toBe(28);
    expect(b.newRows).toHaveLength(28);
    expect(b.potentialDuplicates).toHaveLength(0);
    expect(b.preview[0]).toMatchObject({ TANGGAL: "22/8/2026", PLATFORM: "Instagram", VIEW: 8226 });
    expect(b.validation.ok).toBe(true);
    // No rows actually appended to the fake insight tab (read-only preview).
    expect(api.find("INSIGHT").values.length).toBe(before);
    expect(audit.entries).toHaveLength(0); // nothing recorded on preview
  });

  it("detects TikTok Overview+FollowerHistory -> 18 rows with computed interaction", async () => {
    const { source } = makeFakeSource();
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      {
        files: [
          { name: "Overview.csv", contentB64: enc(tiktokOverviewCsv()) },
          { name: "FollowerHistory.csv", contentB64: enc(tiktokFollowerCsv()) },
        ],
        confirm: false,
      },
      new MemoryAuditLog(),
    );
    const b = await body(res);
    expect(res.status).toBe(200);
    expect(b.platform).toBe("TikTok");
    expect(b.rowCount).toBe(18);
    const aug31 = b.preview.find((r: Record<string, unknown>) => r.TANGGAL === "31/8/2026");
    if (!aug31) throw new Error("expected Aug 31 row");
    expect(aug31["CONTENT INTERACTION"]).toBe(44);
    expect(aug31["FOLLOWER"]).toBe(35);
    expect(aug31["REACH"]).toBe(0);
  });

  it("manual platform override is used when detection is null/ambiguous", async () => {
    const { source } = makeFakeSource();
    // A plain Date,Views file has no decisive IG/TikTok signal -> detection null;
    // the manual "instagram" override then drives the transform.
    const csv = '"Date","Views"\n"2026-09-01T00:00:00","100"\n"2026-09-02T00:00:00","200"';
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: [{ name: "x.csv", contentB64: enc(csv) }], platform: "instagram", confirm: false },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.platform).toBe("Instagram");
    expect(b.rowCount).toBe(2);
    expect(b.validation.ok).toBe(true);
  });

  it("defers an unknown platform on preview via platformDetected:false (no throw)", async () => {
    const { source } = makeFakeSource();
    // A plain Date,Views file has no decisive IG/TikTok signal -> detection null
    // and no manual override -> the preview returns platformDetected:false (200)
    // instead of throwing, so the UI can render the manual platform Select.
    const csv = '"Date","Views"\n"2026-09-01T00:00:00","100"\n"2026-09-02T00:00:00","200"';
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: [{ name: "x.csv", contentB64: enc(csv) }], confirm: false },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.platformDetected).toBe(false);
    expect(b.platform).toBeNull();
    expect(b.rowCount).toBe(0);
    expect(b.preview).toHaveLength(0);
    expect(b.newRows).toHaveLength(0);
    // No write, no audit on a deferred preview (the source is never fetched).
    expect(source.cacheImpl.size()).toBe(0);
  });

  it("returns 400 for an unsupported file type", async () => {
    const { source } = makeFakeSource();
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: [{ name: "x.txt", contentB64: enc("a,b\n1,2") }], confirm: false },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no files provided", async () => {
    const { source } = makeFakeSource();
    const res = await insightImportController(makeSession("e", "editor"), source, { files: [], confirm: false }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });
});

describe("POST /api/insight/import — confirm=true (writes)", () => {
  it("appends new rows through the source and audits", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const res = await insightImportController(
      makeSession("editor-user", "editor"), source,
      { files: igFilesB64(), confirm: true },
      audit,
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.rowsProcessed).toBe(28);
    expect(b.rowsImported).toBe(28);
    expect(b.duplicatesSkipped).toBe(0);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ operation: "import", tableKey: "insight", actor: "editor-user", success: true });
    // Cache invalidated after write.
    expect(source.cacheImpl.has("insight")).toBe(false);
  });

  it("skips duplicates by default and counts them", async () => {
    const { source } = makeFakeSource({
      seed: (_title, key) =>
        key === "insight"
          ? [["TANGGAL", "PLATFORM", "VIEW", "REACH", "CONTENT INTERACTION", "PROFILE VISIT", "LINK CLICKS", "FOLLOWER"],
             ["22/8/2026", "Instagram", 5, 5, 1, 1, 0, 0]]
          : [columnsFor(key)],
    });
    const audit = new MemoryAuditLog();
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: igFilesB64(), confirm: true },
      audit,
    );
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.rowsImported).toBe(27); // 28 minus 1 existing dup
    expect(b.duplicatesSkipped).toBe(1);
  });

  it("mode:'all' imports new rows + potential duplicates", async () => {
    const { source } = makeFakeSource({
      seed: (_title, key) =>
        key === "insight"
          ? [["TANGGAL", "PLATFORM", "VIEW", "REACH", "CONTENT INTERACTION", "PROFILE VISIT", "LINK CLICKS", "FOLLOWER"],
             ["22/8/2026", "Instagram", 5, 5, 1, 1, 0, 0]]
          : [columnsFor(key)],
    });
    const audit = new MemoryAuditLog();
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: igFilesB64(), confirm: true, mode: "all" },
      audit,
    );
    const b = await body(res);
    expect(res.status).toBe(200);
    expect(b.rowsProcessed).toBe(28);
    expect(b.rowsImported).toBe(27);
    expect(b.duplicatesSkipped).toBe(0);
  });

  it("does NOT write when validation blocks (transaction-like)", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const badCsv = '"Date","Foo"\n"1/9/2026","100"'; // no Views metric
    const res = await insightImportController(
      makeSession("e", "editor"), source,
      { files: [{ name: "x.csv", contentB64: enc(badCsv) }], platform: "instagram", confirm: true },
      audit,
    );
    expect(res.status).toBe(400);
    const b = await body(res);
    expect(b.ok).toBe(false);
    expect(b.blockReasons.length).toBeGreaterThan(0);
    expect(audit.entries).toHaveLength(0); // no write, no audit
  });

  it("returns 403 for a viewer", async () => {
    const { source } = makeFakeSource();
    const res = await insightImportController(makeSession("v", "viewer"), source, { files: igFilesB64(), confirm: false }, new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await insightImportController(null, source, { files: igFilesB64(), confirm: false }, new MemoryAuditLog());
    expect(res.status).toBe(401);
  });
});