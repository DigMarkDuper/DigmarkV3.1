/**
 * Google Sheets client + workbook bootstrap (title → gid mapping, drift check).
 *
 * Mirrors V3 `services/sheets.py::open_master` + `worksheet(title)` but adds the
 * V3.1 requirements from DATA_CONTRACT A3/A4:
 *  - snapshot `title → gid` (stability), 
 *  - validate that every declared tab exists (missing tab → error),
 *  - detect header drift against the declarative schema (schema.ts) instead of
 *    silently returning empty (audit H1/H2 + B1-class drift prevention).
 */

import { TAB_ORDER, TAB_SCHEMAS } from "../schema";
import type { TabSchema } from "../schema";
import type { TabMeta } from "../source";

/** Minimal surface of the Sheets API we use — injectable for unit tests. */
export interface SheetsApiValuesClient {
  get(params: unknown): Promise<{ data: { values?: unknown[][] } }>;
  append(params: unknown): Promise<{ data: { updates?: { updatedRange?: string; updatedRows?: number } } }>;
  update(params: unknown): Promise<{ data: { updatedRange?: string } }>;
  clear(params: unknown): Promise<unknown>;
  batchGet(params: unknown): Promise<{ data: { valueRanges?: { range?: string; values?: unknown[][] }[] } }>;
  batchUpdate(params: unknown): Promise<unknown>;
}
export interface SheetsApiSpreadsheetsClient {
  get(params: unknown): Promise<{
    data: { spreadsheetId?: string; sheets?: { properties?: { title?: string; sheetId?: number } }[] };
  }>;
  values: SheetsApiValuesClient;
  batchUpdate?(params: unknown): Promise<unknown>;
}
export interface SheetsApiClient {
  spreadsheets: SheetsApiSpreadsheetsClient;
}

/** Shape of one sheets.batchUpdate request item. */
export interface BatchRequest {
  addSheet?: { properties: { title: string } };
  deleteSheet?: { sheetId: number };
  updateSheetProperties?: {
    properties: { sheetId: number; title?: string; index?: number };
    fields: string;
  };
}

export interface SheetInfo {
  title: string;
  gid: number;
}

export interface Workbook {
  spreadsheetId: string;
  sheets: SheetInfo[];
  /** title (live, exact) → gid. */
  titleToGid: Map<string, number>;
}

export interface HeaderViolation {
  appKey: string;
  tabTitle: string;
  live: string[];
  declared: string[];
}

export interface BootstrapResult extends Workbook {
  tabs: TabMeta[];
  /** Declared tabs not present in the live workbook. */
  missingTabs: string[];
  /** Tabs whose live header row differs from the declared schema. */
  headerViolations: HeaderViolation[];
  drift: boolean;
}

export const SHEET_HEADER_RANGE = "1:1";

/**
 * Normalize a header row: trim content of each header cell and drop trailing
 * empty cells, so the declared schema ("  CAPTION ", extra empty trailing
 * columns) compares / matches cleanly with a live header row.
 */
export function trimTrailingEmpty(cells: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const c of cells) {
    const s = c === null || c === undefined ? "" : String(c);
    out.push(s.trim());
  }
  while (out.length && out[out.length - 1] === "") {
    out.pop();
  }
  return out;
}

export function headersEqual(live: readonly unknown[], declared: readonly unknown[]): boolean {
  return trimTrailingEmpty(live).join("\u0000") === trimTrailingEmpty(declared).join("\u0000");
}

/** 1-based column index → A1 letter (A, B, ..., Z, AA, AB, ...). */
export function colToA1(colIndex1Based: number): string {
  let n = colIndex1Based;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export class GoogleSheetsClient {
  constructor(
    private readonly api: SheetsApiClient,
    readonly spreadsheetId: string,
  ) {}

  /** List live sheets (title + gid) for the workbook. */
  async openWorkbook(): Promise<Workbook> {
    const res = await this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheets = (res.data.sheets ?? []).map((s) => ({
      title: s.properties?.title ?? "",
      gid: s.properties?.sheetId ?? 0,
    }));
    const titleToGid = new Map<string, number>();
    for (const s of sheets) {
      titleToGid.set(s.title, s.gid);
    }
    return { spreadsheetId: this.spreadsheetId, sheets, titleToGid };
  }

  /** Read one header row (row 1) of a tab. */
  async fetchHeaders(liveTitle: string): Promise<string[]> {
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${liveTitle}'!${SHEET_HEADER_RANGE}`,
    });
    const rows = res.data.values ?? [];
    return trimTrailingEmpty(rows[0] ?? []);
  }

  /**
   * Bootstrap: resolve title → gid, validate required tabs, detect header
   * drift against `schema.ts`. Missing declared tabs are surfaced in
   * `missingTabs` and also as drift = true (fail-loud rather than silent).
   */
  async listTabs(): Promise<BootstrapResult> {
    const wb = await this.openWorkbook();
    const tabs: TabMeta[] = [];
    const missingTabs: string[] = [];
    const headerViolations: HeaderViolation[] = [];

    for (const appKey of TAB_ORDER) {
      const schema: TabSchema = TAB_SCHEMAS[appKey];
      const gid = wb.titleToGid.get(schema.tab);
      if (gid === undefined) {
        missingTabs.push(appKey);
        continue;
      }
      let live: string[];
      try {
        live = await this.fetchHeaders(schema.tab);
      } catch {
        missingTabs.push(appKey); // not readable -> treat as missing (graceful)
        continue;
      }
      const drift = !headersEqual(live, schema.columns);
      if (drift) {
        headerViolations.push({ appKey, tabTitle: schema.tab, live, declared: schema.columns });
      }
      tabs.push({
        appKey,
        title: schema.tab,
        gid: String(gid),
        headers: live,
        drift,
      });
    }

    return {
      ...wb,
      tabs,
      missingTabs,
      headerViolations,
      drift: missingTabs.length > 0 || headerViolations.length > 0,
    };
  }
}