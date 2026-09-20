/**
 * Declarative tab schema map — port of the verified DATA_CONTRACT.md §2.
 * App key (V3 setting.SHEETS key) → { tab title, ordered column headers }.
 *
 * This is the single declarative source that replaces V3's fuzzy column-name
 * matching (audit H1) and the CRM Status-column offset bug (B1). Column
 * headers are taken EXACTLY from the live master (verified 2026-09-15).
 */

export interface TabSchema {
  /** Live Google Sheets tab title (exact, case-sensitive). */
  tab: string;
  /** Ordered column headers as read from the live workbook. */
  columns: string[];
}

export const TAB_SCHEMAS: Record<string, TabSchema> = {
  sosmed: {
    tab: "SOSMED",
    columns: [
      "Kode Konten", "Tanggal Deadline", "Tanggal Posting", "Output",
      "Konten Pillar", "Platform", "PIC", "Judul Konten", "Materi Konten",
      "  CAPTION ", "LINK COVER", "PROSES", "LINK KONTEN JADI", "IG",
      "TIKTOK", "YT",
    ],
  },
  website: {
    tab: "WEBSITE",
    columns: [
      "Kode Konten", "Deadline", "Tanggal Posting", "Content Pillar",
      "SEO Rekomendasi", "Judul", "Status Check", "Bahan Upload",
      "LinkFolder Design", "Designer", "Status Writting", "Status Design",
      "Status Post", "Link Live",
    ],
  },
  insight: {
    tab: "INSIGHT",
    columns: [
      "TANGGAL", "PLATFORM", "VIEW", "REACH", "CONTENT INTERACTION",
      "PROFILE VISIT", "LINK CLICKS", "FOLLOWER",
    ],
  },
  wa_admin: {
    tab: "WA ADMIN REPORT",
    columns: [
      "f", "Tanggal Masuk", "No Hp", "Jam Chat Masuk", "PIC", "Nama", "Asal",
      "Sumber (Ads/Organik/Sales)",
      "Pertanyaan",
      "Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)", "Mekari Tag",
      "Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)",
      "Keterangan Admin", "Database",
    ],
  },
  crm: {
    tab: "DATABASE NOMOR",
    // 17 EFFECTIVE data columns (dimension is 26; columns 18+ are empty).
    columns: [
      "No", "No Hp", "Nama", "Domisili", "Tanggal Lahir", "Usia", "Kategori",
      "Keterangan Setelah Isi Form", "Tanggal Masuk Database",
      "Mekari Tag (Status Terakhir)", "Treatment 1", "Treatment 2",
      "Tanggal Treatment 1", "Tanggal Treatment 2", "Status",
      "Updated Status After Treatment", "Catatan",
    ],
  },
  dm_sosmed: {
    tab: "SOSMED ADMIN REPORT",
    columns: [
      "No", "Platform", "Nama / Username", "Link Username", "No HP/ Whatsapp",
      "Domisili", "Status", "Tag Prospek", "Tanggal Masuk",
    ],
  },
  ads_tiktok: {
    tab: "REPORT ADS TIKTOK",
    columns: [
      "Campaign name", "Primary status", "Date Created", "Cost", "CPM",
      "CPC (destination)", "Clicks (destination)", "CTR (destination)",
      "Video views at 25%", "Video views at 50%", "Video views at 75%",
      "Video views at 100%", "Average play time per video view",
      "Clicks (all)", "Currency",
    ],
  },
  ads_meta: {
    tab: "REPORT ADS META",
    columns: [
      "Reporting starts", "Reporting ends", "Campaign name", "Account name",
      "Amount spent (IDR)", "Link clicks", "Results", "Result indicator",
      "Cost per results", "CTR (link click-through rate)",
      "CPM (cost per 1,000 impressions) (IDR)",
    ],
  },
  mekari: {
    tab: "REPORT MEKARI",
    columns: [
      "Tanggal Input", "Periode", "Jenis Laporan", "Total Interaksi",
      "Total Biaya (Rp)",
    ],
  },
  interview: {
    tab: "SCHEDULE INTERVIEW",
    columns: [
      "Tanggal", "Nama Calon Siswa", "Nomor Whatsapp", "Pilihan Program",
      "PIC Interview", "Status Follow-Up", "Tanggal Interview",
      "Waktu Interview", "Tipe Interview", "Hasil Interview", "Catatan PIC",
    ],
  },
};

/** All tab titles in the same order as V3 `settings.SHEETS`. */
export const TAB_ORDER: string[] = [
  "sosmed",
  "website",
  "insight",
  "wa_admin",
  "crm",
  "dm_sosmed",
  "ads_tiktok",
  "ads_meta",
  "mekari",
  "interview",
];

/** Return the declared column headers for an app key, or [] if unknown. */
export function columnsFor(appKey: string): string[] {
  return TAB_SCHEMAS[appKey]?.columns ?? [];
}