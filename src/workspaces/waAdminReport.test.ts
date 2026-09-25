import { describe, expect, it } from "vitest";
import type { Row } from "@/server/adapter/source";
import {
  buildMonthlyReport,
  expandPeriod,
  reportPeriodOptions,
  waRowsInPeriod,
  registrationRowsInPeriod,
} from "@/workspaces/waAdminReport";

/** Exact wa_admin declared headers (status col carries a LITERAL "\n\n"). */
const STATUS = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const SUMBER = "Sumber (Ads/Organik/Sales)";

/** NOW pin: September 2026 (all period logic is keyed to this). */
const NOW = new Date(2026, 8, 15); // 2026-09-15

function waRow(partial: Partial<Row>): Row {
  return {
    f: 1,
    "Tanggal Masuk": "",
    "No Hp": "",
    "Jam Chat Masuk": "",
    PIC: "",
    Nama: "",
    Asal: "",
    [SUMBER]: "",
    Pertanyaan: "",
    "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "",
    "Mekari Tag": "",
    [STATUS]: "",
    "Keterangan Admin": "",
    Database: "",
    ...partial,
  };
}

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
    Timestamp: "1/13/2026 16:35:42",
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

const WA_BOTH = [
  waRow({ "Tanggal Masuk": "05/09/2026", Nama: "A", PIC: "BELIA", "Mekari Tag": "Hot Lead", [SUMBER]: "Organik", [STATUS]: "Closing" }),
  waRow({ "Tanggal Masuk": "20/09/2026", Nama: "B", PIC: "DEA", "Mekari Tag": "Warm Lead", [SUMBER]: "ADS/ Blast", [STATUS]: "Follow Up" }),
];
const WA_AUG = [waRow({ "Tanggal Masuk": "10/08/2026", Nama: "C", PIC: "EJAK", "Mekari Tag": "Cold Lead", [SUMBER]: "Sales", [STATUS]: "Interview" })];
const WA_OUT = [waRow({ "Tanggal Masuk": "01/07/2026", Nama: "D", PIC: "BELIA", "Mekari Tag": "Hot Lead", [SUMBER]: "Organik", [STATUS]: "Closing" })];

const REG_SEP = [
  regRow({ Timestamp: "9/3/2026 10:00:00", "Nama Lengkap": "Ali", "Nomor Whatsapp": "62813000001", [SOURCE]: "Instagram", [PIC]: "ONLINE", [PENJADWALAN]: "Sudah", [HASIL]: "Ya" }),
  regRow({ Timestamp: "9/28/2026 10:00:00", "Nama Lengkap": "Budi", "Nomor Whatsapp": "62813000002", [SOURCE]: "Instagram", [PIC]: "ONLINE", [PENJADWALAN]: "Belum" }),
];
const REG_AUG = [regRow({ Timestamp: "8/14/2026 10:00:00", "Nama Lengkap": "Cici", "Nomor Whatsapp": "62813000003", [SOURCE]: "Google", [PIC]: "ONLINE", [PENJADWALAN]: "Sudah", [HASIL]: "Ya" })];
const REG_OUT = [regRow({ Timestamp: "5/01/2026 10:00:00", "Nama Lengkap": "Dedi", "Nomor Whatsapp": "62813000004", [SOURCE]: "Temu", [PIC]: "OFFLINE", [PENJADWALAN]: "Belum" })];

