/**
 * Location text normalization + alias/abbreviation dictionary.
 *
 * The `Asal` (source location) column of wa_admin is free-form Indonesian text:
 * real province names, cities/regencies, abbreviations (Jabar, DIY, Purbalingga…),
 * and typo variants (Puworejo, Karwang, Makasar, Padanng…). This module is the
 * SINGLE place that turns a raw value into a CANONICAL region string.
 *
 * Pipeline:
 *   1. `clean(raw)`          -> lowercase, whitespace-collapsed, trimmed key.
 *   2. `normalize(raw)`      -> clean + alias lookup (LOCATION_ALIASES), falling
 *                               back to the clean key for unknown values.
 *
 * Pure text only — NO geo knowledge, NO Sheets access. Geo resolution lives in
 * `mapping.ts`. Unit-tested.
 */

/** Collapse ALL whitespace to single spaces, trim, casefold. */
export function clean(raw: unknown): string {
  return String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** A raw value that is effectively empty (nothing to map). */
export function isEmpty(s: string): boolean {
  return s === "" || s === "nan";
}

/**
 * Alias / abbreviation / spelling-variant dictionary. Keys are NORMALIZED keys
 * (lowercase, single inner spaces, trimmed — i.e. the output of `clean`).
 * Values are CANONICAL region strings (a real province or city/regency name).
 *
 * Extendable: add a new key/value here (or in `mapping.ts` CITY_PROVINCE) to
 * cover more of the 176 distinct live values. DO NOT duplicate a value into
 * both maps — provinces and city-canonicals live here, city->province edges
 * only in `mapping.ts`.
 */
export const LOCATION_ALIASES: Record<string, string> = {
  // ---- Province name canonical forms (self-mapping) -----------------------
  "aceh": "Aceh",
  "bali": "Bali",
  "banten": "Banten",
  "bengkulu": "Bengkulu",
  "dki jakarta": "DKI Jakarta",
  "daerah istimewa yogyakarta": "Daerah Istimewa Yogyakarta",
  "gorontalo": "Gorontalo",
  "jambi": "Jambi",
  "jawa barat": "Jawa Barat",
  "jawa tengah": "Jawa Tengah",
  "jawa timur": "Jawa Timur",
  "kalimantan barat": "Kalimantan Barat",
  "kalimantan selatan": "Kalimantan Selatan",
  "kalimantan tengah": "Kalimantan Tengah",
  "kalimantan timur": "Kalimantan Timur",
  "kalimantan utara": "Kalimantan Utara",
  "kepulauan bangka belitung": "Kepulauan Bangka Belitung",
  "kepulauan riau": "Kepulauan Riau",
  "lampung": "Lampung",
  "maluku": "Maluku",
  "maluku utara": "Maluku Utara",
  "nusa tenggara barat": "Nusa Tenggara Barat",
  "nusa tenggara timur": "Nusa Tenggara Timur",
  "papua": "Papua",
  "papua barat": "Papua Barat",
  "papua barat daya": "Papua Barat Daya",
  "papua pegunungan": "Papua Pegunungan",
  "papua selatan": "Papua Selatan",
  "papua tengah": "Papua Tengah",
  "riau": "Riau",
  "sulawesi barat": "Sulawesi Barat",
  "sulawesi selatan": "Sulawesi Selatan",
  "sulawesi tengah": "Sulawesi Tengah",
  "sulawesi tenggara": "Sulawesi Tenggara",
  "sulawesi utara": "Sulawesi Utara",
  "sumatera barat": "Sumatera Barat",
  "sumatera selatan": "Sumatera Selatan",
  "sumatera utara": "Sumatera Utara",

  // ---- Common short names / abbreviations ----------------------------------
  "jabar": "Jawa Barat",
  "jateng": "Jawa Tengah",
  "jatim": "Jawa Timur",
  "jakarta": "DKI Jakarta",
  "dki": "DKI Jakarta",
  "nusa tenggara timur ntt": "Nusa Tenggara Timur",
  "ntt": "Nusa Tenggara Timur",
  "ntb": "Nusa Tenggara Barat",
  "kalbar": "Kalimantan Barat",
  "kalsel": "Kalimantan Selatan",
  "kaltim": "Kalimantan Timur",
  "kalteng": "Kalimantan Tengah",
  "kalut": "Kalimantan Utara",
  "babel": "Kepulauan Bangka Belitung",
  "kepri": "Kepulauan Riau",
  "sulbar": "Sulawesi Barat",
  "sulsel": "Sulawesi Selatan",
  "sulteng": "Sulawesi Tengah",
  "sultra": "Sulawesi Tenggara",
  "sulut": "Sulawesi Utara",
  "sumut": "Sumatera Utara",
  "sumbar": "Sumatera Barat",
  "sumsel": "Sumatera Selatan",
  "sumatra utara": "Sumatera Utara",
  "sumatra selatan": "Sumatera Selatan",
  "sumatra barat": "Sumatera Barat",
  "bangka belitung": "Kepulauan Bangka Belitung",

  // ---- DIY / Yogyakarta variants -------------------------------------------
  "jogja": "Daerah Istimewa Yogyakarta",
  "yogya": "Daerah Istimewa Yogyakarta",
  "kota jogja": "Daerah Istimewa Yogyakarta",
  "kota yogyakarta": "Daerah Istimewa Yogyakarta",
  "diy": "Daerah Istimewa Yogyakarta",
  "yogyakarta": "Daerah Istimewa Yogyakarta",

  // ---- City / regency canonical names (spelling-variant -> canonical) ------
  "solo": "Surakarta",
  "surakarta": "Surakarta",
  "purworejo": "Purworejo",
  "puworejo": "Purworejo",
  "purworjo": "Purworejo",
  "padang": "Padang",
  "padanng": "Padang",
  "makassar": "Makassar",
  "makasar": "Makassar",
  "kulon pro go": "Kulon Progo",
  "kulonprogo": "Kulon Progo",
  "kulonprogp": "Kulon Progo",
  "kulon pro gp": "Kulon Progo",
  "kulon progp": "Kulon Progo",
  "kulonprog": "Kulon Progo",
  "karawang": "Karawang",
  "karwang": "Karawang",
  "banjar patroman": "Banjar",
  "banjarmasin": "Banjarmasin",
};

/**
 * Normalize a raw Asal value to its CANONICAL region string.
 * Empty/null/whitespace/nan -> "". Unknown-but-non-empty values pass through
 * the clean key (so aggregation can still bucket them as unrecognized, and
 * `mapping.resolve` can still reject them).
 */
export function normalize(raw: unknown): string {
  const key = clean(raw);
  if (isEmpty(key)) return "";
  return LOCATION_ALIASES[key] ?? key;
}