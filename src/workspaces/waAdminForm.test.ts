import { describe, expect, it } from "vitest";
import { columnsFor } from "@/server/adapter/schema";
import { normalizePhone } from "@/server/utils/helpers";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  REQUIRED_FIELDS,
  PIC_FALLBACK,
  SUMBER_FALLBACK,
  KATEGORI_FALLBACK,
  STATUS_FALLBACK,
  distinctCellValues,
  timeHmToDotted,
  nowTimeHm,
  todayYmd,
  emptyWaAdminFormValue,
  validateWaAdminForm,
  buildWaAdminPayload,
  type WaAdminFormValues,
} from "@/workspaces/waAdminForm";
import type { Row } from "@/server/adapter/source";

const NOW = new Date(2026, 8, 19, 13, 39); // 2026-09-19 13:39

function values(partial: Partial<WaAdminFormValues> = {}): WaAdminFormValues {
  return {
    tanggalMasuk: "2026-09-19",
    noHp: "081234567890",
    jamChatMasuk: "13:39",
    pic: "BELIA",
    nama: "Test Nama",
    asal: "Instagram",
    sumber: "Organik",
    pertanyaan: "Tanya harga",
    kategori: "Pendaftaran",
    mekariTag: "Cold Lead",
    status: "Follow Up",
    keteranganAdmin: "Sudah follow up",
    ...partial,
  };
}

describe("waAdminForm — value domains & distinct cell values", () => {
  it("falls back to the verified live lists when a column has no data", () => {
    expect(distinctCellValues([], "PIC", PIC_FALLBACK)).toEqual(PIC_FALLBACK);
    expect(distinctCellValues([], "Sumber (Ads/Organik/Sales)", SUMBER_FALLBACK)).toEqual(SUMBER_FALLBACK);
    expect(distinctCellValues([], "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)", KATEGORI_FALLBACK)).toEqual(KATEGORI_FALLBACK);
    expect(distinctCellValues([], STATUS_COLUMN, STATUS_FALLBACK)).toEqual(STATUS_FALLBACK);
  });

  it("derives distinct live values, excluding empty/nan/null, and prefers them over fallback", () => {
    const rows: Row[] = [
      { PIC: "BELIA", [STATUS_COLUMN]: "Closing" },
      { PIC: "DEA", [STATUS_COLUMN]: "Follow Up" },
      { PIC: "BELIA", [STATUS_COLUMN]: "" },
      { PIC: "nan", [STATUS_COLUMN]: "No Response" },
      { Nama: "no pic", [STATUS_COLUMN]: "closing" },
    ];
    expect(distinctCellValues(rows, "PIC", PIC_FALLBACK)).toEqual(["BELIA", "DEA"]);
    expect(distinctCellValues(rows, STATUS_COLUMN, STATUS_FALLBACK)).toEqual([
      "Closing", "Follow Up", "No Response", "closing",
    ]);
  });
});

describe("waAdminForm — time & date formatting", () => {
  it("converts HH:MM to the dot-separated HH.MM the column stores", () => {
    expect(timeHmToDotted("13:39")).toBe("13.39");
    expect(timeHmToDotted("09:05")).toBe("09.05");
    expect(timeHmToDotted("9:5")).toBe("09.05");
    // already dotted passes through
    expect(timeHmToDotted("13.39")).toBe("13.39");
    // garbage returns trimmed as-is (best effort)
    expect(timeHmToDotted("  ")).toBe("");
    expect(timeHmToDotted("abc")).toBe("abc");
  });

  it("nowTimeHm and todayYmd format with zero-padding and YYYY-MM-DD", () => {
    expect(nowTimeHm(NOW)).toBe("13:39");
    expect(todayYmd(NOW)).toBe("2026-09-19");
  });

  it("emptyWaAdminFormValue defaults the date/time pickers to now", () => {
    const v = emptyWaAdminFormValue(NOW);
    expect(v.tanggalMasuk).toBe("2026-09-19");
    expect(v.jamChatMasuk).toBe("13:39");
    expect(v.noHp).toBe("");
  });
});

