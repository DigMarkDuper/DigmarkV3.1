import { describe, expect, it } from "vitest";
import { funnel, monthlySnapshot, roi, statusCol } from "./metrics";

// Real-schema fixtures from scripts/smoke_test.py (VERBATIM).
const STATUS_COL = "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)";
const KAT_COL = "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)";

const WA_ADMIN = [
  {
    "f": 1, "Tanggal Masuk": "27/09/2025", "No Hp": "", "PIC": "DEA",
    "Nama": "Anggun", "Asal": "Cilacap", "Sumber (Ads/Organik/Sales)": "Organik",
    [KAT_COL]: "Biaya", "Mekari Tag": "Warm Lead", [STATUS_COL]: "Follow Up",
  },
  {
    "f": 2, "Tanggal Masuk": "28/09/2025", "No Hp": "0815-111", "PIC": "DEA",
    "Nama": "Ani", "Asal": "Bantul", "Sumber (Ads/Organik/Sales)": "Ads/ Blast",
    [KAT_COL]: "Biaya", "Mekari Tag": "", [STATUS_COL]: "Closing",
  },
  {
    "f": 3, "Tanggal Masuk": "29/09/2025", "No Hp": "0812-000", "PIC": "DEA",
    "Nama": "Junk", "Asal": "X", [KAT_COL]: "Biaya", "Mekari Tag": "double chat",
    [STATUS_COL]: "x",
  },
];

const ADS_TIKTOK = [{ "Campaign name": "Whatsapp_Campaign_Mei", "Cost": 251145, "Currency": "IDR" }];
const ADS_META = [
  { "Reporting starts": "2026-01-01", "Campaign name": "C1", "Amount spent (IDR)": 500000 },
];
const MEKARI = [
  { "Tanggal Input": "13/04/2026", "Periode": "03 Jan 2026 s/d 30 Jan 2026",
    "Jenis Laporan": "WA Campaign Logs", "Total Interaksi": 830, "Total Biaya (Rp)": 503100 },
];

describe("metrics parity (services/metrics.py -> metrics.ts)", () => {
  it("_status_col picks the non-mekari 'Status' column (last match wins)", () => {
    expect(statusCol(WA_ADMIN)).toBe(STATUS_COL);
  });

  it("funnel on 3 WA_ADMIN rows -> {leads:3, closing:1, conversion: 1/3*100}", () => {
    const fn = funnel(WA_ADMIN);
    expect(fn.leads).toBe(3);
    expect(fn.closing).toBe(1);
    expect(fn.conversion).toBeCloseTo((1 / 3) * 100, 9);
  });

  it("roi sums TikTok Cost + Meta 'Amount spent (IDR)' + Mekari 'Total Biaya (Rp)'", () => {
    const r = roi(WA_ADMIN, ADS_TIKTOK, ADS_META, MEKARI);
    expect(r.spend).toBe(1254245); // 251145 + 500000 + 503100
    expect(r.leads).toBe(3);
    expect(r.closing).toBe(1);
  });

  it("monthlySnapshot exposes leads/closing/omzet/omzet keys", () => {
    const snap = monthlySnapshot(WA_ADMIN);
    expect(snap).toHaveProperty("leads");
    expect(snap).toHaveProperty("closing");
    expect(snap).toHaveProperty("omzet");
    expect(snap).toHaveProperty("conversion");
    // Fixture dates are Sep 2025; current month (Sep 2026) -> no rows.
    expect(snap.leads).toBe(0);
  });
});

// DIGMARK refactor: closing is EXACT "closing" (shared isClosingStatus), never
// substring. "closing"/"Closing" count; "closed", "closing process",
// "closed - registered" must NOT.
describe("metrics closing uses EXACT isClosingStatus (no substring)", () => {
  const ESL = "Status";
  const ROWS = [
    { [ESL]: "closing" },
    { [ESL]: "  Closing  " },
    { [ESL]: "closed" },
    { [ESL]: "closing process" },
    { [ESL]: "closed - registered" },
    { [ESL]: "Follow Up" },
  ];

  it("funnel counts only exact 'closing' (2 of the 6 rows)", () => {
    const fn = funnel(ROWS);
    expect(fn.leads).toBe(6);
    expect(fn.closing).toBe(2); // "closing" + "  Closing  "
    expect(fn.conversion).toBeCloseTo((2 / 6) * 100, 9);
  });

  it("roi counts exact 'closing' over all rows (2), omzet derived from that", () => {
    const r = roi(ROWS, [], [], []);
    expect(r.leads).toBe(6);
    expect(r.closing).toBe(2);
    expect(r.omzet).toBe(2 * 12_995_000); // BIAYA_PELATIHAN
  });

  it("closing is 'junk-stripped from funnel yet counted pre-junk' only via caller scope", () => {
    // A row whose STATUS is "closed - registered" is junk (drops the raw funnel
    // when the caller passes post-junk rows) but raises no false closing count.
    const one = [
      { [ESL]: "closed - registered" },
      { [ESL]: "closing" },
    ];
    expect(funnel(one).closing).toBe(1); // exact only
    expect(roi(one, [], [], []).closing).toBe(1);
  });
});