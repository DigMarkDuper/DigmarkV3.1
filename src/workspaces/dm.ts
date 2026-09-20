/**
 * DM Sosmed workspace — pure derivations + append payload builder
 * (port of pages/6_DM_Sosmed.py).
 *
 * Phase E rule: the browser computes ONLY the simple derived counts/
 * preparations the V3 page computed, and never touches Sheets directly.
 * All inputs are the normalized rows from GET /api/tables/dm_sosmed.
 *
 * Mirrors 6_DM_Sosmed.py line-for-line:
 *   - platform col = "Platform" if present, else 2nd column of the row keys,
 *     else none
 *   - metrics: Total Prospek / Instagram / TikTok / Facebook (case-insensitive
 *     substring match on the platform col)
 *   - status col = "Status DM" if present else "Status" else none (schema uses
 *     "Status"); tag col = "Tag Prospek" if present else "Tag" else none
 *   - status donut = value counts; tag donut = value counts over rows whose
 *     tag stripped != "" (V3 filters empty tags)
 *   - recent = reversed rows, take 15
 *   - append payload = schema-keyed object with V3 hp apostrophe+62 prefix,
 *     link construction, seq, and YYYY-MM-DD date
 */
import type { Row } from "@/server/adapter/source";
import { columnNames } from "@/server/utils/helpers";

export const PLATFORM_OPTIONS = ["Instagram", "Tiktok", "Facebook"];
export const STATUS_OPTIONS = [
  "No Response", "Follow Up", "Daftar", "Interview", "Closing", "Move ke Whatsapp",
];
export const TAG_OPTIONS = [
  "HOT LEAD", "WARM LEAD", "COLD LEAD", "FUTURE PROSPECT", "NOT ELIGIBLE",
];

export interface SourceStat {
  name: string;
  n: number;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Value counts of a column, ordered descending (V3 `value_counts()`). */
function valueCountDesc(rows: Row[], col: string): SourceStat[] {
  const count = new Map<string, number>();
  for (const r of rows) {
    const v = str(r[col]).trim();
    count.set(v, (count.get(v) ?? 0) + 1);
  }
  return [...count.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n);
}

/** V3 plat_col: "Platform" else the 2nd row-key column else none. */
export function platformCol(rows: Row[]): string | undefined {
  const cols = columnNames(rows);
  if (cols.includes("Platform")) return "Platform";
  return cols.length > 1 ? cols[1] : undefined;
}

/** V3 status_col: "Status DM" else "Status" else none. */
export function statusCol(rows: Row[]): string | undefined {
  const cols = columnNames(rows);
  if (cols.includes("Status DM")) return "Status DM";
  if (cols.includes("Status")) return "Status";
  return undefined;
}

/** V3 tag_col: "Tag Prospek" else "Tag" else none. */
export function tagCol(rows: Row[]): string | undefined {
  const cols = columnNames(rows);
  if (cols.includes("Tag Prospek")) return "Tag Prospek";
  if (cols.includes("Tag")) return "Tag";
  return undefined;
}

/** Count rows whose platform-col value contains `needle` (case-insensitive). */
function countContains(rows: Row[], col: string, needle: string): number {
  const n = needle.toLowerCase();
  return rows.reduce((acc, r) => (str(r[col]).toLowerCase().includes(n) ? acc + 1 : acc), 0);
}

export interface DmStats {
  total: number;
  instagram: number;
  tiktok: number;
  facebook: number;
  /** Resolved platform column (for rendering), or undefined when absent. */
  platCol: string | undefined;
  /** Status distribution (donut) — [] when no status col. */
  statusDist: SourceStat[];
  /** Tag distribution over non-empty-tag rows — [] when no tag col / empty. */
  tagDist: SourceStat[];
  /** 15 most recent rows (reversed input, V3 `df.iloc[::-1].head(15)`). */
  recent: Row[];
}

/** All derived state for the DM dashboard. */
export function deriveDmStats(rows: Row[]): DmStats {
  const pcol = platformCol(rows);
  const scol = statusCol(rows);
  const tcol = tagCol(rows);
  return {
    total: rows.length,
    instagram: pcol ? countContains(rows, pcol, "Instagram") : 0,
    tiktok: pcol ? countContains(rows, pcol, "Tiktok") : 0,
    facebook: pcol ? countContains(rows, pcol, "Facebook") : 0,
    platCol: pcol,
    statusDist: scol ? valueCountDesc(rows, scol) : [],
    tagDist: tcol
      ? valueCountDesc(rows.filter((r) => str(r[tcol]).trim() !== ""), tcol)
      : [],
    recent: [...rows].reverse().slice(0, 15),
  };
}

/* ---------------------------------------------------------------------------
 * Append payload builder (V3 6_DM_Sosmed.py submission semantics).
 * ------------------------------------------------------------------------ */

export interface DmFormValues {
  platform: string;
  username: string;
  domisili: string;
  hp: string;
  statusDm: string;
  tagDm: string;
}

/** Schema-keyed append object for POST /api/tables/dm_sosmed. */
export interface DmAppendPayload {
  No: number;
  Platform: string;
  "Nama / Username": string;
  "Link Username": string;
  "No HP/ Whatsapp": string;
  Domisili: string;
  Status: string;
  "Tag Prospek": string;
  "Tanggal Masuk": string;
}

/** V3 `strip().replace("@", "")` (removes all @, keeps other chars). */
export function normalizeUsername(username: string): string {
  return username.trim().replace(/@/g, "");
}

/** V3 link map; unknown platform falls through to facebook. */
export function buildLink(platform: string, uname: string): string {
  if (platform === "Instagram") return `https://instagram.com/${uname}`;
  if (platform === "Tiktok") return `https://tiktok.com/@${uname}`;
  return `https://facebook.com/${uname}`;
}

/**
 * V3 hp: strip; empty -> ""; starts with "0" -> `'` + "62" + rest; else `'` + hp.
 * Leading apostrophe forces text in Sheets.
 */
export function normalizePhone(hp: string): string {
  const s = String(hp ?? "").trim();
  if (s === "") return "";
  return s.startsWith("0") ? `'62${s.slice(1)}` : `'${s}`;
}

/** Today as YYYY-MM-DD (V3 `datetime.now().strftime("%Y-%m-%d")`). */
export function todayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build the schema-keyed append object. `rowCount` = current rows.length so
 * seq = rowCount+1 (or 1 when empty), exactly V3 `len(df)+1 else 1`.
 * `now` is injectable for deterministic tests.
 */
export function buildAppendPayload(
  values: DmFormValues,
  rowCount: number,
  now: Date = new Date(),
): DmAppendPayload {
  const uname = normalizeUsername(values.username);
  return {
    No: rowCount > 0 ? rowCount + 1 : 1,
    Platform: values.platform,
    "Nama / Username": values.username,
    "Link Username": buildLink(values.platform, uname),
    "No HP/ Whatsapp": normalizePhone(values.hp),
    Domisili: values.domisili,
    Status: values.statusDm,
    "Tag Prospek": values.tagDm,
    "Tanggal Masuk": todayYmd(now),
  };
}
