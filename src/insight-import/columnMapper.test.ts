import { describe, expect, it } from "vitest";
import { mapHeaderToMetric, registerAlias, ALIASES } from "./columnMapper";
import { detectPlatform, isPlatform, normalizePlatform } from "./platformDetector";
import { parseInsightFile } from "./fileParser";
import { TIKTOK_OVERVIEW_CSV, TIKTOK_FOLLOWER_CSV, instagramBytes, IG_28_ROWS } from "./__fixtures__";

describe("columnMapper aliases (case-insensitive, whitespace-collapsed)", () => {
  const cases: Array<[string, string | null]> = [
    ["Views", "VIEW"],
    ["views", "VIEW"],
    ["Video Views", "VIEW"],
    ["Video views", "VIEW"],
    ["Total Views", "VIEW"],
    ["Viewers", "REACH"],
    ["Reach", "REACH"],
    ["Content interactions", "CONTENT_INTERACTION"],
    ["Content interaction", "CONTENT_INTERACTION"],
    ["Likes", "LIKES"],
    ["Like", "LIKES"],
    ["Total Likes", "LIKES"],
    ["Comments", "COMMENTS"],
    ["Comment", "COMMENTS"],
    ["Shares", "SHARES"],
    ["Share", "SHARES"],
    ["Profile Views", "PROFILE_VISIT"],
    ["Profile visits", "PROFILE_VISIT"],
    ["Facebook visits", "PROFILE_VISIT"],
    ["Link clicks", "LINK_CLICKS"],
    ["Facebook link clicks", "LINK_CLICKS"],
    ["Follows", "FOLLOWER"],
    ["Facebook follows", "FOLLOWER"],
    ["Follower", "FOLLOWER"],
    ["Difference in followers from previous day", "FOLLOWER"],
    ["Unknown metric", null],
    ["", null],
  ];
  it.each(cases)("maps %j -> %j", (input, expected) => {
    expect(mapHeaderToMetric(input)).toBe(expected);
  });

  it("survives leading/trailing/whitespace", () => {
    expect(mapHeaderToMetric("  Video Views  ")).toBe("VIEW");
    expect(mapHeaderToMetric("Content\ninteractions")).toBe("CONTENT_INTERACTION");
  });

  it("is extensible via registerAlias", () => {
    registerAlias("VIEW", "My Custom Views");
    expect(mapHeaderToMetric("My Custom Views")).toBe("VIEW");
  });

  it("declares all canonical metrics with at least one alias", () => {
    expect(ALIASES.VIEW).toContain("views");
    expect(ALIASES.LIKES).toContain("likes");
    expect(ALIASES.COMMENTS).toContain("comments");
    expect(ALIASES.SHARES).toContain("shares");
    expect(ALIASES.REACH).toContain("viewers");
    expect(ALIASES.PROFILE_VISIT).toContain("profile views");
    expect(ALIASES.LINK_CLICKS).toContain("link clicks");
    expect(ALIASES.FOLLOWER).toContain("followers");
  });
});

describe("platformDetector", () => {
  it("detects Instagram from per-metric files", () => {
    const f = parseInsightFile("Views (10).csv", instagramBytes("Views", IG_28_ROWS.slice(0, 2)));
    const d = detectPlatform([f]);
    expect(d.platform).toBe("Instagram");
    expect(d.confident).toBe(true);
  });

  it("detects TikTok from an Overview file", () => {
    const f = parseInsightFile("TikTok Overview.csv", Buffer.from(TIKTOK_OVERVIEW_CSV, "utf8"));
    const d = detectPlatform([f]);
    expect(d.platform).toBe("TikTok");
  });

  it("detects TikTok from a FollowerHistory file", () => {
    const f = parseInsightFile("FollowerHistory.csv", Buffer.from(TIKTOK_FOLLOWER_CSV, "utf8"));
    const d = detectPlatform([f]);
    expect(d.platform).toBe("TikTok");
  });

  it("returns null (unknown/ambiguous) for a headerless file", () => {
    const f = parseInsightFile("weird.csv", Buffer.from('"Foo","Bar"\n1,2', "utf8"));
    const d = detectPlatform([f]);
    expect(d.platform).toBeNull();
    expect(d.confident).toBe(false);
  });

  it("isPlatform + normalizePlatform validate labels", () => {
    expect(isPlatform("Instagram")).toBe(true);
    expect(isPlatform("TikTok")).toBe(true);
    expect(normalizePlatform("instagram")).toBe("Instagram");
    expect(normalizePlatform("tiktok")).toBe("TikTok");
    expect(normalizePlatform("TikTok")).toBe("TikTok");
    expect(normalizePlatform("X")).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
  });
});