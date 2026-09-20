import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DmDashboard } from "@/workspaces/DmDashboard";
import {
  deriveDmStats,
  platformCol,
  statusCol,
  tagCol,
  normalizeUsername,
  buildLink,
  normalizePhone,
  todayYmd,
  buildAppendPayload,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TAG_OPTIONS,
} from "@/workspaces/dm";
import {
  appendTableController,
} from "@/server/api/tableControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { columnsFor } from "@/server/adapter/schema";
import { makeFakeSource, makeSession } from "@/server/api/testHelpers";
import { buildCellRows } from "@/lib/validation";
import type { Row } from "@/server/adapter/source";

/** Exact declared dm_sosmed columns (schema.ts). */
const COLS = columnsFor("dm_sosmed");
const STATUS = "Status";
const TAG = "Tag Prospek";

function dmRow(partial: Partial<Row>): Row {
  return {
    No: 0,
    Platform: "",
    "Nama / Username": "",
    "Link Username": "",
    "No HP/ Whatsapp": "",
    Domisili: "",
    [STATUS]: "",
    [TAG]: "",
    "Tanggal Masuk": "",
    ...partial,
  };
}

const FIXTURE: Row[] = [
  dmRow({ No: 1, Platform: "Instagram", [STATUS]: "Daftar", [TAG]: "HOT LEAD" }),
  dmRow({ No: 2, Platform: "Tiktok", [STATUS]: "Follow Up", [TAG]: "WARM LEAD" }),
  dmRow({ No: 3, Platform: "instagram", [STATUS]: "Closing", [TAG]: "HOT LEAD" }),
  dmRow({ No: 4, Platform: "Facebook", [STATUS]: "Daftar", [TAG]: "" }),
  dmRow({ No: 5, Platform: "TikTok", [STATUS]: "", [TAG]: "COLD LEAD" }),
];

describe("dm derivations (V3 6_DM_Sosmed.py parity)", () => {
  it("resolves the platform col as 'Platform' when present", () => {
    expect(platformCol(FIXTURE)).toBe("Platform");
  });

  it("falls back to the 2nd row-key column when 'Platform' absent", () => {
    const rows: Row[] = [{ f: 1, PlatformX: "Instagram" }, { f: 2, PlatformX: "Tiktok" }];
    // f first, then PlatformX -> cols[1] = 'PlatformX'
    expect(rows[0] && platformCol(rows)).toBe("PlatformX");
  });

  it("returns no platform col when only one column exists", () => {
    expect(platformCol([{ Nama: "X" }])).toBeUndefined();
  });

  it("resolves status col as 'Status DM' then 'Status'", () => {
    expect(statusCol(FIXTURE)).toBe(STATUS);
    expect(statusCol([{ "Status DM": "x" }])).toBe("Status DM");
    expect(statusCol([{ Nama: "X" }])).toBeUndefined();
  });

  it("resolves tag col as 'Tag Prospek' then 'Tag'", () => {
    expect(tagCol(FIXTURE)).toBe(TAG);
    expect(tagCol([{ Tag: "x" }])).toBe("Tag");
    expect(tagCol([{ Nama: "X" }])).toBeUndefined();
  });

  it("computes metrics (case-insensitive platform counts)", () => {
    const s = deriveDmStats(FIXTURE);
    expect(s.total).toBe(5);
    expect(s.instagram).toBe(2); // Instagram + "instagram"
    expect(s.tiktok).toBe(2); // Tiktok + TikTok
    expect(s.facebook).toBe(1);
    expect(s.platCol).toBe("Platform");
  });

  it("counts nothing when no platform col resolves (metrics still show total)", () => {
    const s = deriveDmStats([{ Nama: "A" }, { Nama: "B" }]);
    expect(s.total).toBe(2);
    expect(s.instagram).toBe(0);
    expect(s.platCol).toBeUndefined();
  });

  it("status distribution counts all rows (incl. empty), desc", () => {
    const s = deriveDmStats(FIXTURE);
    const byName = Object.fromEntries(s.statusDist.map((d) => [d.name, d.n]));
    expect(byName).toEqual({ Daftar: 2, "Follow Up": 1, Closing: 1, "": 1 });
    expect(s.statusDist[0].n).toBe(2); // desc order
  });

  it("tag distribution strips empty tags first (V3 filter)", () => {
    const s = deriveDmStats(FIXTURE);
    const byName = Object.fromEntries(s.tagDist.map((d) => [d.name, d.n]));
    // r4 has empty tag -> excluded
    expect(byName).toEqual({ "HOT LEAD": 2, "WARM LEAD": 1, "COLD LEAD": 1 });
  });

  it("recent = reversed rows, take 15", () => {
    const many = Array.from({ length: 20 }, (_, i) => dmRow({ No: i + 1, Platform: "Instagram" }));
    const s = deriveDmStats(many);
    expect(s.recent).toHaveLength(15);
    expect(s.recent[0].No).toBe(20); // reversed
    expect(s.recent[14].No).toBe(6);
  });

  it("has empty dists for empty rows", () => {
    const s = deriveDmStats([]);
    expect(s.total).toBe(0);
    expect(s.statusDist).toEqual([]);
    expect(s.tagDist).toEqual([]);
    expect(s.recent).toEqual([]);
  });
});

