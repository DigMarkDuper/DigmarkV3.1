import { describe, expect, it } from "vitest";
import type { Row } from "@/server/adapter/source";
import { aggregateProspectDistribution } from "./aggregation";

/** Build a wa_admin-style row. date: "YYYY-MM-DD" or undefined. */
function row(asal: unknown, date = "2026-09-10"): Row {
  return { "Tanggal Masuk": date, Asal: asal };
}

describe("aggregateProspectDistribution", () => {
  it("TEST1: normal data across the five core regions", () => {
    const rows = [
      row("Yogyakarta"),
      row("Jogja"),
      row("Jawa Tengah"),
      row("Jawa Barat"),
      row("Jawa Timur"),
      row("Jakarta"),
    ];
    const a = aggregateProspectDistribution(rows);
    expect(a.summary.totalMapped).toBe(6);
    expect(a.summary.regions).toBe(5);
    expect(a.provinces.map((p) => p.province)).toEqual(
      expect.arrayContaining([
        "Daerah Istimewa Yogyakarta",
        "Jawa Tengah",
        "Jawa Barat",
        "Jawa Timur",
        "DKI Jakarta",
      ]),
    );
    expect(a.summary.topProvince).toBe("Daerah Istimewa Yogyakarta");
    expect(a.unmapped.count).toBe(0);
    // DIY = 2/6 ~ 33.33%; the four single regions = 1/6 ~ 16.67%
    expect(a.provinces.find((p) => p.province === "Daerah Istimewa Yogyakarta")?.pct).toBeCloseTo(33.333, 1);
    expect(a.provinces.find((p) => p.count === 1)?.pct).toBeCloseTo(16.667, 1);
    expect(a.provinces).toHaveLength(5);
  });

  it("TEST2: Jogja/Yogyakarta/Yogya aggregate into the same province+region", () => {
    const a = aggregateProspectDistribution([row("Jogja"), row("Yogyakarta"), row("Yogya")]);
    const dy = a.provinces.find((p) => p.province === "Daerah Istimewa Yogyakarta");
    expect(dy?.count).toBe(3);
    expect(a.summary.totalMapped).toBe(3);
    expect(a.summary.regions).toBe(1);
    expect(a.provinceRegions["Daerah Istimewa Yogyakarta"]).toEqual([
      { region: "Daerah Istimewa Yogyakarta", count: 3 },
    ]);
  });

  it("TEST3: empty / null / whitespace / nan rows do not break anything", () => {
    const a = aggregateProspectDistribution([row(""), row(null), row("   "), row("nan"), row("Bantul")]);
    // only Bantul maps (DIY) — empties are excluded everywhere.
    expect(a.summary.totalMapped).toBe(1);
    expect(a.unmapped.count).toBe(0);
    expect(a.summary.regions).toBe(1);
    expect(a.provinces[0]).toMatchObject({ province: "Daerah Istimewa Yogyakarta", count: 1, pct: 100 });
  });

  it("TEST4: unknown value stays unmapped and never crashes", () => {
    const a = aggregateProspectDistribution([row("ABC123"), row("Jawa Timur")]);
    expect(a.summary.totalMapped).toBe(1);
    expect(a.unmapped.count).toBe(1);
    expect(a.unmapped.values).toEqual(["abc123"]);
    expect(a.provinces).toHaveLength(1);
    expect(a.provinces[0].province).toBe("Jawa Timur");
  });

  it("TEST5: month filter changes the results", () => {
    const rows = [
      row("Jakarta", "2026-09-01"),
      row("Jakarta", "2026-09-15"),
      row("Bandung", "2026-10-02"),
      row("Bandung", "2026-10-20"),
    ];
    const all = aggregateProspectDistribution(rows);
    expect(all.summary.totalMapped).toBe(4);

    const sep = aggregateProspectDistribution(rows, "2026-09");
    expect(sep.summary.totalMapped).toBe(2);
    expect(sep.top.map((t) => t.province)).toEqual(["DKI Jakarta"]);
    expect(sep.provinces[0].count).toBe(2);

    const oct = aggregateProspectDistribution(rows, "2026-10");
    expect(oct.summary.totalMapped).toBe(2);
    expect(oct.provinces[0].province).toBe("Jawa Barat");
  });

  it("case/space-insensitive variations are treated as one region", () => {
    const a = aggregateProspectDistribution([
      row(" yogyakarta "),
      row("YOGYAKARTA"),
      row("Yogyakarta"),
    ]);
    expect(a.summary.totalMapped).toBe(3);
    expect(a.summary.regions).toBe(1);
    const dy = a.provinces[0];
    expect(dy.province).toBe("Daerah Istimewa Yogyakarta");
    expect(dy.count).toBe(3);
  });

  it("empty input returns an empty, safe result", () => {
    const a = aggregateProspectDistribution([]);
    expect(a.provinces).toEqual([]);
    expect(a.provinceRegions).toEqual({});
    expect(a.top).toEqual([]);
    expect(a.summary).toEqual({ totalMapped: 0, totalRows: 0, regions: 0, topProvince: "—", topShare: 0 });
    expect(a.unmapped).toEqual({ count: 0, values: [] });
  });
});