describe("expandPeriod", () => {
  it("returns the current month (inclusive start, exclusive to, label)", () => {
    const p = expandPeriod("CURRENT", NOW);
    expect(p.label).toBe("September 2026");
    expect(p.from.getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(p.to.getTime()).toBe(new Date(2026, 9, 1).getTime());
  });

  it("returns the previous month for PREVIOUS", () => {
    const p = expandPeriod("PREVIOUS", NOW);
    expect(p.label).toBe("August 2026");
    expect(p.from.getTime()).toBe(new Date(2026, 7, 1).getTime());
  });

  it("returns an exact month for YYYY-MM", () => {
    const p = expandPeriod("2026-03", NOW);
    expect(p.label).toBe("March 2026");
    expect(p.from.getTime()).toBe(new Date(2026, 2, 1).getTime());
    expect(p.to.getTime()).toBe(new Date(2026, 3, 1).getTime());
  });

  it("returns a day-inclusive range for YYYY-MM-DD..YYYY-MM-DD", () => {
    const p = expandPeriod("2026-09-10..2026-09-20", NOW);
    expect(p.from.getTime()).toBe(new Date(2026, 8, 10).getTime());
    expect(p.to.getTime()).toBe(new Date(2026, 8, 21).getTime()); // exclusive end
  });

  it("falls back to CURRENT for blank / unrecognised selectors", () => {
    expect(expandPeriod("", NOW).label).toBe("September 2026");
    expect(expandPeriod("garbage", NOW).label).toBe("September 2026");
    expect(expandPeriod("2026-99", NOW).label).toBe("September 2026");
  });
});

describe("reportPeriodOptions", () => {
  it("offers Bulan Ini, Bulan Lalu, then N recent months (deduped values)", () => {
    const opts = reportPeriodOptions(NOW, 2);
    const labels = opts.map((o) => o.value);
    expect(labels[0]).toBe("CURRENT");
    expect(labels[1]).toBe("PREVIOUS");
    expect(labels).toContain("2026-09");
    expect(labels).toContain("2026-08");
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("period row filters", () => {
  it("filters WA rows by Tanggal Masuk within the period", () => {
    const p = expandPeriod("CURRENT", NOW);
    const got = waRowsInPeriod([...WA_BOTH, ...WA_AUG, ...WA_OUT], p);
    expect(got.map((r) => r.Nama).sort()).toEqual(["A", "B"]);
  });

  it("filters registration rows by Timestamp within the period", () => {
    const p = expandPeriod("CURRENT", NOW);
    const got = registrationRowsInPeriod([...REG_SEP, ...REG_AUG, ...REG_OUT], p);
    expect(got.map((r) => r["Nama Lengkap"]).sort()).toEqual(["Ali", "Budi"]);
  });
});

describe("buildMonthlyReport (section consistency)", () => {
  it("builds A–E for the current month with correct counts", () => {
    const r = buildMonthlyReport({
      waRows: [...WA_BOTH, ...WA_AUG, ...WA_OUT],
      registrationRows: [...REG_SEP, ...REG_AUG, ...REG_OUT],
      period: "CURRENT",
      now: NOW,
    });
    expect(r.period.label).toBe("September 2026");
    // A — chat masuk
    expect(r.chatMasuk.total).toBe(2); // only Sept WA rows
    expect(r.chatMasuk.byMekariTag).toEqual([
      { name: "Hot Lead", count: 1, pct: 50 },
      { name: "Warm Lead", count: 1, pct: 50 },
    ]);
    // B — closing
    expect(r.closing.total).toBe(1); // 'Closing' in Sept
    expect(r.closing.byStatus.find((s) => s.name === "Closing")?.count).toBe(1);
    // C — pendaftar (same month)
    expect(r.pendaftar.total).toBe(2);
    // D — asal chat (by Sumber column)
    expect(r.asalChat).toEqual([
      { name: "Organik", count: 1, pct: 50 },
      { name: "ADS/ Blast", count: 1, pct: 50 },
    ]);
    // E — insights
    expect(r.insights.totalPendaftar).toBe(2);
    expect(r.insights.conDaftarChat).toBe("100%");
    expect(r.insights.pending).toBe(1); // Budi belum penjadwalan
    expect(r.insights.followUp).toBe(0); // Ali has Hasil Ya -> interviewBelumHasil=0
  });

  it("uses the previous month when PREVIOUS is selected", () => {
    const r = buildMonthlyReport({
      waRows: [...WA_BOTH, ...WA_AUG, ...WA_OUT],
      registrationRows: [...REG_SEP, ...REG_AUG, ...REG_OUT],
      period: "PREVIOUS",
      now: NOW,
    });
    expect(r.period.label).toBe("August 2026");
    expect(r.chatMasuk.total).toBe(1); // only C in Aug
    expect(r.pendaftar.total).toBe(1); // only Cici in Aug
    expect(r.insights.totalPendaftar).toBe(1);
  });

  it("uses a custom month (YYYY-MM) for all sections", () => {
    const r = buildMonthlyReport({
      waRows: [...WA_BOTH, ...WA_AUG, ...WA_OUT],
      registrationRows: [...REG_SEP, ...REG_AUG, ...REG_OUT],
      period: "2026-05",
      now: NOW,
    });
    expect(r.period.label).toBe("May 2026");
    expect(r.chatMasuk.total).toBe(0);
    expect(r.pendaftar.total).toBe(1); // Dedi in May
    expect(r.insights.totalPendaftar).toBe(1);
  });

  it("emits zero-friendly sections when a period has no data (no dummy)", () => {
    const r = buildMonthlyReport({ waRows: [], registrationRows: [], period: "CURRENT", now: NOW });
    expect(r.chatMasuk.total).toBe(0);
    expect(r.chatMasuk.byMekariTag).toEqual([]);
    expect(r.pendaftar.total).toBe(0);
    expect(r.asalChat).toEqual([]);
    expect(r.insights.conDaftarChat).toBe("—");
    expect(r.insights.pending).toBe(0);
  });
});