describe("waAdminForm — validation", () => {
  it("rejects every required-field blank (date/time defaults are pre-filled, so truly-blank ones error)", () => {
    const blank = emptyWaAdminFormValue(NOW);
    const errs = validateWaAdminForm(blank);
    // Empty form pre-fills tanggal/jam, so the genuinely blank required fields
    // are the 6 text/dropdown ones. date/time/noHp defaults pre-set.
    const names = Object.keys(errs).sort();
    expect(names).toEqual(
      ["kategori", "nama", "noHp", "pic", "status", "sumber"].sort(),
    );
    expect(errs.noHp).toBe("Nomor HP tidak valid.");
    // ALL 8 required fields are declared required (incl. the two defaulted ones).
    expect(REQUIRED_FIELDS).toContain("tanggalMasuk");
    expect(REQUIRED_FIELDS).toContain("jamChatMasuk");
    expect(REQUIRED_FIELDS).toHaveLength(8);
  });

  it("rejects ALL 8 required fields when the date/time are also blanked", () => {
    const allBlank = validateWaAdminForm(
      values({ tanggalMasuk: "", jamChatMasuk: "", noHp: "", pic: "", nama: "", sumber: "", kategori: "", status: "" }),
    );
    expect(Object.keys(allBlank).sort()).toEqual(REQUIRED_FIELDS.slice().sort());
  });

  it("rejects a noHp with no digits (normalized empty) even when others are filled", () => {
    const errs = validateWaAdminForm(values({ noHp: "abc!!! no digits" }));
    expect(errs.noHp).toBe("Nomor HP tidak valid.");
  });

  it("accepts a leading-zero phone (normalizes to 62 form, not empty)", () => {
    // leading zero must NOT be rejected
    const errs = validateWaAdminForm(values({ noHp: "0812 3456 7890" }));
    expect(errs.noHp).toBeUndefined();
    expect(normalizePhone("081234567890")).toBe("6281234567890");
  });

  it("returns an empty error map for a fully valid form", () => {
    expect(validateWaAdminForm(values())).toEqual({});
  });
});

describe("waAdminForm — payload assembly", () => {
  it("uses EXACT schema headers as keys and omits 'f' and 'Database'", () => {
    const payload = buildWaAdminPayload(values());
    const expectedKeys = [
      "Tanggal Masuk",
      "No Hp",
      "Jam Chat Masuk",
      "PIC",
      "Nama",
      "Asal",
      "Sumber (Ads/Organik/Sales)",
      "Pertanyaan",
      "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)",
      "Mekari Tag",
      STATUS_COLUMN,
      "Keterangan Admin",
    ];
    expect(Object.keys(payload).sort()).toEqual(expectedKeys.slice().sort());
    expect(payload).not.toHaveProperty("f");
    expect(payload).not.toHaveProperty("Database");
    // every key must be a known wa_admin column
    const schema = columnsFor("wa_admin");
    for (const k of Object.keys(payload)) {
      expect(schema).toContain(k);
    }
  });

  it("normalizes No Hp to 62-form and Jam Chat Masuk to HH.MM in the payload", () => {
    const payload = buildWaAdminPayload(values({ noHp: "08 1234-5678-90", jamChatMasuk: "13:39" }));
    expect(payload["No Hp"]).toBe("6281234567890");
    expect(payload["Jam Chat Masuk"]).toBe("13.39");
    expect(payload["Tanggal Masuk"]).toBe("2026-09-19");
    expect(payload[STATUS_COLUMN]).toBe("Follow Up");
    expect(payload[WA_ADMIN_PAYLOAD_KEYS.kategori]).toBe("Pendaftaran");
    expect(payload[WA_ADMIN_PAYLOAD_KEYS.sumber]).toBe("Organik");
  });

  it("keeps optional fields as trimmed strings when empty", () => {
    const payload = buildWaAdminPayload(values({ asal: "  ", pertanyaan: "", mekariTag: "", keteranganAdmin: "" }));
    expect(payload["Asal"]).toBe("");
    expect(payload["Pertanyaan"]).toBe("");
  });

  it("maps a selected Mekari Tag to the exact 'Mekari Tag' column", () => {
    const payload = buildWaAdminPayload(values({ mekariTag: "Cold Lead" }));
    expect(payload["Mekari Tag"]).toBe("Cold Lead");
    expect(payload["Mekari Tag"]).not.toBe("");
  });
});