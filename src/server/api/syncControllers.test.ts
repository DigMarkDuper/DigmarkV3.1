import { describe, expect, it } from "vitest";
import { syncController } from "./syncControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { makeSession } from "./testHelpers";
import { TAB_SCHEMAS, columnsFor } from "@/server/adapter/schema";
import { FakeApi } from "@/server/adapter/sheets/testUtils";
import { GoogleSheetsSource } from "@/server/adapter/sheets";
import { GoogleSheetsClient } from "@/server/adapter/sheets/client";

const body = async (res: Response) => res.json() as Promise<unknown>;

/** Build a source with WA + CRM tabs seeded so syncWaToCrm adds one row. */
function syncSource() {
  const waCols = columnsFor("wa_admin");
  const waData = new Array<string>(waCols.length).fill("");
  const putW = (col: string, v: string) => {
    const i = waCols.indexOf(col);
    if (i >= 0) waData[i] = v;
  };
  putW("f", "1");
  putW("Tanggal Masuk", "27/09/2025");
  putW("No Hp", "0815-111");
  putW("PIC", "DEA");
  putW("Nama", "Ani");
  putW("Asal", "Bantul");
  putW("Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)", "Biaya");
  putW("Mekari Tag", "");
  putW("Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)", "Closing");

  const api = new FakeApi([
    { title: TAB_SCHEMAS.wa_admin.tab, gid: 1, values: [waCols, waData] },
    { title: TAB_SCHEMAS.crm.tab, gid: 2, values: [columnsFor("crm")] },
  ]);
  for (const k of Object.keys(TAB_SCHEMAS)) {
    const key = k as keyof typeof TAB_SCHEMAS;
    if (key === "wa_admin" || key === "crm") continue;
    api.tabs.push({ title: TAB_SCHEMAS[key].tab, gid: api.tabs.length + 3, values: [columnsFor(key)] });
  }
  const client = new GoogleSheetsClient(api, "fake");
  return { api, source: new GoogleSheetsSource(client, api) };
}

describe("POST /api/sync/wa-to-crm", () => {
  it("runs the B1-correct adapter sync for an editor and audits", async () => {
    const { source } = syncSource();
    const audit = new MemoryAuditLog();
    const res = await syncController(makeSession("editor-user", "editor"), source, audit);
    expect(res.status).toBe(200);
    const b = (await body(res)) as { ok: boolean; added: number };
    expect(b.ok).toBe(true);
    expect(b.added).toBe(1);
    expect(audit.entries[0]).toMatchObject({ operation: "sync", tableKey: "crm", actor: "editor-user", success: true });
    expect(source.cacheImpl.has("crm")).toBe(false); // affected-table invalidated
  });

  it("returns 403 for a viewer", async () => {
    const { source } = syncSource();
    const res = await syncController(makeSession("v", "viewer"), source, new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { source } = syncSource();
    const res = await syncController(null, source, new MemoryAuditLog());
    expect(res.status).toBe(401);
  });
});