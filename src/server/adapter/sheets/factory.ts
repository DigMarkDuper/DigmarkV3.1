/**
 * Factory to build the real, authenticated Google Sheets source from config.
 * Server-side only — never import this from a client component.
 */

import { buildSheetsApi, loadSheetConfig, type SheetConfig } from "./auth";
import { GoogleSheetsClient } from "./client";
import { GoogleSheetsSource } from "./index";
import { RegistrationSource } from "./registration";

/**
 * Build a `GoogleSheetsSource` bound to `spreadsheetId`.
 * `config` defaults to env-loaded config (gitignored `.env.local`).
 */
export function createSource(
  spreadsheetId: string,
  config?: SheetConfig,
  opts?: { ttlMs?: number },
): GoogleSheetsSource {
  const cfg = config ?? loadSheetConfig();
  const api = buildSheetsApi(cfg);
  const client = new GoogleSheetsClient(api, spreadsheetId);
  return new GoogleSheetsSource(client, api, opts);
}

/** The sandbox spreadsheet source (all Phase B write tests target this). */
export function createSandboxSource(config?: SheetConfig, opts?: { ttlMs?: number }): GoogleSheetsSource {
  const cfg = config ?? loadSheetConfig();
  if (!cfg.sandboxSpreadsheetKey) {
    throw new Error("SANDBOX_SPREADSHEET_KEY is not set in env (local: .env.local).");
  }
  return createSource(cfg.sandboxSpreadsheetKey, cfg, opts);
}

/**
 * Build a read-only `RegistrationSource` bound to the registration workbook.
 * Uses the SAME auth (service account) as the master source — reachable scope
 * is shared. `config` defaults to env-loaded config (gitignored `.env.local`).
 */
export function createRegistrationSource(
  spreadsheetId: string,
  config?: SheetConfig,
): RegistrationSource {
  const cfg = config ?? loadSheetConfig();
  const api = buildSheetsApi(cfg);
  return new RegistrationSource(api, spreadsheetId);
}