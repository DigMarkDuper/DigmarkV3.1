import { describe, expect, it } from "vitest";
import { validateInsight } from "./insightValidator";
import { dedupeInsight, dedupeKey } from "./insightDedupe";
import { parseInsightFile } from "./fileParser";
import type { InsightSchemaRow } from "./insightTransformer";
import { instagramBytes, IG_28_ROWS } from "./__fixtures__";

function kitRows(): InsightSchemaRow[] {
  return [
    {
      TANGGAL: "22/8/2026", PLATFORM: "Instagram", VIEW: 100, REACH: 90,
      "CONTENT INTERACTION": 5, "PROFILE VISIT": 3, "LINK CLICKS": 1, FOLLOWER: 0,
    },
    {
      TANGGAL: "23/8/2026", PLATFORM: "Instagram", VIEW: 200, REACH: 180,
      "CONTENT INTERACTION": 8, "PROFILE VISIT": 6, "LINK CLICKS": 2, FOLLOWER: 1,
    },
  ];
}

describe("validateInsight — blocking vs non-blocking", () => {
  it("passes for a complete Instagram set", () => {
    const ig = parseInsightFile("Views.csv", instagramBytes("Views", [[IG_28_ROWS[0][0], 5]]));
    const all = parseInsightFile("Interactions.csv", instagramBytes("Content interactions", [[IG_28_ROWS[0][0], 4]]));
    const v = validateInsight([ig, all], kitRows(), "Instagram");
    expect(v.ok).toBe(true);
    expect(v.blockReasons).toEqual([]);
    expect(v.items.find((i) => i.key === "views")!.level).toBe("ok");
  });

  it("blocks when VIEW metric is missing", () => {
    // Only a REACH (Viewers) file — no Views file.
    const files = [parseInsightFile("Viewers.csv", instagramBytes("Viewers", [[IG_28_ROWS[0][0], 9]]))];
    const rows = kitRows().map((r) => ({ ...r, VIEW: 0 }));
    const v = validateInsight(files, rows, "Instagram");
    expect(v.ok).toBe(false);
    expect(v.blockReasons).toContain("Kolom View tidak ditemukan.");
  });

  it("warns (non-block) when optional metrics are missing", () => {
    const ig = parseInsightFile("Views.csv", instagramBytes("Views", [[IG_28_ROWS[0][0], 5]]));
    const v = validateInsight([ig], kitRows(), "Instagram");
    expect(v.ok).toBe(true); // REACH/PROFILE/LINK/FOLLOWER absent but warn-only
    expect(v.items.filter((i) => i.level === "warn").length).toBeGreaterThanOrEqual(2);
  });

  it("blocks TikTok when Likes/Comments/Shares are incomplete", () => {
    // A TikTok Overview missing one of L/C/S.
    const csv = '"Date","Video Views","Profile Views","Likes","Shares"\n"Sep 1","100","4","5","1"';
    const files = [parseInsightFile("Overview.csv", Buffer.from(csv, "utf8"))];
    const v = validateInsight(files, [{
      TANGGAL: "1/9/2026", PLATFORM: "TikTok", VIEW: 100, REACH: 0,
      "CONTENT INTERACTION": 6, "PROFILE VISIT": 4, "LINK CLICKS": 0, FOLLOWER: 0,
    }], "TikTok");
    expect(v.ok).toBe(false);
    expect(v.blockReasons.some((r) => r.includes("Likes/Comments/Shares"))).toBe(true);
  });

  it("blocks with an unknown platform label", () => {
    const v = validateInsight([], [], "Bogus" as "Instagram");
    expect(v.ok).toBe(false);
    expect(v.blockReasons).toContain("Platform tidak dapat dideteksi.");
  });

  it("blocks when there are no valid rows", () => {
    const ig = parseInsightFile("Views.csv", instagramBytes("Views", [[IG_28_ROWS[0][0], 5]]));
    const v = validateInsight([ig], [], "Instagram");
    expect(v.ok).toBe(false);
    expect(v.blockReasons).toContain("Tidak ada baris data valid.");
  });

  it("reports rowCount", () => {
    const ig = parseInsightFile("Views.csv", instagramBytes("Views", [[IG_28_ROWS[0][0], 5]]));
    const v = validateInsight([ig], kitRows(), "Instagram");
    expect(v.rowCount).toBe(2);
  });
});

describe("insightDedupe", () => {
  const existing = [
    { TANGGAL: "22/8/2026", PLATFORM: "Instagram", VIEW: 5 },
    { TANGGAL: "1/9/2026", PLATFORM: "TikTok", VIEW: 100 },
  ];

  it("dedupeKey normalizes (date, platform)", () => {
    expect(dedupeKey("22/8/2026", "Instagram")).toBe("22/8/2026|instagram");
    expect(dedupeKey("22/8/2026", "instagram")).toBe("22/8/2026|instagram");
  });

  it("splits new vs potential duplicates by (TANGGAL, PLATFORM)", () => {
    const newOnes = [
      { TANGGAL: "22/8/2026", PLATFORM: "Instagram" }, // dup
      { TANGGAL: "1/9/2026", PLATFORM: "TikTok" },     // dup
      { TANGGAL: "2/9/2026", PLATFORM: "TikTok" },     // new
      { TANGGAL: "23/8/2026", PLATFORM: "Instagram" }, // new (odd/even same platform diff date ok)
    ] as unknown as InsightSchemaRow[];
    const { newRows, potentialDuplicates } = dedupeInsight(existing, newOnes);
    expect(newRows).toHaveLength(2);
    expect(potentialDuplicates).toHaveLength(2);
    expect(newRows[0].TANGGAL).toBe("2/9/2026");
    expect(newRows[1].TANGGAL).toBe("23/8/2026");
  });

  it("returns empty for fully existing input", () => {
    const dup = [{ TANGGAL: "22/8/2026", PLATFORM: "Instagram" }] as unknown as InsightSchemaRow[];
    const { newRows, potentialDuplicates } = dedupeInsight(existing, dup);
    expect(newRows).toHaveLength(0);
    expect(potentialDuplicates).toHaveLength(1);
  });
});