/**
 * End-to-end security / authorization tests across the Phase C API surface.
 *
 * Verifies:
 *  - credentials / secrets are NEVER returned in any response body;
 *  - protected endpoints reject unauthenticated requests (401);
 *  - viewers cannot write (403) and cannot destructive-delete (403);
 *  - editors can perform permitted writes;
 *  - session verification rejects expired/tampered/invalid tokens (401 at the
 *    routing layer via `getSession`, whose details live in src/lib/auth.test.ts).
 */

import { describe, expect, it } from "vitest";
import {
  appendTableController,
  getTableController,
  updateCellController,
} from "./tableControllers";
import { clearController } from "./clearControllers";
import { importController } from "./importControllers";
import { syncController } from "./syncControllers";
import { tabsMetaController } from "./metaControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { TAB_SCHEMAS, columnsFor } from "@/server/adapter/schema";
import { FakeApi } from "@/server/adapter/sheets/testUtils";
import { GoogleSheetsSource } from "@/server/adapter/sheets";
import { GoogleSheetsClient } from "@/server/adapter/sheets/client";
import { makeSession } from "./testHelpers";

const text = async (res: Response) => res.text();
const S = TAB_SCHEMAS.sosmed.tab; // "SOSMED"

function source() {
  const api = new FakeApi(
    (Object.keys(TAB_SCHEMAS) as (keyof typeof TAB_SCHEMAS)[]).map((k, i) => ({
      title: TAB_SCHEMAS[k].tab,
      gid: i + 1,
      values: [columnsFor(k)],
    })),
  );
  const client = new GoogleSheetsClient(api, "fake");
  return new GoogleSheetsSource(client, api);
}

describe("Secrets hygiene: nothing sensitive ever returned", () => {
  const forbidden = ["private", "auth_secret", "master_spreadsheet", "google_service", "password", "token"];

  async function allResponses(s: ReturnType<typeof makeSession>): Promise<string> {
    const src = source();
    const audit = new MemoryAuditLog();
    const parts: string[] = [];
    parts.push(await text(await getTableController(s, src, "sosmed")));
    parts.push(await text(await appendTableController(s, src, "sosmed", [{ "Kode Konten": "X" }], audit)));
    parts.push(await text(await updateCellController(s, src, "sosmed", { rowIndex: 0, column: "PROSES", value: "DONE" }, audit)));
    parts.push(await text(await clearController(s, src, "sosmed", { confirm: true, tabTitle: S }, audit)));
    parts.push(await text(await importController(s, src, "sosmed", "x.csv", Buffer.from("Kode Konten\nA\n"), audit)));
    parts.push(await text(await syncController(s, src, audit)));
    parts.push(await text(await tabsMetaController(s, src)));
    return parts.join(" ").toLowerCase();
  }

  it("never leaks secrets in any controller response for any role", async () => {
    for (const role of ["viewer", "editor"] as const) {
      const joined = await allResponses(makeSession("u", role));
      for (const s of forbidden) {
        expect(joined).not.toContain(s);
      }
    }
  });
});

describe("Protected endpoints reject unauthenticated requests (401)", () => {
  it("all write + read endpoints return 401 with no session", async () => {
    const src = source();
    const audit = new MemoryAuditLog();
    expect((await getTableController(null, src, "sosmed")).status).toBe(401);
    expect((await appendTableController(null, src, "sosmed", [{}], audit)).status).toBe(401);
    expect((await updateCellController(null, src, "sosmed", { rowIndex: 0, column: "PROSES", value: "x" }, audit)).status).toBe(401);
    expect((await importController(null, src, "sosmed", "x.csv", Buffer.from("Kode Konten\nA\n"), audit)).status).toBe(401);
    expect((await syncController(null, src, audit)).status).toBe(401);
    expect((await clearController(null, src, "sosmed", { confirm: true, tabTitle: S }, audit)).status).toBe(401);
    expect((await tabsMetaController(null, src)).status).toBe(401);
  });
});

describe("Authorization: viewer read-only, editor writes", () => {
  it("viewer can read, cannot append/update/import/sync/clear (403)", async () => {
    const v = makeSession("viewer", "viewer");
    const src = source();
    const audit = new MemoryAuditLog();
    expect((await getTableController(v, src, "sosmed")).status).toBe(200);
    expect((await tabsMetaController(v, src)).status).toBe(200);
    expect((await appendTableController(v, src, "sosmed", [{}], audit)).status).toBe(403);
    expect((await updateCellController(v, src, "sosmed", { rowIndex: 0, column: "PROSES", value: "x" }, audit)).status).toBe(403);
    expect((await importController(v, src, "sosmed", "x.csv", Buffer.from("Kode Konten\nA\n"), audit)).status).toBe(403);
    expect((await syncController(v, src, audit)).status).toBe(403);
    expect((await clearController(v, src, "sosmed", { confirm: true, tabTitle: S }, audit)).status).toBe(403);
  });

  it("editor can perform all permitted writes", async () => {
    const e = makeSession("editor", "editor");
    const src = source();
    const audit = new MemoryAuditLog();
    expect((await appendTableController(e, src, "sosmed", [{ "Kode Konten": "X" }], audit)).status).toBe(200);
    expect((await updateCellController(e, src, "sosmed", { rowIndex: 0, column: "PROSES", value: "DONE" }, audit)).status).toBe(200);
    expect((await syncController(e, src, audit)).status).toBe(200);
  });

  it("viewer clear is 403 (destructive ops require editor)", async () => {
    const v = makeSession("viewer", "viewer");
    const src = source();
    const res = await clearController(v, src, "sosmed", { confirm: true, tabTitle: S }, new MemoryAuditLog());
    expect(res.status).toBe(403);
    expect((await text(res)).toLowerCase()).toContain("FORBIDDEN".toLowerCase());
  });
});

describe("Session validation path (401 at routing layer)", () => {
  it("null session (getSession result for expired/tampered/invalid token) -> 401", async () => {
    const src = source();
    // getSession returns null for expired/tampered/malformed tokens (verified in
    // src/lib/auth.test.ts); a null session must yield 401 here.
    for (const controller of [
      () => getTableController(null, src, "sosmed"),
      () => appendTableController(null, src, "sosmed", [{}], new MemoryAuditLog()),
      () => tabsMetaController(null, src),
    ]) {
      expect((await controller()).status).toBe(401);
    }
  });
});