/**
 * Region -> province resolver. Bridges the CANONICAL region strings produced by
 * `normalizer.ts` onto the geo-province keys in `INDONESIA_PROVINCES`.
 *
 * A canonical region is either:
 *   - a province key itself (Daerah Istimewa Yogyakarta, DKI Jakarta, …)
 *   - a city/regency that belongs to a province (Sleman, Bandung, …)
 *
 * `resolve()` NEVER invents geography: it only returns known=false for anything
 * not explicitly listed. Pure + dependency-free + unit-tested.
 */
import { INDONESIA_PROVINCES } from "./indonesiaProvinces";

/**
 * Canonical region -> province KEY (must be a real key in INDONESIA_PROVINCES).
 * Includes province names mapped to themselves so `resolve` validates against
 * the geometry before trusting the mapping.
 */
export const REGION_PROVINCE: Record<string, string> = {
  // Provinces (self edges) — validated against INDONESIA_PROVINCES at resolve().
  "Aceh": "Aceh",
  "Bali": "Bali",
  "Banten": "Banten",
  "Bengkulu": "Bengkulu",
  "DKI Jakarta": "DKI Jakarta",
  "Daerah Istimewa Yogyakarta": "Daerah Istimewa Yogyakarta",
  "Gorontalo": "Gorontalo",
  "Jambi": "Jambi",
  "Jawa Barat": "Jawa Barat",
  "Jawa Tengah": "Jawa Tengah",
  "Jawa Timur": "Jawa Timur",
  "Kalimantan Barat": "Kalimantan Barat",
  "Kalimantan Selatan": "Kalimantan Selatan",
  "Kalimantan Tengah": "Kalimantan Tengah",
  "Kalimantan Timur": "Kalimantan Timur",
  "Kalimantan Utara": "Kalimantan Utara",
  "Kepulauan Bangka Belitung": "Kepulauan Bangka Belitung",
  "Kepulauan Riau": "Kepulauan Riau",
  "Lampung": "Lampung",
  "Maluku": "Maluku",
  "Maluku Utara": "Maluku Utara",
  "Nusa Tenggara Barat": "Nusa Tenggara Barat",
  "Nusa Tenggara Timur": "Nusa Tenggara Timur",
  "Papua": "Papua",
  "Papua Barat": "Papua Barat",
  "Papua Barat Daya": "Papua Barat Daya",
  "Papua Pegunungan": "Papua Pegunungan",
  "Papua Selatan": "Papua Selatan",
  "Papua Tengah": "Papua Tengah",
  "Riau": "Riau",
  "Sulawesi Barat": "Sulawesi Barat",
  "Sulawesi Selatan": "Sulawesi Selatan",
  "Sulawesi Tengah": "Sulawesi Tengah",
  "Sulawesi Tenggara": "Sulawesi Tenggara",
  "Sulawesi Utara": "Sulawesi Utara",
  "Sumatera Barat": "Sumatera Barat",
  "Sumatera Selatan": "Sumatera Selatan",
  "Sumatera Utara": "Sumatera Utara",

  // City / regency / village-level canonical regions -> province KEY.
  // (Regency/city names also acceptable here; CITY_PROVINCE is the curated split.)
  "Purworejo": "Jawa Tengah",
  "Surakarta": "Jawa Tengah",
  "Padang": "Sumatera Barat",
  "Makassar": "Sulawesi Selatan",
  "Kulon Progo": "Daerah Istimewa Yogyakarta",
  "Karawang": "Jawa Barat",
  "Banjar": "Jawa Barat",
  "Banjarmasin": "Kalimantan Selatan",
};

/**
 * Regency / city names -> province key (CENTRAL home for city-level regions).
 * These are canonical region strings (after normalize()) that belong to a
 * province but aren't a province cap/minister-level name like cleanup targets.
 * Map many more live values here as needed.
 */