describe("append payload builder (V3 submission semantics)", () => {
  const NOW = new Date(2026, 8, 15); // 2026-09-15

  it("normalizes username by removing all '@' (V3 strip + replace @)", () => {
    expect(normalizeUsername("  @user@name ")).toBe("username");
    expect(normalizeUsername("user")).toBe("user");
  });

  it("builds links per platform (instagram no @, tiktok @, fallback facebook)", () => {
    expect(buildLink("Instagram", "u")).toBe("https://instagram.com/u");
    expect(buildLink("Tiktok", "u")).toBe("https://tiktok.com/@u");
    expect(buildLink("Facebook", "u")).toBe("https://facebook.com/u");
    expect(buildLink("Unknown", "u")).toBe("https://facebook.com/u"); // V3 .get fallback
  });

  it("normalizes phone: empty -> '', leading 0 -> ' + 62 + rest, else ' + number", () => {
    expect(normalizePhone("   ")).toBe("");
    expect(normalizePhone("08123456789")).toBe("'628123456789");
    expect(normalizePhone("812345678")).toBe("'812345678");
  });

  it("formats today as YYYY-MM-DD", () => {
    expect(todayYmd(NOW)).toBe("2026-09-15");
  });

  it("builds the schema-keyed append object with seq/date/link/hp", () => {
    const payload = buildAppendPayload(
      { platform: "Instagram", username: "@nia", domisili: "Sleman", hp: "0812-3", statusDm: "Daftar", tagDm: "HOT LEAD" },
      4,
      NOW,
    );
    expect(payload).toEqual({
      No: 5, // rows.length + 1
      Platform: "Instagram",
      "Nama / Username": "@nia",
      "Link Username": "https://instagram.com/nia",
      "No HP/ Whatsapp": "'62812-3",
      Domisili: "Sleman",
      Status: "Daftar",
      "Tag Prospek": "HOT LEAD",
      "Tanggal Masuk": "2026-09-15",
    });
    // All keys are declared schema columns.
    expect(Object.keys(payload)).toEqual(COLS);
  });

  it("seq is 1 when rows are empty, and uses schema Status/Tag keys", () => {
    const payload = buildAppendPayload(
      { platform: "Tiktok", username: "b", domisili: "", hp: "0899", statusDm: "Follow Up", tagDm: "WARM LEAD" },
      0,
      NOW,
    );
    expect(payload.No).toBe(1);
    expect(payload["No HP/ Whatsapp"]).toBe("'62899");
    expect(payload.Status).toBe("Follow Up");
    expect(payload["Tag Prospek"]).toBe("WARM LEAD");
  });
});

