import { describe, expect, it } from "vitest";
import {
  appendTableController,
  getTableController,
  updateCellController,
} from "./tableControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { columnsFor } from "@/server/adapter/schema";
import { makeFakeSource, makeSession } from "./testHelpers";

const body = async (res: Response) => res.json() as Promise<unknown>;

describe("GET /api/tables/[key]", () => {
  it("returns normalized rows for a viewer (cached adapter fetch)", async () => {
    const { source } = makeFakeSource();
    const res = await getTableController(makeSession("v", "viewer"), source, "sosmed");
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, table: "sosmed", rows: [] });
  });

  it("returns 401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await getTableController(null, source, "sosmed");
    expect(res.status).toBe(401);
    const b = await body(res);
    expect((b as { error: { code: string } }).error.code).toBe("AUTH_FAILED");
  });

  it("returns 404 for an unknown table key", async () => {
    const { source } = makeFakeSource();
    const res = await getTableController(makeSession("v", "viewer"), source, "nope");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tables/[key] (append)", () => {
  it("appends rows for an editor and audits the action", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const res = await appendTableController(
      makeSession("editor-user", "editor"),
      source,
      "sosmed",
      [{ "Kode Konten": "DP-1", PROSES: "DONE" }],
      audit,
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, affected: 1 });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ operation: "append", tableKey: "sosmed", actor: "editor-user", success: true });
  });

  it("returns 403 for a viewer", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const res = await appendTableController(makeSession("v", "viewer"), source, "sosmed", [{}], audit);
    expect(res.status).toBe(403);
    const b = await body(res);
    expect((b as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("returns 401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await appendTableController(null, source, "sosmed", [{}], new MemoryAuditLog());
    expect(res.status).toBe(401);
  });

  it("rejects an unknown table key with 404", async () => {
    const { source } = makeFakeSource();
    const res = await appendTableController(makeSession("e", "editor"), source, "nope", [{}], new MemoryAuditLog());
    expect(res.status).toBe(404);
  });

  it("rejects unknown columns (400) rather than trusting position", async () => {
    const { source } = makeFakeSource();
    const res = await appendTableController(makeSession("e", "editor"), source, "sosmed", [{ Bogus: "x" }], new MemoryAuditLog());
    expect(res.status).toBe(400);
    const b = await body(res);
    expect((b as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a non-object / empty payload (400)", async () => {
    const { source } = makeFakeSource();
    for (const bad of [null, [], [1], "string"]) {
      const res = await appendTableController(makeSession("e", "editor"), source, "sosmed", bad, new MemoryAuditLog());
      expect(res.status).toBe(400);
    }
  });
});

describe("PATCH /api/tables/[key] (updateCell)", () => {
  // Seed the FakeApi 'sosmed' tab with a header row + one data row.
  function sosmedSource() {
    const cols = columnsFor("sosmed");
    return makeFakeSource({
      seed: (title, key) =>
        cols.length && key === "sosmed" ? [cols, ["DP-1", "", "", "", "", "", "", "", "", "", "", "PENDING"]] : cols.length ? [cols] : [],
    });
  }

  it("updates a cell by declared column name for an editor and audits", async () => {
    const src = sosmedSource();
    const audit = new MemoryAuditLog();
    const res = await updateCellController(
      makeSession("editor-user", "editor"),
      src.source,
      "sosmed",
      { rowIndex: 0, column: "PROSES", value: "DONE" },
      audit,
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, rowIndex: 0, column: "PROSES", affected: 1 });
    expect(audit.entries[0]).toMatchObject({ operation: "update", actor: "editor-user", success: true });
    // The write invalidated the affected table's cache (adapter behaviour).
    expect(src.source.cacheImpl.has("sosmed")).toBe(false);
  });

  it("returns 403 for a viewer", async () => {
    const src = sosmedSource();
    const res = await updateCellController(makeSession("v", "viewer"), src.source, "sosmed", { rowIndex: 0, column: "PROSES", value: "DONE" }, new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const src = sosmedSource();
    const res = await updateCellController(null, src.source, "sosmed", { rowIndex: 0, column: "PROSES", value: "DONE" }, new MemoryAuditLog());
    expect(res.status).toBe(401);
  });

  it("rejects an invalid rowIndex (400)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(makeSession("e", "editor"), src.source, "sosmed", { rowIndex: -1, column: "PROSES", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("rejects an unknown column (400)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(makeSession("e", "editor"), src.source, "sosmed", { rowIndex: 0, column: "Nope", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("rejects a non-scalar value (400)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(makeSession("e", "editor"), src.source, "sosmed", { rowIndex: 0, column: "PROSES", value: { nested: 1 } }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("rejects a non-object body (400)", async () => {
    const src = sosmedSource();
    const res = await updateCellController(makeSession("e", "editor"), src.source, "sosmed", null, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });
});