export const CITY_PROVINCE: Record<string, string> = {
  "Sleman": "Daerah Istimewa Yogyakarta",
  "Bantul": "Daerah Istimewa Yogyakarta",
  "Kota Yogyakarta": "Daerah Istimewa Yogyakarta",
  "Kulon Progo": "Daerah Istimewa Yogyakarta",
  "Gunungkidul": "Daerah Istimewa Yogyakarta",
  "Wates": "Daerah Istimewa Yogyakarta",
  "Kalasan": "Daerah Istimewa Yogyakarta",
  "Bandung": "Jawa Barat",
  "Cirebon": "Jawa Barat",
  "Bogor": "Jawa Barat",
  "Bekasi": "Jawa Barat",
  "Depok": "Jawa Barat",
  "Karawang": "Jawa Barat",
  "Garut": "Jawa Barat",
  "Sukabumi": "Jawa Barat",
  "Banjar": "Jawa Barat",
  "Cianjur": "Jawa Barat",
  "Majalengka": "Jawa Barat",
  "Ciamis": "Jawa Barat",
  "Pangandaran": "Jawa Barat",
  "Tasikmalaya": "Jawa Barat",
  "Sumedang": "Jawa Barat",
  "Kuningan": "Jawa Barat",
  "Cimahi": "Jawa Barat",
  "Cikarang": "Jawa Barat",
  "Indramayu": "Jawa Barat",
  "Subang": "Jawa Barat",
  "Purwakarta": "Jawa Barat",
  "Purwokerto": "Jawa Tengah",
  "Semarang": "Jawa Tengah",
  "Solo": "Jawa Tengah",
  "Surakarta": "Jawa Tengah",
  "Klaten": "Jawa Tengah",
  "Magelang": "Jawa Tengah",
  "Cilacap": "Jawa Tengah",
  "Purbalingga": "Jawa Tengah",
  "Kebumen": "Jawa Tengah",
  "Purworejo": "Jawa Tengah",
  "Tegal": "Jawa Tengah",
  "Brebes": "Jawa Tengah",
  "Sukoharjo": "Jawa Tengah",
  "Temanggung": "Jawa Tengah",
  "Kudus": "Jawa Tengah",
  "Pemalang": "Jawa Tengah",
  "Pekalongan": "Jawa Tengah",
  "Boyolali": "Jawa Tengah",
  "Banjarnegara": "Jawa Tengah",
  "Demak": "Jawa Tengah",
  "Sragen": "Jawa Tengah",
  "Kendal": "Jawa Tengah",
  "Rembang": "Jawa Tengah",
  "Salatiga": "Jawa Tengah",
  "Jepara": "Jawa Tengah",
  "Wonogiri": "Jawa Tengah",
  "Grobogan": "Jawa Tengah",
  "Blora": "Jawa Tengah",
  "Karanganyar": "Jawa Tengah",
  "Batang": "Jawa Tengah",
  "Pati": "Jawa Tengah",
  "Wonosobo": "Jawa Tengah",
  "Kutoarjo": "Jawa Tengah",
  "Banyumas": "Jawa Tengah",
  "Surabaya": "Jawa Timur",
  "Malang": "Jawa Timur",
  "Banyuwangi": "Jawa Timur",
  "Tuban": "Jawa Timur",
  "Jember": "Jawa Timur",
  "Kediri": "Jawa Timur",
  "Ngawi": "Jawa Timur",
  "Probolinggo": "Jawa Timur",
  "Gresik": "Jawa Timur",
  "Nganjuk": "Jawa Timur",
  "Mojokerto": "Jawa Timur",
  "Tulungagung": "Jawa Timur",
  "Sidoarjo": "Jawa Timur",
  "Lamongan": "Jawa Timur",
  "Madiun": "Jawa Timur",
  "Ponorogo": "Jawa Timur",
  "Jombang": "Jawa Timur",
  "Trenggalek": "Jawa Timur",
  "Blitar": "Jawa Timur",
  "Lumajang": "Jawa Timur",
  "Pasuruan": "Jawa Timur",
  "Pacitan": "Jawa Timur",
  "Magetan": "Jawa Timur",
  "Bangkalan": "Jawa Timur",
  "Denpasar": "Bali",
  "Tangerang": "Banten",
  "Tangerang Selatan": "Banten",
  "Serang": "Banten",
  "Cilegon": "Banten",
  "Pandeglang": "Banten",
  "Medan": "Sumatera Utara",
  "Palembang": "Sumatera Selatan",
  "Padang": "Sumatera Barat",
  "Padang Panjang": "Sumatera Barat",
  "Banjarmasin": "Kalimantan Selatan",
  "Pontianak": "Kalimantan Barat",
  "Samarinda": "Kalimantan Timur",
  "Makassar": "Sulawesi Selatan",
  "Manado": "Sulawesi Utara",
  "Jayapura": "Papua",
  "Pekanbaru": "Riau",
  "Batam": "Kepulauan Riau",
  "Kerinci": "Jambi",
  "Ogan Ilir": "Sumatera Selatan",
  "Ogan Komering Ulu": "Sumatera Selatan",
  "Dharmasraya": "Sumatera Barat",
  "Mandailing": "Sumatera Utara",
  "Samosir": "Sumatera Utara",
  "Banjarbaru": "Kalimantan Selatan",
  "Balikpapan": "Kalimantan Timur",
  "Tarakan": "Kalimantan Utara",
  "Kotabaru": "Kalimantan Selatan",
  "Sambas": "Kalimantan Barat",
  "Palu": "Sulawesi Tengah",
  "Mamuju": "Sulawesi Barat",
  "Ternate": "Maluku Utara",
  "Sorong": "Papua Barat Daya",
  "Lombok Utara": "Nusa Tenggara Barat",
  "Atambua": "Nusa Tenggara Timur",
  "Banda Aceh": "Aceh",
  "Singkarak": "Sumatera Barat",
  "Jakarta Barat": "DKI Jakarta",
  "Jakarta Timur": "DKI Jakarta",
  "Jakarta Pusat": "DKI Jakarta",
  "Jakarta Utara": "DKI Jakarta",
  "Jakarta Selatan": "DKI Jakarta",
};

export interface ResolvedRegion {
  /** Province KEY valid in INDONESIA_PROVINCES, or "" when unknown. */
  province: string;
  /** The canonical region passed in (verbatim, trimmed). */
  region: string;
  /** True when the region resolved to a real geo province. */
  known: boolean;
}

/** True when `province` is a real key in the vendored geometry. */
export function isValidProvince(province: string): boolean {
  return Object.prototype.hasOwnProperty.call(INDONESIA_PROVINCES, province);
}

/**
 * Resolve a canonical region -> geo province. Order: REGION_PROVINCE then
 * CITY_PROVINCE, matched CASE-INSENSITIVELY (canonical regions produced by the
 * normalizer may be Title-cased aliases or lowercased clean keys), and the
 * result must be a valid INDONESIA_PROVINCES key. Unknowns return known=false
 * (never fabricated).
 */
export function resolve(region: string): ResolvedRegion {
  const key = String(region ?? "").trim();
  const lk = key.toLowerCase();
  const province =
    REGION_PROVINCE_LC[lk] ??
    CITY_PROVINCE_LC[lk] ??
    "";
  if (isValidProvince(province)) {
    return { province, region: key, known: true };
  }
  return { province: "", region: key, known: false };
}

const REGION_PROVINCE_LC: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_PROVINCE).map(([k, v]) => [k.toLowerCase(), v]),
);
const CITY_PROVINCE_LC: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_PROVINCE).map(([k, v]) => [k.toLowerCase(), v]),
);