describe("append controller + validation vs dm_sosmed schema (mock source)", () => {
  it("appendTableController writes a schema-keyed DM row for an editor", async () => {
    const { source } = makeFakeSource({
      seed: (title, key) =>
        key === "dm_sosmed"
          ? [COLS, [1, "Instagram", "nia", "https://instagram.com/nia", "", "", "Daftar", "HOT LEAD", "2026-09-01"]]
          : [columnsFor(key)],
    });
    const audit = new MemoryAuditLog();
    const res = await appendTableController(
      makeSession("editor-user", "editor"),
      source,
      "dm_sosmed",
      buildAppendPayload(
        { platform: "Facebook", username: "@baru", domisili: "Kulon", hp: "0813-5", statusDm: "Closing", tagDm: "COLD LEAD" },
        1,
        new Date(2026, 8, 15),
      ),
      audit,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, affected: 1 });
    expect(audit.entries[0]).toMatchObject({ operation: "append", tableKey: "dm_sosmed", actor: "editor-user", success: true });
  });

  it("rejects an unknown (non-schema) column with 400", async () => {
    const { source } = makeFakeSource();
    const res = await appendTableController(
      makeSession("editor-user", "editor"),
      source,
      "dm_sosmed",
      { No: 1, Platform: "Instagram", Bogus: "x" },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: { code: string } };
    expect(b.error.code).toBe("VALIDATION_FAILED");
  });

  it("buildCellRows projects to declared column order; missing keys -> ''", () => {
    const cells = buildCellRows("dm_sosmed", {
      Platform: "Instagram",
      "Nama / Username": "x",
      "No HP/ Whatsapp": "'62812",
      Status: "Daftar",
    });
    expect(cells).toHaveLength(1);
    const row = cells[0];
    // Projected into schema order by header (No, Platform, Nama / Username, ...).
    expect(row[0]).toBe(""); // No missing
    expect(row[1]).toBe("Instagram");
    expect(row[2]).toBe("x");
    expect(row[3]).toBe(""); // Link missing
    expect(row[4]).toBe("'62812");
    expect(row[5]).toBe(""); // Domisili missing
    expect(row[6]).toBe("Daftar");
    expect(row[7]).toBe(""); // Tag missing
    expect(row[8]).toBe(""); // Tanggal missing
    expect(row).toHaveLength(COLS.length);
  });
});

describe("DmDashboard (react-dom/server, no browser)", () => {
  it("renders hero, metrics, viz, form, options and recent", () => {
    const html = renderToStaticMarkup(
      <DmDashboard rows={FIXTURE} columns={COLS} />,
    );
    expect(html).toContain("Digital Marketing");
    expect(html).toContain("Metrik Kunci");
    expect(html).toContain("Total Prospek");
    expect(html).toContain("Visualisasi");
    expect(html).toContain("Input Prospek Baru");
    expect(html).toContain("Update Terbaru");
    expect(html).toContain("Refresh Data");
    // Platform options present
    for (const p of PLATFORM_OPTIONS) expect(html).toContain(p);
    for (const s of STATUS_OPTIONS) expect(html).toContain(s);
    for (const t of TAG_OPTIONS) expect(html).toContain(t);
  });

  it("renders the empty state (no metrics/viz, but form + empty recent)", () => {
    const html = renderToStaticMarkup(
      <DmDashboard rows={[]} columns={COLS} />,
    );
    expect(html).toContain("Digital Marketing");
    expect(html).toContain("Input Prospek Baru");
    expect(html).toContain("Belum ada data DM.");
    // Metric section is gated on non-empty data (V3 `if not df.empty`).
    expect(html).not.toContain("Metrik Kunci");
    expect(html).not.toContain("Visualisasi");
  });
});