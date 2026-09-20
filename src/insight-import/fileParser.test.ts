import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseInsightFile } from "./fileParser";
import { decodeCsvBytes, parseCsvBytes, parseCSV } from "@/lib/csv";
import { TIKTOK_OVERVIEW_CSV, TIKTOK_FOLLOWER_CSV, instagramBytes, IG_28_ROWS } from "./__fixtures__";

describe("csv.ts encoding-aware decoder (additive)", () => {
  it("keeps existing parseCSV behavior unchanged", () => {
    expect(parseCSV("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("decodes UTF-8 bytes", () => {
    const buf = Buffer.from('"Date","Views"\n"2026-08-22",5\n', "utf8");
    expect(decodeCsvBytes(buf)).toContain("Date");
  });

  it("detects UTF-16LE BOM and decodes correctly", () => {
    const text = '"Date","Primary"\n"2026-08-22","8226"';
    const buf = Buffer.alloc(2 + text.length * 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < text.length; i++) buf.writeUInt16LE(text.charCodeAt(i), 2 + i * 2);
    const decoded = decodeCsvBytes(buf);
    expect(decoded).toContain("Primary");
    expect(decoded).toContain("2026-08-22");
  });

  it("stripSepPreamble removes the sep=, first line", () => {
    const buf = Buffer.from('sep=,\n"Date","Views"\n"2026-08-22","1"', "utf8");
    const aoa = parseCsvBytes(buf, { stripSepPreamble: true });
    expect(aoa).toHaveLength(2);
    expect(aoa[0]).toEqual(["Date", "Views"]);
  });
});

describe("parseInsightFile — TikTok Overview (UTF-8 multi-metric)", () => {
  it("parses the generic overview shape", () => {
    const f = parseInsightFile("TikTok Overview.csv", Buffer.from(TIKTOK_OVERVIEW_CSV, "utf8"));
    expect(f.kind).toBe("generic");
    expect(f.title).toBeNull();
    expect(f.headers[0]).toBe("date");
    expect(f.headers).toContain("video views");
    expect(f.headers).toContain("likes");
    expect(f.rows).toHaveLength(3);
    expect(f.rows[0]).toMatchObject({ date: "August 31" });
  });
});

describe("parseInsightFile — TikTok FollowerHistory", () => {
  it("parses and keeps the delta column", () => {
    const f = parseInsightFile("FollowerHistory.csv", Buffer.from(TIKTOK_FOLLOWER_CSV, "utf8"));
    expect(f.kind).toBe("generic");
    expect(f.headers).toContain("difference in followers from previous day");
    expect(f.rows[0]).toMatchObject({ date: "August 31" });
  });
});

describe("parseInsightFile — Instagram per-metric (UTF-16 + sep= + title)", () => {
  it("classifies instagram-per-metric with the title", () => {
    const buf = instagramBytes("Views", IG_28_ROWS.slice(0, 2));
    const f = parseInsightFile("Views (10).csv", buf);
    expect(f.kind).toBe("instagram-per-metric");
    expect(f.title).toBe("Views");
    expect(f.headers).toEqual(["date", "primary"]);
    expect(f.rows).toHaveLength(2);
    expect(f.rows[0]).toMatchObject({ date: "2026-08-22T00:00:00" });
  });
});

describe("parseInsightFile — XLSX", () => {
  it("parses an xlsx workbook (generic header)", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Date", "Video Views", "Likes"],
      ["1/9/2026", 100, 5],
      ["2/9/2026", 200, 6],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const f = parseInsightFile("report.xlsx", buf);
    expect(f.kind).toBe("generic");
    expect(f.headers[0]).toBe("date");
    expect(f.rows).toHaveLength(2);
  });

  it("rejects an unsupported extension", () => {
    expect(() => parseInsightFile("x.txt", Buffer.from("a"))).toThrow(/Only CSV and XLS/i);
  });

  it("degrades gracefully for corrupt xlsx (empty/garbage, no throw)", () => {
    // XLSX.read does not throw on non-zip bytes; it yields a garbage sheet.
    // The parser must not crash — it returns a table the validator rejects.
    const f = parseInsightFile("bad.xlsx", Buffer.from("not a zip"));
    expect(f.kind).toBeDefined();
    expect(Array.isArray(f.rows)).toBe(true);
  });
});