import { beforeAll, describe, expect, it } from "vitest";
import { columnsFor, TAB_SCHEMAS, TAB_ORDER } from "../schema";
import { buildSheetsApi, loadSheetConfig, type SheetConfig } from "./auth";
import { buildSandboxSchema, crmStatusColumnIndex } from "./sandbox";
import { createSandboxSource } from "./factory";

/**
 * Phase B sandbox write tests — REAL Google Sheets network calls, targeting
 * ONLY the sandbox spreadsheet (MASTER DATA DUMMY), never production.
 *
 * All destructive operations (buildSandboxSchema, clearTable) are guarded to
 * the sandbox key. The sandbox default 'Sheet1' is removed during bootstrap.
 */
describe("Phase B — sandbox write tests (REAL sandbox)", () => {
  const SANDBOX_ID = "1agkyxd4sIwkB1ExED705xg_53TvZ58ZS5TuaaV4VcnY";

  let cfg: SheetConfig;
  let api: ReturnType<typeof buildSheetsApi>;
  let source: ReturnType<typeof createSandboxSource>;

  beforeAll(async () => {
    cfg = loadSheetConfig();
    expect(cfg.sandboxSpreadsheetKey, "SANDBOX key must be configured").toBe(SANDBOX_ID);
    api = buildSheetsApi(cfg);
    source = createSandboxSource(cfg);
    const boot = await buildSandboxSchema(api, SANDBOX_ID, { seedFixtures: true });
    expect(boot.tabsCreated).toBe(10);
    expect(boot.fixturesSeeded).toBeGreaterThan(0);
  });

  it("bootstraps the sandbox to the 10 declared tabs; no drift; CRM Status at col 15", async () => {
    const boot = await source.bootstrap();
    expect(boot.missingTabs).toEqual([]);
    expect(boot.headerViolations).toEqual([]);
    expect(boot.drift).toBe(false);
    expect(boot.tabs.length).toBe(10);
    expect(boot.sheets.map((s) => s.title).sort()).toEqual(TAB_ORDER.map((k) => TAB_SCHEMAS[k].tab).sort());

    const crmMeta = boot.tabs.find((t) => t.appKey === "crm")!;
    expect(crmMeta.title).toBe("DATABASE NOMOR");
    expect(crmMeta.headers).toEqual(columnsFor("crm"));
    // B1: the LIVE sandbox header row places Status as column 15.
    expect(crmStatusColumnIndex()).toBe(15);
    expect(crmMeta.headers[14]).toBe("Status");
  });

  it("reads seeded CRM fixtures (real read + typed rows)", async () => {
    const rows = await source.fetchTable("crm");
    expect(rows.length).toBeGreaterThan(0);
    const budi = rows.find((r) => r["No Hp"] === "62815000");
    expect(budi).toBeDefined();
    expect(budi!["Nama"]).toBe("Budi");
  });

  it("preserves booleans from the SOSMED sheet (IG/YT/TIKTOK)", async () => {
    const rows = await source.fetchTable("sosmed");
    const ig = rows.find((r) => r["Kode Konten"] === "DP-0501");
    expect(ig).toBeDefined();
    expect(typeof ig!["IG"]).toBe("boolean");
    expect(ig!["IG"]).toBe(true);
    expect(ig!["YT"]).toBe(false);
    expect(ig!["TIKTOK"]).toBe(true);
  });

  it("appends rows to a tab (USER_ENTERED) and reads them back", async () => {
    const before = (await source.fetchTable("website")).length;
    const cols = columnsFor("website");
    const newRow = cols.map((c) =>
      c === "Kode Konten" ? "DPW-9999" : c === "Status Post" ? "DONE" : "",
    );
    const res = await source.appendRows("website", [newRow]);
    expect(res.ok).toBe(true);
    expect(res.affected).toBe(1);

    const after = await source.fetchTable("website");
    expect(after.length).toBe(before + 1);
    const added = after.find((r) => r["Kode Konten"] === "DPW-9999");
    expect(added).toBeDefined();
    expect(added!["Status Post"]).toBe("DONE");
  });

  it("updateCell writes by column header at dataRowIndex+2 (real)", async () => {
    const res = await source.updateCell("website", 0, "Status Post", "CHECKED");
    expect(res.ok).toBe(true);
    const rows = await source.fetchTable("website");
    // First seeded website row is DPW-0267 'Uploaded' -> now 'CHECKED'.
    expect(rows[0]["Kode Konten"]).toBe("DPW-0267");
    expect(rows[0]["Status Post"]).toBe("CHECKED");
  });

  it("clearTable is guarded (refuses without confirm) then clears a tab (real)", async () => {
    await source.appendRows("sosmed", [["DP-CLEAR", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
    const refused = await source.clearTable("insight", {
      appKey: "insight",
      tabTitle: "INSIGHT",
      confirmed: false,
    });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("NOT_CONFIRMED");

    const cleared = await source.clearTable("sosmed", {
      appKey: "sosmed",
      tabTitle: "SOSMED",
      confirmed: true,
      actor: "phase-b-test",
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.message).toContain("Audit");
    const rows = await source.fetchTable("sosmed");
    expect(rows.length).toBe(0); // old fixtures + DP-CLEAR all gone
  });

  it("cache invalidation: a write invalidates only the affected tab (real)", async () => {
    await source.fetchTable("dm_sosmed");
    await source.fetchTable("mekari");
    expect(source.cacheImpl.has("dm_sosmed")).toBe(true);
    expect(source.cacheImpl.has("mekari")).toBe(true);

    await source.appendRows("dm_sosmed", [columnsFor("dm_sosmed").map((c) => (c === "Nama / Username" ? "leads" : ""))]);

    expect(source.cacheImpl.has("dm_sosmed")).toBe(false); // invalidated
    expect(source.cacheImpl.has("mekari")).toBe(true); // untouched tab keeps cache
  });

  it("B1 E2E: WA→CRM sync writes Status to the real 'Status' column (col 15), verified at the raw sheet level (real)", async () => {
    // Deterministic: rebuild the sandbox schema right before syncing.
    await buildSandboxSchema(api, SANDBOX_ID, { seedFixtures: true });

    const summary = await source.syncWaToCrm();
    expect(summary.ok).toBe(true);
    expect(summary.added).toBe(2); // Ani(Closing) + Budi(Follow Up); Junk('double chat') filtered

    // Read RAW rows from the CRM tab to prove column placement physically.
    const raw = await api.spreadsheets.values.get({
      spreadsheetId: SANDBOX_ID,
      range: "'DATABASE NOMOR'!A1:R",
    });
    const rows = raw.data.values ?? [];
    const header = rows[0].map((c) => String(c ?? ""));
    expect(header[14]).toBe("Status"); // 'Status' physically at column 15
    expect(header[17] ?? "").toBe(""); // column 18 is spare (V3 wrote WA status here — bug)

    const statusColIdx = header.indexOf("Status"); // must be 14
    expect(statusColIdx).toBe(14);

    // Find the synced lead rows by their normalized No Hp (col 2).
    const byStatus: Record<string, string> = {};
    for (const r of rows.slice(1)) {
      const phone = String(r[1] ?? "");
      if (phone === "62815111" || phone === "62813000") {
        byStatus[phone] = String(r[statusColIdx] ?? "");
        // V3 bug check: the WA Status must NOT land in the spare col 18 (idx 17).
        expect(r[17] ?? "").toBe("");
      }
    }
    expect(byStatus["62815111"]).toBe("Closing");
    expect(byStatus["62813000"]).toBe("Follow Up");
  });
});