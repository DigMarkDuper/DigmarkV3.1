/**
 * Adapter source interface — DATA_CONTRACT.md §6 + NEXTJS_ARCHITECTURE.md §6.
 *
 * The **SheetSource** interface is the only place that knows "Google Sheets"
 * (column names, network calls). The UI and use-cases consume only normalized
 * DTOs + use-case functions, so a future PostgreSQL source can implement the
 * same interface (schema map + rules unchanged).
 *
 * PHASE A NOTE: this file declares the interface and a NOT-implemented
 * placeholder. NO real gspread/googleapis calls happen here — the actual
 * Google Sheets adapter lands in Phase B (server-side, sandbox-tested).
 */

/** A single row of raw cell values as returned by the source. */
export type Cell = unknown;
/** A row as an object keyed by column header (normalized form). */
export type Row = Record<string, unknown>;

/** Outcome of a write operation. */
export interface Result {
  ok: boolean;
  /** Machine-readable error code when !ok. */
  code?: string;
  message?: string;
  /** Number of rows/cells affected when applicable. */
  affected?: number;
}

/** Server-guarded confirmation payload for a destructive clear operation. */
export interface ConfirmInfo {
  /** App key of the tab being cleared (must match the URL's key). */
  appKey: string;
  /** Human-friendly tab title the operator confirmed. */
  tabTitle: string;
  /** Whether the operator typed the confirmation token. */
  confirmed: boolean;
  /** Audit identity (Phase C sets this server-side). */
  actor?: string;
}

/** Metadata about a tab for bootstrap + drift detection. */
export interface TabMeta {
  /** App key (settings.SHEETS key). */
  appKey: string;
  /** Declared tab title. */
  title: string;
  /** Resolved Google Sheets gid (snapshot at bootstrap). */
  gid: string;
  /** Live headers as read from the master (drift check). */
  headers: string[];
  /** True when live headers differ from the declared schema. */
  drift: boolean;
}

/**
 * The SheetSource contract (DATA_CONTRACT.md §6, verbatim semantics).
 * Implemented server-side only; the browser never holds credentials.
 */
export interface SheetSource {
  /** Fetch + normalize a tab to typed rows (cached server-side, TTL 300). */
  fetchTable(key: string): Promise<Row[]>;
  /** Append rows, preserving formulas/formatting (USER_ENTERED). */
  appendRows(key: string, rows: Cell[][]): Promise<Result>;
  /** Update one cell at (rowIndex, column). */
  updateCell(key: string, rowIndex: number, column: string, value: unknown): Promise<Result>;
  /** Destructive clear, server-guarded (2-step + audit-logged). */
  clearTable(key: string, confirm: ConfirmInfo): Promise<Result>;
  /** Bootstrap title→gid snapshot + drift detection. */
  listTabs(): Promise<TabMeta[]>;
}

/**
 * PLACEHOLDER — NOT implemented in Phase A (no network, no credentials).
 * Throws on every call so accidental use fails loudly during Phase A.
 */
export class GoogleSheetsSourcePlaceholder implements SheetSource {
  private notImplemented(method: string): never {
    throw new Error(
      `${method} is not implemented in Phase A. The Google Sheets adapter is ` +
        `built in Phase B (server-side, sandbox-tested, never the live master).`,
    );
  }

  fetchTable(_key: string): Promise<Row[]> {
    return this.notImplemented("SheetSource.fetchTable");
  }
  appendRows(_key: string, _rows: Cell[][]): Promise<Result> {
    return this.notImplemented("SheetSource.appendRows");
  }
  updateCell(_key: string, _rowIndex: number, _column: string, _value: unknown): Promise<Result> {
    return this.notImplemented("SheetSource.updateCell");
  }
  clearTable(_key: string, _confirm: ConfirmInfo): Promise<Result> {
    return this.notImplemented("SheetSource.clearTable");
  }
  listTabs(): Promise<TabMeta[]> {
    return this.notImplemented("SheetSource.listTabs");
  }
}