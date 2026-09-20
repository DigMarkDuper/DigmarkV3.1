/**
 * Insight upload — PURE client-side helpers for the "Upload Insight" card.
 *
 * No React, no I/O on the main paths (file byte-reading is the one async I/O,
 * exposed as `fileToBase64`). Everything else is payload/validation/response
 * mapping that is unit-testable, mirroring the waAdminForm.ts pattern.
 *
 * Contract (backend POST /api/insight/import):
 *   body: { files:[{name, contentB64}], platform?, confirm, mode:"new"|"all" }
 *   - preview  (confirm=false): { ok, platform, platformDetected, rowCount,
 *       newRows, potentialDuplicates, preview, validation:{ok,items,blockReasons},
 *       warnings }
 *       * platformDetected === false -> UI shows a manual platform Select and
 *         re-runs the preview with an explicit `platform`.
 *   - confirm  (confirm=true):  { ok, platform, rowsProcessed, rowsImported,
 *       duplicatesSkipped, warnings[, message] }
 *   - blocking validation (400): { ok:false, platform, rowCount, blockReasons,
 *       validation, platformDetected }
 *   - genuine error (400/4xx):   { error:{ code, message, status } }
 *
 * NOTE on `skipDuplicates` vs `mode`: the spec's draft referenced
 * skipDuplicates:true/false, but the real backend uses mode:"new"|"all". This
 * card deliberately POSTs `mode` — the value the backend accepts.
 */

/** One uploaded file (bytes base64'd client-side). */
export interface InsightPayloadFile {
  name: string;
  contentB64: string;
}

export interface InsightImportBody {
  files: InsightPayloadFile[];
  /** Optional manual platform override (sent when the user picks one). */
  platform?: string;
  /** confirm=false preview (default); confirm=true writes. */
  confirm: boolean;
  /** 'new' (default) imports only new rows; 'all' also imports duplicates. */
  mode: "new" | "all";
}

/** A normalized schema row (values are real numbers / D/M/YYYY strings). */
export interface NormalizedRow {
  TANGGAL: string;
  PLATFORM: string;
  VIEW: number;
  REACH: number;
  "CONTENT INTERACTION": number;
  "PROFILE VISIT": number;
  "LINK CLICKS": number;
  FOLLOWER: number;
}

export type ValidationLevel = "ok" | "warn" | "error";

export interface ValidationItem {
  level: ValidationLevel;
  key: string;
  label: string;
  detail: string;
}

export interface ValidationSummary {
  ok: boolean;
  items: ValidationItem[];
  blockReasons: string[];
}

/** Preview 200 payload (platformDetected drives the manual-Select fallback). */
export interface PreviewData {
  ok: boolean;
  platform: string | null;
  platformDetected: boolean;
  rowCount: number;
  newRows: NormalizedRow[];
  potentialDuplicates: NormalizedRow[];
  preview: NormalizedRow[];
  validation: ValidationSummary;
  warnings: string[];
}

/** Confirm=true result summary. */
export interface ConfirmData {
  ok: boolean;
  platform?: string;
  rowsProcessed: number;
  rowsImported: number;
  duplicatesSkipped: number;
  warnings: string[];
  message?: string;
}

/** A genuine server ApiError body: { error:{ code, message, status } }. */
export interface ErrorBody {
  error?: { code?: string; message?: string; status?: number };
}

/** Wire result: HTTP status + parsed JSON (any status), never thrown on 4xx. */
export interface WireResponse {
  status: number;
  payload: unknown;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXT = new Set([".csv", ".xlsx"]);

/** Client-side file gate: extension + size. Returns a reason or null when OK. */
export function validateFileMeta(name: string, size: number): string | null {
  const lower = name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (!ALLOWED_EXT.has(ext)) {
    return `File "${name}" tidak valid (bukan .csv/.xlsx atau lebih 10MB).`;
  }
  if (size > MAX_FILE_BYTES) {
    return `File "${name}" tidak valid (bukan .csv/.xlsx atau lebih 10MB).`;
  }
  return null;
}

export interface StagedMeta {
  name: string;
  size: number;
}

/** Validate a batch client-side, keeping the valid ones and reporting rejects. */
export function validateClientFiles(
  files: StagedMeta[],
): { valid: StagedMeta[]; rejected: string[] } {
  const valid: StagedMeta[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    const reason = validateFileMeta(f.name, f.size);
    if (reason) rejected.push(reason);
    else valid.push(f);
  }
  return { valid, rejected };
}

/**
 * Assemble the request body. `mode` is the backend's duplicate toggle
 * (mode:"new" = import new rows only, mode:"all" = also import duplicates).
 * `platform` is included only when the operator chose it manually.
 */
export function buildImportBody(
  files: InsightPayloadFile[],
  opts: { platform?: string; confirm: boolean; mode: "new" | "all" },
): InsightImportBody {
  const body: InsightImportBody = {
    files,
    confirm: opts.confirm,
    mode: opts.mode,
  };
  if (typeof opts.platform === "string" && opts.platform.length > 0) {
    body.platform = opts.platform;
  }
  return body;
}

/** Send a file's raw bytes as base64 (raw bytes preserved for UTF-16). */
export async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000; // 32 KiB — avoids stack overflow in String.fromCharCode
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, Math.min(i + CHUNK, buf.length)));
  }
  return btoa(bin);
}

/**
 * POST the import body. Unlike `postJson`, the full JSON body is returned on
 * ANY HTTP status (2xx AND 4xx/5xx), because this API's blocking-validation
 * and error contracts both live in the JSON body. A transport-level failure
 * (server/network down) throws a typed error the card maps to connectivity copy.
 */
export async function postInsightImport(body: InsightImportBody): Promise<WireResponse> {
  let res: Response;
  try {
    res = await fetch("/api/insight/import", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new InsightConnectError();
  }
  let payload: unknown = {};
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body — keep the empty payload; caller falls back to status copy.
  }
  return { status: res.status, payload };
}

/** Thrown when the POST cannot reach the server (network/timeout). */
export class InsightConnectError extends Error {
  constructor() {
    super("Tidak bisa terhubung ke server. Kanalis lagi nanti.");
    this.name = "InsightConnectError";
  }
}

/** True when a payload carries a genuine ApiError body ({ error: {...} }). */
export function isErrorBody(payload: unknown): payload is ErrorBody {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as ErrorBody).error === "object" &&
    (payload as ErrorBody).error !== null
  );
}