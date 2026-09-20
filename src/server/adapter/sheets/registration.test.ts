import { describe, expect, it } from "vitest";
import { REGISTRATION_COLUMNS, REGISTRATION_TAB } from "../registrationSchema";
import { readRegistrationTable, RegistrationSource } from "./registration";
import { FakeApi } from "./testUtils";

/** A realistic registration data row (indexes match REGISTRATION_COLUMNS). */
function regValues(tsValue: unknown, partial: unknown[] = []): unknown[] {
  const row = new Array<unknown>(REGISTRATION_COLUMNS.length).fill("");
  row[0] = tsValue; // Timestamp
  row[1] = "Nama Test"; // Nama Lengkap
  row[11] = "62813000001"; // Nomor Whatsapp
  row[21] = "Instagram"; // MENGETAHUI DUTA PERSADA DARI
  row[25] = "Sudah"; // Penjadwalan Interview
  row[27] = "Sudah"; // Interview
  row[28] = "Ya"; // Hasil Interview
  row[31] = "Sudah"; // Pembayaran
  for (let i = 0; i < partial.length; i++) {
    if (partial[i] !== undefined) row[i] = partial[i];
  }
  return row;
}

describe("registration read path + source (FakeApi)", () => {
  it("readRegistrationTable normalizes rows against the 35 live columns", async () => {
    const api = new FakeApi([{
      title: REGISTRATION_TAB,
      gid: 1,
      values: [REGISTRATION_COLUMNS, regValues("1/13/2026 16:35:42")],
    }]);
    const rows = await readRegistrationTable(api, "fake");
    expect(rows).toHaveLength(1);
    expect(rows[0]["Nama Lengkap"]).toBe("Nama Test");
    expect(rows[0]["Nomor Whatsapp"]).toBe("62813000001");
    expect(rows[0]["MENGETAHUI DUTA PERSADA DARI"]).toBe("Instagram");
    expect(rows[0]["Penjadwalan Interview"]).toBe("Sudah");
    expect(rows[0]["Hasil Interview\n(Diterima/Tidak)"]).toBe("Ya");
    expect(rows[0].Timestamp).toBe("1/13/2026 16:35:42");
  });

  it("graceful empty when the registration tab is missing", async () => {
    const api = new FakeApi([]);
    expect(await readRegistrationTable(api, "fake")).toEqual([]);
  });

  it("RegistrationSource.fetch caches across calls", async () => {
    const api = new FakeApi([{
      title: REGISTRATION_TAB,
      gid: 1,
      values: [REGISTRATION_COLUMNS, regValues("1/13/2026 16:35:42")],
    }]);
    const src = new RegistrationSource(api, "fake");
    const a = await src.fetch();
    const b = await src.fetch();
    expect(a).toHaveLength(1);
    expect(b).toEqual(a);
    expect(src.spreadsheetId).toBe("fake");
  });

  it("maps only declared columns; extra live columns ignored", async () => {
    const extraHeader = [...REGISTRATION_COLUMNS, "SECRET EXTRA"];
    const row = [...regValues("1/13/2026 16:35:42"), "should-be-dropped"];
    const api = new FakeApi([{
      title: REGISTRATION_TAB,
      gid: 1,
      values: [extraHeader, row],
    }]);
    const rows = await readRegistrationTable(api, "fake");
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("SECRET EXTRA");
  });
});