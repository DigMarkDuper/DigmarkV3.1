/**
 * The data-source surface the Phase C API controllers consume.
 *
 * Extends the Phase B `SheetSource` interface (read/fetch/append/update/clear/
 * listTabs) with the two adapter capabilities the API layer needs that the
 * base interface does not declare: `columnsFor` (schema column resolution for
 * buildImportRows) and `syncWaToCrm` (the existing WA→CRM business sync).
 *
 * `GoogleSheetsSource` satisfies this type structurally, so controllers stay
 * adapter-agnostic while still consuming the REAL Phase B adapter in tests
 * (FakeApi-backed) and production (createSource).
 */

import type { SheetSource } from "@/server/adapter/source";

export interface SyncSummary {
  ok: boolean;
  message: string;
  added: number;
  skipped: number;
}

export interface ApiSource extends SheetSource {
  /** Declared schema columns for an app key (used by import projection). */
  columnsFor(key: string): string[];
  /** Existing Phase B WA→CRM sync (B1-correct). */
  syncWaToCrm(): Promise<SyncSummary>;
}