import { describe, expect, it } from "vitest";
import {
  getRegistrationController,
  updateRegistrationCellController,
} from "./registrationControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { RegistrationSource } from "@/server/adapter/sheets/registration";
import { FakeApi } from "@/server/adapter/sheets/testUtils";
import { REGISTRATION_COLUMNS, REGISTRATION_TAB } from "@/server/adapter/registrationSchema";
import { makeSession } from "./testHelpers";

const body = async (res: Response) => res.json() as Promise<unknown>;

/** A RegistrationSource over a FakeApi carrying one registrant row. */
function regSource() {
  const row = new Array<unknown>(REGISTRATION_COLUMNS.length).fill("");
  row[0] = "1/13/2026 16:35:42"; // Timestamp
  row[1] = "Nama Test"; // Nama Lengkap
  row[11] = "62813000001"; // Nomor Whatsapp
  const api = new FakeApi([{ title: REGISTRATION_TAB, gid: 1, values: [REGISTRATION_COLUMNS, row] }]);
  const src = new RegistrationSource(api, "fake");
  return { api, src, factory: () => src };
}

describe("GET /api/registration/data (viewer)", () => {
  it("returns normalized registration rows for a viewer", async () => {
    const { factory } = regSource();
    const res = await getRegistrationController(makeSession("v", "viewer"), factory);
    expect(res.status).toBe(200);
    expect(((await body(res)) as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("returns 401 when unauthenticated", async () => {
    const { factory } = regSource();
    const res = await getRegistrationController(null, factory);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/registration/data (updateRegistrationCellController)", () => {
  it("updates a registration cell for an editor, audits, and invalidates cache", async () => {
    const { api, factory } = regSource();
    const audit = new MemoryAuditLog();
    const res = await updateRegistrationCellController(
      makeSession("editor-user", "editor"),
      factory,
      { rowIndex: 0, column: "Nama Lengkap", value: "Budi Baru" },
      audit,
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, rowIndex: 0, column: "Nama Lengkap", affected: 1 });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ operation: "update", tableKey: "registration", actor: "editor-user", success: true });
    // Wrote to the underlying tab (row 2 = dataRow 0 + 2), col B.
    expect(api.tabs[0].values[1][1]).toBe("Budi Baru");
  });

  it("returns 403 for a viewer (write requires editor role)", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(makeSession("v", "viewer"), factory, { rowIndex: 0, column: "Nama Lengkap", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(null, factory, { rowIndex: 0, column: "Nama Lengkap", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(401);
  });

  it("rejects an invalid rowIndex (400)", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(makeSession("e", "editor"), factory, { rowIndex: -1, column: "Nama Lengkap", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("rejects an unknown registration column (400)", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(makeSession("e", "editor"), factory, { rowIndex: 0, column: "Nope", value: "x" }, new MemoryAuditLog());
    expect(res.status).toBe(400);
    const b = await body(res);
    expect((b as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a non-scalar value (400)", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(makeSession("e", "editor"), factory, { rowIndex: 0, column: "Nama Lengkap", value: { nested: 1 } }, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("rejects a non-object body (400)", async () => {
    const { factory } = regSource();
    const res = await updateRegistrationCellController(makeSession("e", "editor"), factory, null, new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("surfaces COLUMN_NOT_FOUND adapter failure as 500-ish adapter error", async () => {
    // A column valid per REGISTRATION_COLUMNS but absent from the LIVE tab header.
    const api = new FakeApi([{
      title: REGISTRATION_TAB,
      gid: 1,
      values: [["Timestamp", "Nama Lengkap"], ["1/13/2026 16:35:42", "A"]], // lacks 'PIC'
    }]);
    const src = new RegistrationSource(api, "fake");
    const res = await updateRegistrationCellController(
      makeSession("e", "editor"),
      () => src,
      { rowIndex: 0, column: "PIC", value: "ONLINE" },
      new MemoryAuditLog(),
    );
    expect(res.status).toBe(502);
    expect(((await body(res)) as { error: { code: string } }).error.code).toBe("ADAPTER_FAILED");
  });
});
