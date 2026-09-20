/**
 * Server API wiring (Phase C).
 *
 * Builds the production-ready Google Sheets source (MASTER spreadsheet) and the
 * default audit sink used by the thin Next.js route handlers. Controllers in
 * this folder are framework-free pure functions taking (session, source, ...)
 * so tests can drive them with a FakeApi-backed GoogleSheetsSource without a
 * running Next server.
 */

import { createSource, createRegistrationSource } from "@/server/adapter/sheets/factory";
import { RegistrationSource } from "@/server/adapter/sheets/registration";
import { defaultAuditLog, type AuditLog } from "@/lib/audit";
import type { ApiSource } from "./types";

/**
 * Lazily create + memoize the PRODUCTION Google Sheets source bound to the
 * master spreadsheet. Only invoked on the first real request at runtime (never
 * at import/module-eval time, so `next build` and Vitest never construct a
 * network client). Tests never call this — they build their own FakeApi source.
 */
let masterSource: ApiSource | null = null;
export function getMasterSource(): ApiSource {
  if (!masterSource) {
    const key = process.env.MASTER_SPREADSHEET_KEY ?? "";
    if (!key) {
      throw new Error("MASTER_SPREADSHEET_KEY is not set in env (local: .env.local).");
    }
    masterSource = createSource(key);
  }
  return masterSource;
}

/**
 * Lazily create + memoize the READ-ONLY registration source bound to the
 * SECOND spreadsheet (Form Pendaftaran, "Form Responses 1"). Never at import
 * time (next build / Vitest safe). Uses the same service-account auth as the
 * master. Throws a clear error when REGISTRATION_SPREADSHEET_KEY is unset.
 */
let registrationSource: RegistrationSource | null = null;
export function getRegistrationSource(): RegistrationSource {
  if (!registrationSource) {
    const key = process.env.REGISTRATION_SPREADSHEET_KEY ?? "";
    if (!key) {
      throw new Error("REGISTRATION_SPREADSHEET_KEY is not set in env (local: .env.local).");
    }
    registrationSource = createRegistrationSource(key);
  }
  return registrationSource;
}

/** Default audit sink for route handlers (tests inject their own). */
export const getDefaultAuditLog = (): AuditLog => defaultAuditLog;

/** Extract a request-lite from a NextRequest-like object for auth helpers. */
export function asRequestLite(cookies: { get(name: string): unknown }, url?: string) {
  return { cookies: cookies as { get(name: string): { value?: string } | undefined }, url };
}