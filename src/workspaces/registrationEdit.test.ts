import { describe, expect, it } from "vitest";
import type { Row } from "@/server/adapter/source";
import {
  REG_EDIT_COLUMNS,
  changedRegFieldValues,
  rowToRegFormValue,
  validateRegEdit,
  regEditOptions,
  regRowIndex,
} from "@/workspaces/registrationEdit";

const HASIL = "Hasil Interview\n(Diterima/Tidak)";
const INTERVIEW = "Interview";
const JUKNIS = "Pengiriman Juknis";
const PAY = "Pembayaran";
const GRUP = "Invite Grup Pendaftar";
const PIC = "PIC";
const PENJADWALAN = "Penjadwalan Interview";
const SOURCE = "MENGETAHUI DUTA PERSADA DARI";

function regRow(partial: Partial<Row>): Row {
  return {
    __rowIndex: 3,
    Timestamp: "9/3/2026 10:00:00",
    "Nama Lengkap": "",
    "Nomor Whatsapp": "",
    "Nomor Handphone": "",
    Email: "",
    [SOURCE]: "",
    [PENJADWALAN]: "",
    [INTERVIEW]: "",
    [HASIL]: "",
    [JUKNIS]: "",
    [PAY]: "",
    [GRUP]: "",
    [PIC]: "",
    ...partial,
  };
}

const FULL = regRow({
  "Nama Lengkap": "Ali",
  "Nomor Whatsapp": "62813000001",
  [SOURCE]: "Instagram",
  [PIC]: "ONLINE",
  [PENJADWALAN]: "Sudah",
  [INTERVIEW]: "Sudah",
  [HASIL]: "Tidak",
  [JUKNIS]: "Belum",
  [PAY]: "Belum",
  [GRUP]: "Belum",
});

describe("rowToRegFormValue", () => {
  it("maps every editable field verbatim (trimmed)", () => {
    const v = rowToRegFormValue(FULL);
    expect(v.nama).toBe("Ali");
    expect(v.whatsapp).toBe("62813000001");
    expect(v.source).toBe("Instagram");
    expect(v.pic).toBe("ONLINE");
    expect(v.penjadwalan).toBe("Sudah");
    expect(v.interview).toBe("Sudah");
    expect(v.hasil).toBe("Tidak");
    expect(v.juknis).toBe("Belum");
    expect(v.pembayaran).toBe("Belum");
    expect(v.grup).toBe("Belum");
  });
});

describe("changedRegFieldValues (per-column PATCH, no clobber)", () => {
  it("emits ONLY changed fields with exact column headers", () => {
    const pre = rowToRegFormValue(FULL);
    const cur = { ...pre, nama: "Ali Baru", pic: "OFFLINE" };
    const changed = changedRegFieldValues(pre, cur);
    expect(changed).toEqual([
      { column: "Nama Lengkap", value: "Ali Baru" },
      { column: "PIC", value: "OFFLINE" },
    ]);
  });

  it("returns [] when nothing changed (no-op skips the PATCH)", () => {
    const pre = rowToRegFormValue(FULL);
    expect(changedRegFieldValues(pre, { ...pre })).toEqual([]);
  });

  it("normalizes WhatsApp (same phone in 08... vs 62... → no change)", () => {
    const pre = { ...rowToRegFormValue(regRow({ "Nomor Whatsapp": "0813000001" })),
      nama: "Ali", whatsapp: "0813000001" };
    const cur = { ...pre, whatsapp: "62813000001" };
    expect(changedRegFieldValues(pre, cur)).toEqual([]);
  });

  it("normalizes WhatsApp toward the 62-... form when changed", () => {
    const pre = { ...rowToRegFormValue(regRow({ "Nomor Whatsapp": "0813000001" })),
      nama: "Ali", whatsapp: "0813000001" };
    const cur = { ...pre, whatsapp: "081399999999" };
    const changed = changedRegFieldValues(pre, cur);
    expect(changed).toEqual([{ column: "Nomor Whatsapp", value: "6281399999999" }]);
  });
});

describe("validateRegEdit", () => {
  it("accepts a valid form", () => {
    expect(validateRegEdit(rowToRegFormValue(FULL))).toEqual({});
  });
  it("requires nama + a digit-bearing whatsapp", () => {
    const errs = validateRegEdit({ ...rowToRegFormValue(FULL), nama: "  ", whatsapp: "abc" });
    expect(errs.nama).toBeTruthy();
    expect(errs.whatsapp).toBeTruthy();
  });
});

describe("regEditOptions / regRowIndex", () => {
  it("computes distinct stage/source/PIC options from live rows, falling back", () => {
    const opts = regEditOptions([FULL], "hasil");
    expect(opts).toContain("Tidak");
    const src = regEditOptions([regRow({ [SOURCE]: "TikTok" })], "source");
    expect(src[0]).toBe("TikTok");
  });
  it("returns the __rowIndex as the row handle", () => {
    expect(regRowIndex(FULL)).toBe(3);
  });
  it("exposes exact REGISTRATION_COLUMNS headers", () => {
    expect(REG_EDIT_COLUMNS.hasil).toBe("Hasil Interview\n(Diterima/Tidak)");
    expect(REG_EDIT_COLUMNS.source).toBe("MENGETAHUI DUTA PERSADA DARI");
  });
});
