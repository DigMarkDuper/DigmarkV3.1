/**
 * Server-side Google service-account authentication.
 *
 * Builds a JWT client for the Sheets API using ONLY the `spreadsheets` scope
 * (least privilege — no Drive scope), mirroring V3 `services/sheets.py`.
 *
 * Credentials are read from process env (loaded from a gitignored `.env.local`
 * by Next.js runtime / Vitest setup). They are NEVER exported to the browser:
 * this module is server-only and throws if invoked without valid creds.
 */

import { google } from "googleapis";
import type { SheetsApiClient } from "./client";

export const SPREADSHEET_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
/** Least-privilege scopes; identical to V3 `SHEET_SCOPES`. */
export const SHEET_SCOPES = [SPREADSHEET_SCOPE];

/** Fields of a Google service-account credential (subset we need). */
export interface SheetCredentials {
  clientEmail: string;
  privateKey: string;
  projectId?: string;
  clientId?: string;
  privateKeyId?: string;
  tokenUri?: string;
}

/** Fully resolved adapter config (credentials + spreadsheet keys). */
export interface SheetConfig {
  credentials: SheetCredentials;
  /** Production master (NEVER written by tests). */
  masterSpreadsheetKey: string;
  /** Sandbox spreadsheet used for all write tests. */
  sandboxSpreadsheetKey: string;
}

/**
 * Normalize a PEM private key to real newlines + trimmed, exactly as V3 does
 * (`info["private_key"].replace("\\n", "\n").strip()`).
 */
export function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

/**
 * Build a `SheetConfig` from env vars (optionally overridden for tests).
 * `env` is injectable so unit tests can simulate missing credentials.
 */
export function loadSheetConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<SheetConfig> = {},
): SheetConfig {
  return {
    credentials: {
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL ?? overrides.credentials?.clientEmail ?? "",
      privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ? normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
        : (overrides.credentials?.privateKey ?? ""),
      projectId: env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID ?? overrides.credentials?.projectId,
      clientId: env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID ?? overrides.credentials?.clientId,
      privateKeyId: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID ?? overrides.credentials?.privateKeyId,
      tokenUri: env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI ?? overrides.credentials?.tokenUri,
    },
    masterSpreadsheetKey: env.MASTER_SPREADSHEET_KEY ?? overrides.masterSpreadsheetKey ?? "",
    sandboxSpreadsheetKey: env.SANDBOX_SPREADSHEET_KEY ?? overrides.sandboxSpreadsheetKey ?? "",
  };
}

/** Throw a clear error when required credentials are missing/invalid. */
export function assertValidConfig(config: SheetConfig): void {
  if (!config.credentials.clientEmail) {
    throw new Error(
      "Google Sheets adapter: missing client email — set GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL " +
        "(local: .env.local).",
    );
  }
  if (!config.credentials.privateKey) {
    throw new Error(
      "Google Sheets adapter: missing private key — set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY " +
        "(local: .env.local).",
    );
  }
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(config.credentials.privateKey)) {
    throw new Error(
      "Google Sheets adapter: private_key is not a PEM-encoded private key " +
        "(expected a '-----BEGIN PRIVATE KEY-----' block; check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).",
    );
  }
}

/**
 * Build an authenticated googleapis Sheets client.
 * Throws if credentials are missing/invalid (config validation).
 * Returns the structural API surface used by the adapter (unit-test friendly).
 */
export function buildSheetsApi(config: SheetConfig): SheetsApiClient {
  assertValidConfig(config);
  const auth = new google.auth.JWT({
    email: config.credentials.clientEmail,
    key: config.credentials.privateKey,
    scopes: SHEET_SCOPES,
  });
  return google.sheets({ version: "v4", auth }) as unknown as SheetsApiClient;
}