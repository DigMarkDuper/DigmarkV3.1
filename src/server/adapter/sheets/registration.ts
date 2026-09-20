/**
 * Registration read path + source (Form Pendaftaran — SECOND spreadsheet).
 *
 * The registration data lives in its OWN Google Sheets workbook (NOT the
 * master), so the master-bound `GoogleSheetsSource` cannot read it — a
 * dedicated read path + source is required. This stays dependency-free and
 * network-testable: it accepts an injectable `SheetsApiClient` (like `read.ts`
 * / `FakeApi`), reads the single "Form Responses 1" tab with FORMATTED_VALUE
 * and normalizes via the shared `normalizeRows(&REGISTRATION_COLUMNS, ...)`.
 */

import { REGISTRATION_COLUMNS, REGISTRATION_TAB } from "../registrationSchema";
import type { Row } from "../source";
import { TableCache } from "./cache";
import type { SheetsApiClient } from "./client";
import { normalizeRows } from "./read";

/**
 * Fetch + normalize the registration table. Mirrors `readTable` but scoped to
 * the registration spreadsheet + schema instead of TAB_SCHEMAS. Graceful empty
 * on missing / unreadable tab (parity with `readTable`).
 */
export async function readRegistrationTable(
  api: SheetsApiClient,
  spreadsheetId: string,
): Promise<Row[]> {
  let values: unknown[][];
  try {
    const res = await api.spreadsheets.values.get({
      spreadsheetId,
      range: `'${REGISTRATION_TAB}'!A1:ZZ`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    values = res.data.values ?? [];
  } catch {
    return []; // tab missing / not accessible -> graceful empty
  }
  return normalizeRows(REGISTRATION_COLUMNS, values);
}

/** Cache key for the single registration table. */
export const REGISTRATION_CACHE_KEY = "registration";

/**
 * Server-side registration source: minimal contract (`fetch()` only) — the
 * command center is read-only. Cached (TTL 300s, parity with master tables).
 */
export class RegistrationSource {
  private readonly cache = new TableCache();

  constructor(
    private readonly api: SheetsApiClient,
    readonly spreadsheetId: string,
  ) {}

  /** Fetch + cache the normalized registration rows. */
  async fetch(): Promise<Row[]> {
    if (this.cache.has(REGISTRATION_CACHE_KEY)) {
      return this.cache.get<Row[]>(REGISTRATION_CACHE_KEY)!;
    }
    const rows = await readRegistrationTable(this.api, this.spreadsheetId);
    this.cache.set(REGISTRATION_CACHE_KEY, rows);
    return rows;
  }
}