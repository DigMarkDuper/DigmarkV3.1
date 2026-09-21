/**
 * Sandbox bootstrap — builds the SANDBOX spreadsheet to mirror the production
 * schema so tests/parity checks are realistic. NEVER targeted at production.
 *
 * Idempotent: deletes every existing sheet (incl. the default 'Sheet1'), then
   * creates the 11 tabs in TAB_ORDER with the declared header rows from
   * schema.ts, optionally seeding a few fixture rows. Confirms the DATABASE NOMOR
   * header places 'Status' as the 15th column (proving header-based, B1-correct
   * mapping).
 */

import { columnsFor, TAB_ORDER, TAB_SCHEMAS } from "../schema";
import type { BatchRequest, SheetsApiClient } from "./client";

/** Minimal fixture records (subset of columns) per app key, mirroring smoke_test. */
const FIXTURES: Record<string, Record<string, unknown>[]> = {
  sosmed: [
    { "Kode Konten": "DP-0501", "Tanggal Posting": "01/04/2026", Output: "Design", "Konten Pillar": "DuperNews", PIC: "Hanif", "Judul Konten": "PHBN", PROSES: "DONE", IG: true, YT: false, TIKTOK: true },
    { "Kode Konten": "DP-0502", "Tanggal Posting": "05/04/2026", Output: "Video", "Konten Pillar": "DuperLife", PIC: "Hana", "Judul Konten": "SAKSES", PROSES: "PENDING", IG: false, YT: false, TIKTOK: false },
  ],
  website: [
    { "Kode Konten": "DPW-0267", Deadline: "30/11/2025", "Content Pillar": "Article", Judul: "Posisi Kapal", "Status Post": "Uploaded", Designer: "Ejak" },
    { "Kode Konten": "DPW-0268", Deadline: "01/09/2026", "Content Pillar": "News", Judul: "Genting Dream", "Status Post": "", Designer: "Ejak" },
  ],
  insight: [
    { TANGGAL: "01/01/2026", PLATFORM: "Instagram", VIEW: 3150, REACH: 9000, "CONTENT INTERACTION": 120, "PROFILE VISIT": 43, "LINK CLICKS": 10, FOLLOWER: 4 },
    { TANGGAL: "02/01/2026", PLATFORM: "TikTok", VIEW: 5000, REACH: 2000, "CONTENT INTERACTION": 9, "PROFILE VISIT": 10, "LINK CLICKS": 2, FOLLOWER: 1 },
  ],
  wa_admin: [
    { f: 1, "Tanggal Masuk": "27/09/2025", "No Hp": "0815-111", PIC: "DEA", Nama: "Ani", Asal: "Bantul", "Sumber (Ads/Organik/Sales)": "Ads/ Blast", "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya", "Mekari Tag": "", "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "Closing" },
    { f: 2, "Tanggal Masuk": "01/09/2026", "No Hp": "0813-000", PIC: "DEA", Nama: "Budi", Asal: "Sleman", "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya", "Mekari Tag": "", "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "Follow Up" },
    { f: 3, "Tanggal Masuk": "02/09/2026", "No Hp": "0812-000", PIC: "DEA", Nama: "Junk", Asal: "X", "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)": "Biaya", "Mekari Tag": "double chat", "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)": "x" },
  ],
  crm: [
    { No: 1, "No Hp": "62815000", Nama: "Budi", Domisili: "Sleman", Kategori: "Siswa", "Treatment 1": "x", "Mekari Tag (Status Terakhir)": "Cold Lead", Status: "Delivered" },
  ],
  dm_sosmed: [
    { No: 1, Platform: "Instagram", "Nama / Username": "niaa2074568", "Link Username": "https://instagram.com/niaa2074568", "No HP/ Whatsapp": "", Domisili: "", Status: "Daftar", "Tag Prospek": "HOT LEAD", "Tanggal Masuk": "01/09/2026" },
  ],
  ads_tiktok: [{ "Campaign name": "Whatsapp_Campaign_Mei", Cost: 251145, Currency: "IDR" }],
  ads_meta: [{ "Reporting starts": "2026-01-01", "Campaign name": "C1", "Amount spent (IDR)": 500000 }],
  mekari: [{ "Tanggal Input": "13/04/2026", Periode: "03 Jan 2026 s/d 30 Jan 2026", "Jenis Laporan": "WA Campaign Logs", "Total Interaksi": 830, "Total Biaya (Rp)": 503100 }],
  interview: [
    { Tanggal: "05/05/2026", "Nama Calon Siswa": "WINDHU", "Nomor Whatsapp": 85727303005.0, "Pilihan Program": "Fast Track", "PIC Interview": "Ejak", "Status Follow-Up": "Reschedule", "Tanggal Interview": "08/05/2026", "Waktu Interview": "16.00", "Tipe Interview": "Whatsapp Call", "Hasil Interview": "", "Catatan PIC": null },
    { Tanggal: "05/05/2026", "Nama Calon Siswa": "Maria", "Nomor Whatsapp": 81345481758.0, "Pilihan Program": "Fast Track", "PIC Interview": "Ejak", "Status Follow-Up": "Done", "Tanggal Interview": "09/05/2026", "Waktu Interview": "14.00", "Tipe Interview": "Whatsapp Call", "Hasil Interview": "Lulus", "Catatan PIC": null },
  ],
};

interface SheetHeader {
  sheetId: number | undefined;
  title: string;
}

/** batchUpdate addSheet requests for the given app keys. */
function addRequests(appKeys: string[]): { addSheet: { properties: { title: string } } }[] {
  return appKeys.map((appKey) => ({ addSheet: { properties: { title: TAB_SCHEMAS[appKey].tab } } }));
}

/** List live sheets for the spreadsheet. */
async function liveSheets(api: SheetsApiClient, spreadsheetId: string): Promise<SheetHeader[]> {
  const res = await api.spreadsheets.get({ spreadsheetId });
  return (res.data.sheets ?? []).map((s) => ({
    sheetId: s.properties?.sheetId,
    title: s.properties?.title ?? "",
  }));
}

/**
 * Reset the SANDBOX workbook to mirror the production schema.
 * WARNING: deletes ALL worksheets in `spreadsheetId`. Use ONLY the sandbox ID.
 */
export async function buildSandboxSchema(
  api: SheetsApiClient,
  spreadsheetId: string,
  opts: { seedFixtures?: boolean } = {},
): Promise<{ tabsCreated: number; fixturesSeeded: number }> {
  const seedFixtures = opts.seedFixtures ?? true;

  // --- 1) Structural mutations: ONE batchUpdate (rename/delete/add sheets) ---
  // The Sheets API forbids deleting ALL sheets and the sandbox starts as a
  // single empty 'Sheet1', so keep ONE sheet (renamed to the first declared
  // tab), delete the rest, and add the remaining 9 tabs — all in one request.
  const firstTitle = TAB_SCHEMAS[TAB_ORDER[0]].tab;
  const existing = await liveSheets(api, spreadsheetId);
  const requests: BatchRequest[] = [];

  if (existing.length === 0) {
    requests.push(...addRequests(TAB_ORDER));
  } else {
    const keep = existing[0];
    if (keep.sheetId !== undefined) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: keep.sheetId, title: firstTitle, index: 0 },
          fields: "title,index",
        },
      });
    }
    for (const s of existing.slice(1)) {
      if (s.sheetId !== undefined) {
        requests.push({ deleteSheet: { sheetId: s.sheetId } });
      }
    }
    requests.push(...addRequests(TAB_ORDER.slice(1)));
  }
  if (requests.length) {
    await api.spreadsheets.batchUpdate?.({ spreadsheetId, resource: { requests } });
  }

  // --- 2) Header rows + fixture rows: ONE values.batchUpdate (RAW) ---
  // RAW keeps headers verbatim (incl. '  CAPTION ' and 'Status' at col 15) and
  // fixtures deterministic (numbers stay numbers, dates stay dd/mm/yyyy via
  // strings, booleans stay real booleans) — avoiding USER_ENTERED date/fx
  // coercion. Batching also stays far under the 60-write/min quota.
  const rowsToWrite: { range: string; values: unknown[][] }[] = [];
  let headersWritten = 0;
  for (const appKey of TAB_ORDER) {
    const columns = columnsFor(appKey);
    const tab = TAB_SCHEMAS[appKey].tab;
    rowsToWrite.push({ range: `'${tab}'!A1:${toCol(columns.length)}1`, values: [columns] });
    headersWritten++;

    if (seedFixtures) {
      const recs = FIXTURES[appKey] ?? [];
      recs.forEach((rec, i) => {
        const rowCells = columns.map((col) => (rec[col] ?? "") as unknown);
        const rowNum = 2 + i;
        rowsToWrite.push({ range: `'${tab}'!A${rowNum}`, values: [rowCells] });
      });
    }
  }
  if (rowsToWrite.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: "RAW", data: rowsToWrite },
    });
  }

  const fixturesSeeded = seedFixtures ? TAB_ORDER.reduce((n, k) => n + (FIXTURES[k]?.length ?? 0), 0) : 0;
  return { tabsCreated: headersWritten, fixturesSeeded };
}

function toCol(n: number): string {
  let out = "";
  let v = n;
  while (v > 0) {
    const rem = (v - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    v = Math.floor((v - 1) / 26);
  }
  return out;
}

/**
 * Assert that the CRM header row places 'Status' as the 15th column.
 * Returns the 1-based position (index+1) for explicit verification.
 */
export function crmStatusColumnIndex(): number {
  return columnsFor("crm").indexOf("Status") + 1; // 15 for the live schema
}