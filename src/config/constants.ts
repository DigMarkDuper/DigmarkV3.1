/**
 * Central configuration: sheet titles, business constants, targets.
 * TypeScript port of `config/settings.py` (single source of truth).
 * Edit this ONE file to tune numbers/sheet names.
 */

// --- Master spreadsheet: logical area -> real sheet (tab) TITLE ----------
export const SHEETS: Record<string, string> = {
  sosmed: "SOSMED",               // page Sosmed / Overview
  website: "WEBSITE",             // page Website
  insight: "INSIGHT",             // Overview annual-target gauges
  wa_admin: "WA ADMIN REPORT",    // WA Admin / CRM sync / Overview
  crm: "DATABASE NOMOR",          // CRM page + WA->CRM sync
  dm_sosmed: "SOSMED ADMIN REPORT", // page DM
  ads_tiktok: "REPORT ADS TIKTOK", // page Ads (TikTok tab)
  ads_meta: "REPORT ADS META",    // page Ads (Meta tab)
  mekari: "REPORT MEKARI",        // page Ads (Mekari tab)
  interview: "SCHEDULE INTERVIEW",// page Interview
};

// --- Business constant ---------------------------------------------------
export const BIAYA_PELATIHAN = 12_995_000; // harga pelatihan (Rupiah), used for omzet/ROI

// --- Junk tags filtered out of lead funnels & WA->CRM sync ---------------
export const JUNK_TAGS: string[] = [
  "not eligible",
  "partnership",
  "alumni",
  "closed - not interested",
  "closed - registered",
  "double chat",
];

// --- Values treated as "already posted / done" ----------------------------
export const DONE_KEYWORDS: string[] = [
  "DONE",
  "TRUE",
  "V",
  "1",
  "YES",
  "POSTED",
  "SELESAI",
  "UPLOAD",
  "UPLOADED",
  "SUDAH UPLOAD",
  "CHECKED",
];

// --- Homepage targets ----------------------------------------------------
export const ANNUAL_TARGETS: Record<string, number> = {
  "Total View": 10_000_000,
  "Total Reach": 2_400_000,
  "Link Click": 24_000,
  "Engagement": 40_000,
};

export const WEBSITE_TARGETS: Record<string, number> = {
  "Artikel": 72,
  "Berita": 36,
  "Album Galeri": 60,
  "Linkedin": 72,
};

export const CLOSING_TARGET = 45; // kuota closing siswa (used on WA Admin page)

// --- Module registry (single source of truth) -----------------------------
export interface ModuleDef {
  file: string;
  url: string;
  icon: string;
  title: string;
  desc: string;
}

export const MODULES: ModuleDef[] = [
  { file: "pages/2_Sosmed.py",    url: "sosmed",   icon: "📱", title: "Social Media",     desc: "Produksi konten & status posting per PIC, dengan editor live." },
  { file: "pages/0_Insight.py",   url: "insight",  icon: "📈", title: "Social Media Insight", desc: "Analisis performa kanal: KPI, funnel, tren & perbandingan platform." },
  { file: "pages/3_Website.py",   url: "website",  icon: "🌐", title: "Website / SEO",    desc: "Fulfilment konten, pilar, dan audit tugas pending." },
  { file: "pages/4_WA_Admin.py",   url: "wa-admin", icon: "💬", title: "WhatsApp Admin",   desc: "Leads masuk, funnel closing, dan ekspor data." },
  { file: "pages/5_CRM.py",       url: "crm",      icon: "🎯", title: "CRM / Leads",      desc: "Database lead, sinkronisasi WA→CRM, import & ekspor." },
  { file: "pages/6_DM_Sosmed.py", url: "dm",       icon: "📣", title: "Digital Marketing", desc: "Prospek dari DM, distribusi status, dan input data baru." },
  { file: "pages/7_Ads.py",       url: "ads",      icon: "💰", title: "Ads Performance",  desc: "Spend, CAC/ROAS, dan import laporan TikTok / Meta / Mekari." },
  { file: "pages/8_Interview.py", url: "interview", icon: "🎤", title: "Interview",       desc: "Tracking kandidat, follow-up, dan hasil interview." },
];

// --- PIC roster (fallback; pages also derive PICs from the data) ----------
export const PIC_LIST: string[] = ["Ejak", "Hana", "Abi", "Angel"];

// --- Brand palette (IKEA-inspired blue & yellow) --------------------------
export const COLORS: Record<string, string> = {
  blue: "#0058A3",       // IKEA blue  (primary / brand)
  blue_hover: "#0A6FBF",
  yellow: "#FFDB00",     // IKEA yellow (accent)
  ink: "#102A43",        // text
  muted: "#5B6B7E",      // secondary text
  grid: "#E6EBF2",       // chart grid / track
  success: "#22A06B",
  warn: "#E8930C",
  danger: "#D64550",
};