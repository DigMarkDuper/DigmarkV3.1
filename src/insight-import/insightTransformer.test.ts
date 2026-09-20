import { describe, expect, it } from "vitest";
import {
  transformInsight,
  normalizeMetric,
  parseIsoDate,
  parseMonthDay,
  inferTikTokYear,
  toDayFirst,
  insightColumns,
} from "./insightTransformer";
import { parseInsightFile, type ParsedInsightFile } from "./fileParser";
import {
  TIKTOK_OVERVIEW_FULL_ROWS,
  TIKTOK_FOLLOWER_FULL_ROWS,
  instagramBytes,
  IG_28_ROWS,
  IG_FILES_6,
} from "./__fixtures__";

/** Build a full 18-row TikTok Overview CSV from the ground-truth rows. */
function overviewCsvFull(rows = TIKTOK_OVERVIEW_FULL_ROWS): Buffer {
  const lines = ['"Date","Video Views","Profile Views","Likes","Comments","Shares"'];
  for (const [d, vv, pv, l, c, s] of rows) {
    lines.push(`"${d}","${vv}","${pv}","${l}","${c}","${s}"`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function followerCsvFull(rows = TIKTOK_FOLLOWER_FULL_ROWS): Buffer {
  const lines = ['"Date","Followers","Difference in followers from previous day"'];
  for (const [d, f, delta] of rows) {
    lines.push(`"${d}","${f}","${delta}"`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

describe("normalizeMetric (MEV real numbers)", () => {
  const cases: Array<[unknown, number]> = [
    ["10,000", 10000],
    ["10.000", 10000],
    ["1.2K", 1200],
    ["1.2k", 1200],
    ["1,234", 1234],
    ["100", 100],
    ["", 0],
    ["-", 0],
    ["–", 0],
    [null, 0],
    [undefined, 0],
    [42, 42],
    ["abc", 0],
    ["-17", -17],
    ["0", 0],
  ];
  it.each(cases)("%j -> %d", (input, expected) => {
    expect(normalizeMetric(input)).toBe(expected);
  });
});

describe("date helpers", () => {
  it("parseIsoDate converts IG ISO timestamps to D/M/YYYY", () => {
    expect(parseIsoDate("2026-08-22T00:00:00")).toBe("22/8/2026");
    expect(parseIsoDate("2026-09-18T00:00:00")).toBe("18/9/2026");
    expect(parseIsoDate("garbage")).toBeNull();
  });

  it("parseMonthDay handles TikTok MonthName Day", () => {
    expect(parseMonthDay("September 17")).toEqual({ month: 9, day: 17 });
    expect(parseMonthDay("August 31")).toEqual({ month: 8, day: 31 });
    expect(parseMonthDay("12/9")).toBeNull();
  });

  it("inferTikTokYear uses current year unless dates are in the future", () => {
    const now = new Date(2026, 8, 19); // Sep 19 2026
    // Aug 31..Sep 17 2026 are all <= today -> current year.
    expect(inferTikTokYear(["August 31", "September 17"], now)).toBe(2026);
    // A future date triggers Y-1 for the whole file.
    expect(inferTikTokYear(["September 25"], now)).toBe(2025);
    expect(inferTikTokYear(["December 31"], now)).toBe(2025);
    expect(inferTikTokYear([])).toBeNull();
    expect(inferTikTokYear(["garbage"])).toBeNull();
  });

  it("toDayFirst is non-padded day-first", () => {
    expect(toDayFirst(new Date(2026, 8, 17))).toBe("17/9/2026");
    expect(toDayFirst(new Date(2026, 0, 1))).toBe("1/1/2026");
  });
});

describe("transformInsight — TikTok", () => {
  it("computes CONTENT INTERACTION = Likes + Comments + Shares", () => {
    const files: ParsedInsightFile[] = [
      parseInsightFile("TikTok Overview.csv", overviewCsvFull()),
      parseInsightFile("FollowerHistory.csv", followerCsvFull()),
    ];
    const now = new Date(2026, 8, 19);
    const { rows, warnings } = transformInsight(files, "TikTok", now);
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(18);
    // First day Aug 31: L+С+С = 31+2+11 = 44.
    const aug31 = rows.find((r) => r.TANGGAL === "31/8/2026");
    expect(aug31).toBeDefined();
    expect(aug31!["CONTENT INTERACTION"]).toBe(44);
    expect(aug31!["VIEW"]).toBe(1441);
    expect(aug31!["PROFILE VISIT"]).toBe(52);
    expect(aug31!["REACH"]).toBe(0); // TikTok absent -> 0
    expect(aug31!["LINK CLICKS"]).toBe(0);
    expect(aug31!["FOLLOWER"]).toBe(35); // delta column
    // Row for Sep 12 (negative follower delta).
    const sep12 = rows.find((r) => r.TANGGAL === "12/9/2026");
    expect(sep12!["FOLLOWER"]).toBe(-6);
    // Last day Sep 17: L+C+S = 73+0+3 = 76.
    const sep17 = rows.find((r) => r.TANGGAL === "17/9/2026");
    expect(sep17!["CONTENT INTERACTION"]).toBe(76);
    expect(sep17!["TANGGAL"]).toBe("17/9/2026");
    expect(sep17!["PLATFORM"]).toBe("TikTok");
    // REACH absent -> 0 for all TikTok rows.
    expect(rows.every((r) => r["REACH"] === 0)).toBe(true);
  });
});

describe("transformInsight — Instagram merge of 6 per-metric files", () => {
  it("merges to one row per date with all metrics (28 days)", () => {
    const now = new Date(2026, 8, 19);
    const titles = ["Views", "Viewers", "Content interactions", "Facebook visits", "Facebook link clicks", "Facebook follows"];
    const files: ParsedInsightFile[] = titles.map((t) => {
      const buf = instagramBytes(t, IG_28_ROWS.map(([d], i) => [d, IG_FILES_6[t][i]]));
      return parseInsightFile(`${t}.csv`, buf);
    });
    const { rows } = transformInsight(files, "Instagram", now);
    expect(rows).toHaveLength(28);
    // First date 22/8/2026.
    const first = rows[0];
    expect(first.TANGGAL).toBe("22/8/2026");
    expect(first.PLATFORM).toBe("Instagram");
    expect(first["VIEW"]).toBe(8226);
    expect(first["REACH"]).toBe(7485);
    expect(first["CONTENT INTERACTION"]).toBe(10);
    expect(first["PROFILE VISIT"]).toBe(24);
    expect(first["LINK CLICKS"]).toBe(16);
    expect(first["FOLLOWER"]).toBe(3);
    // Last date 18/9/2026.
    const last = rows[rows.length - 1];
    expect(last.TANGGAL).toBe("18/9/2026");
    expect(last["VIEW"]).toBe(32370);
    expect(last["REACH"]).toBe(31347);
    expect(last["FOLLOWER"]).toBe(1);
    // Types are real numbers.
    expect(typeof first["VIEW"]).toBe("number");
    expect(Number.isNaN(first["VIEW"] as number)).toBe(false);
  });
});

describe("insightColumns", () => {
  it("matches the shared schema source of truth", () => {
    expect(insightColumns()).toEqual([
      "TANGGAL", "PLATFORM", "VIEW", "REACH", "CONTENT INTERACTION",
      "PROFILE VISIT", "LINK CLICKS", "FOLLOWER",
    ]);
  });
});