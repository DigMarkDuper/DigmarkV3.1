/**
 * Real Google Sheets data source implementing the `SheetSource` interface
 * (DATA_CONTRACT §6). Replaces the Phase A `GoogleSheetsSourcePlaceholder`.
 *
 * Server-side only: constructed from a real `GoogleSheetsClient` backed by a
 * service-account JWT. Holds an in-memory `TableCache` (TTL 300s) and, on a
 * write, invalidates ONLY the affected table (the V3.1 improvement over V3's
 * `clear_all_caches`).
 */

import { columnsFor, TAB_SCHEMAS } from "../schema";
import type { Cell, ConfirmInfo, Result, Row, SheetSource, TabMeta } from "../source";
import { TableCache } from "./cache";
import type { BootstrapResult, GoogleSheetsClient, SheetsApiClient } from "./client";
import { readTable } from "./read";
import { appendRowsToSheet, clearSheet, syncWaToCrm, updateCellInSheet } from "./write";

export interface GoogleSheetsSourceOptions {
  /** Cache TTL in ms (default 300000 = V3 parity). */
  ttlMs?: number;
}

export class GoogleSheetsSource implements SheetSource {
  private readonly cache: TableCache;

  constructor(
    private readonly client: GoogleSheetsClient,
    private readonly api: SheetsApiClient,
    private readonly opts: GoogleSheetsSourceOptions = {},
  ) {
    this.cache = new TableCache(opts.ttlMs);
  }

  /** Access the cache (tests inspect invalidation behavior). */
  get cacheImpl(): TableCache {
    return this.cache;
  }

  get spreadsheetId(): string {
    return this.client.spreadsheetId;
  }

  async fetchTable(appKey: string): Promise<Row[]> {
    if (this.cache.has(appKey)) {
      return this.cache.get<Row[]>(appKey)!;
    }
    const rows = await readTable(this.api, this.client.spreadsheetId, appKey);
    this.cache.set(appKey, rows);
    return rows;
  }

  async appendRows(appKey: string, rows: Cell[][]): Promise<Result> {
    const schema = TAB_SCHEMAS[appKey];
    if (!schema) {
      return { ok: false, code: "UNKNOWN_TAB", message: `Unknown app key '${appKey}'.` };
    }
    const res = await appendRowsToSheet(this.api, this.client.spreadsheetId, schema.tab, rows);
    if (res.ok) {
      this.cache.invalidate(appKey); // invalidate the affected table only
    }
    return res;
  }

  async updateCell(appKey: string, rowIndex: number, column: string, value: unknown): Promise<Result> {
    const schema = TAB_SCHEMAS[appKey];
    if (!schema) {
      return { ok: false, code: "UNKNOWN_TAB", message: `Unknown app key '${appKey}'.` };
    }
    const res = await updateCellInSheet(this.api, this.client.spreadsheetId, schema.tab, rowIndex, column, value);
    if (res.ok) {
      this.cache.invalidate(appKey);
    }
    return res;
  }

  async clearTable(appKey: string, confirm: ConfirmInfo): Promise<Result> {
    const res = await clearSheet(this.api, this.client.spreadsheetId, appKey, confirm);
    if (res.ok) {
      this.cache.invalidate(appKey);
    }
    return res;
  }

  listTabs(): Promise<TabMeta[]> {
    return this.client.listTabs().then((b: BootstrapResult) => b.tabs);
  }

  /** Full bootstrap incl. missing-tab + header-drift diagnostics. */
  bootstrap(): Promise<BootstrapResult> {
    return this.client.listTabs();
  }

  /** WA→CRM sync (B1-correct, header-based) with affected-table invalidation. */
  async syncWaToCrm(): Promise<{ ok: boolean; message: string; added: number; skipped: number }> {
    return syncWaToCrm(this.api, this.client.spreadsheetId, () => this.cache.invalidate("crm"));
  }

  /** Declared columns for an app key (handy for building write payloads). */
  columnsFor(appKey: string): string[] {
    return columnsFor(appKey);
  }
}