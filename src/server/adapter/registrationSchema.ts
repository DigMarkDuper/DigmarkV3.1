/**
 * Declarative schema for the REGISTRATION spreadsheet (Form Pendaftaran) —
 * a SEPARATE Google Sheets spreadsheet from the master, so it MUST NOT be a
 * member of TAB_SCHEMAS / TAB_ORDER (adding it there would make the master's
 * listTabs()/bootstrap report a missing declared tab and flip `drift`).
 *
 * Column headers taken EXACTLY from the live tab "Form Responses 1" (verified
 * 2026-09); the two medical questions carry their full live question text
 * (the brief's "[pertanyaan medis panjang]" / "[pertanyaan patah tulang]" are
 * placeholders that do NOT exist in the live header), plus a trailing
 * "Keterangan Tambahan" ("Keterangan" and "Keterangan Tambahan" both exist) —
 * 36 columns total (PIC added, verified 2026-09).
 */
import type { TabSchema } from "./schema";

/** Live single-tab title of the registration spreadsheet. */
export const REGISTRATION_TAB = "Form Responses 1";

/** Ordered column headers, exact from the live registration workbook. */
export const REGISTRATION_COLUMNS: string[] = [
  "Timestamp",
  "Nama Lengkap",
  "Tempat Lahir",
  "Tanggal Lahir",
  "Usia",
  "Berat Badan (kg)",
  "Tinggi Badan (cm)",
  "ALAMAT TEMPAT TINGGAL",
  "ASAL SEKOLAH (SMA/SMK)",
  "JURUSAN DI SMA/SMK",
  "Nomor Handphone",
  "Nomor Whatsapp",
  "Email",
  "AKUN INSTAGRAM",
  "NAMA AYAH",
  "Pekerjaan",
  "Usia",
  "Nomor Handphone Ayah",
  "Nama Ibu",
  "Apakah anda pernah memiliki penyakit berat seperti (Hepatitis, Paru-Paru/TBC, Jantung, Ginjal, Buta Warna, dll)",
  "Apakah anda pernah patah tulang dalam 2 tahun",
  "MENGETAHUI DUTA PERSADA DARI",
  "UPLOAD FOTO DIRI (UNTUK VERIFIKASI KEASLIAN)",
  "Upload KTP anda (bisa di foto atau scan)",
  "Email Address",
  "Penjadwalan Interview",
  "Keterangan Tidak lanjut",
  "Interview",
  "Hasil Interview\n(Diterima/Tidak)",
  "Pengumuman hasil interview",
  "Pengiriman Juknis",
  "Pembayaran",
  "Invite Grup Pendaftar",
  "PIC",
  "Keterangan",
  "Keterangan Tambahan",
];

/** A TabSchema-shaped view used by the registration read path. */
export const REGISTRATION_SCHEMA: TabSchema = {
  tab: REGISTRATION_TAB,
  columns: REGISTRATION_COLUMNS,
};

/** Registration stage columns, funnel order (identity used by derivations). */
export const REGISTRATION_STAGE_COLUMNS: string[] = [
  "Penjadwalan Interview",
  "Interview",
  "Hasil Interview\n(Diterima/Tidak)",
  "Pengumuman hasil interview",
  "Pengiriman Juknis",
  "Pembayaran",
  "Invite Grup Pendaftar",
];