import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Row } from "@/server/adapter/source";
import { buildMonthlyReport, type MonthlyReport } from "@/workspaces/waAdminReport";
import { WaMonthlyReport } from "@/workspaces/MonthlyReport";

const STATUS = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const SUMBER = "Sumber (Ads/Organik/Sales)";
const NOW = new Date(2026, 8, 15);

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

function regRow(partial: Partial<Row>): Row {
  return {
    __rowIndex: 0,
    Timestamp: "9/3/2026 10:00:00",
    "Nama Lengkap": "",
    "Nomor Whatsapp": "",
    "Nomor Handphone": "",
    Email: "",
    "MENGETAHUI DUTA PERSADA DARI": "",
    "Penjadwalan Interview": "",
    Interview: "",
    "Hasil Interview\n(Diterima/Tidak)": "",
    "Pengiriman Juknis": "",
    Pembayaran: "",
    "Invite Grup Pendaftar": "",
    PIC: "",
    ...partial,
  };
}

function sampleReport(): MonthlyReport {
  return buildMonthlyReport({
    waRows: [
      waRow({ "Tanggal Masuk": "05/09/2026", Nama: "A", PIC: "BELIA", "Mekari Tag": "Hot Lead", [SUMBER]: "Organik", [STATUS]: "Closing" }),
    ],
    registrationRows: [regRow({ "Nama Lengkap": "Ali", "Nomor Whatsapp": "62813000001" })],
    period: "CURRENT",
    now: NOW,
  });
}

describe("WaMonthlyReport (SSR smoke)", () => {
  it("renders every required section (A–E) with the period label", () => {
    const html = renderToStaticMarkup(<WaMonthlyReport report={sampleReport()} />);
    expect(html).toContain("Laporan Bulanan");
    expect(html).toContain("WhatsApp Admin");
    expect(html).toContain("September 2026");
    expect(html).toContain("A · Chat Masuk");
    expect(html).toContain("B · Closing");
    expect(html).toContain("C · Pendaftar / Pengisi Data");
    expect(html).toContain("D · Asal Chat");
    expect(html).toContain("E · Insight");
    expect(html).toContain("Hot Lead"); // Mekari tag figure
    expect(html).toContain("Ali"); // pendaftar row
  });

  it("renders zero-friendly output for an empty period (no dummy)", () => {
    const empty = buildMonthlyReport({ waRows: [], registrationRows: [], period: "CURRENT", now: NOW });
    const html = renderToStaticMarkup(<WaMonthlyReport report={empty} />);
    expect(html).toContain("Tidak ada data");
    expect(html).toContain("—");
  });
});
