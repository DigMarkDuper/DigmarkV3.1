/**
 * Insight File Upload — API controller (POST /api/insight/import).
 *
 * Two-step validate-then-confirm:
 *   - confirm=false (default): parse -> detect platform -> transform -> validate
 *     -> dedupe against live INSIGHT rows -> return preview + counts. NO WRITE.
 *   - confirm=true: run the SAME pipeline, re-read dedupe at confirm time, then
 *     append the user's chosen set (new rows, or all including duplicates) via
 *     the source's appendRows -> audit-log -> return summary.
 *
 * On any blocking validation error it returns 4xx with NO write (transaction-
 * like). Never deletes/overwrites existing rows. Never exposes raw tracebacks —
 * error detail is constrained to short, user-safe messages (Indonesian).
 *
 * Reuses getMasterSource() upstream (single production connection); this
 * controller only touches the injected `source`.
 */

import { requireRole, type Session } from "@/lib/auth";
import { apiError, ErrorCodes, toErrorResponse, okJson } from "@/lib/errors";
import type { SheetSource } from "@/server/adapter/source";
import type { AuditLog } from "@/lib/audit";
import { record } from "@/lib/audit";
import { parseInsightFile, type ParsedInsightFile } from "@/insight-import/fileParser";
import { detectPlatform, normalizePlatform, type Platform } from "@/insight-import/platformDetector";
import { transformInsight, buildInsightCells, type InsightSchemaRow } from "@/insight-import/insightTransformer";
import { validateInsight, type ValidationSummary } from "@/insight-import/insightValidator";
import { dedupeInsight } from "@/insight-import/insightDedupe";

/** One uploaded file: base64 of raw bytes (preserves UTF-16). */
export interface InsightImportFile {
  name: string;
  contentB64: string;
}

export interface InsightImportBody {
  files: InsightImportFile[];
  /** Optional manual platform override (used when detection is ambiguous/null). */
  platform?: unknown;
  /** confirm=false preview (default); confirm=true writes. */
  confirm: boolean;
  /** 'new' (default) imports only new rows; 'all' also imports duplicates. */
  mode?: "new" | "all";
}

export interface InsightImportResult {
  ok: boolean;
  /** Settled/manual platform, or null when detection is deferred to the UI. */
  platform: Platform | null;
  /**
   * False when the platform could NOT be resolved (nested detection null AND no
   * manual override). The UI then shows a manual platform Select and re-runs the
   * preview with an explicit `platform` (spec §5.4). True in every other case.
   */
  platformDetected: boolean;
  rowCount: number;
  newRows: InsightSchemaRow[];
  potentialDuplicates: InsightSchemaRow[];
  /** Previews: first ~50 canonical rows, schema-ordered, for the UI card. */
  preview: InsightSchemaRow[];
  validation: ValidationSummary;
  warnings: string[];
}

const MAX_PREVIEW = 50;

/** Cast a parser error into a user-safe 400. */
function userSafeError(err: unknown): never {
  if (err instanceof Error) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, err.message);
  }
  throw apiError(ErrorCodes.VALIDATION_FAILED, "File tidak dapat dibaca.");
}

/**
 * Full parse -> detect -> transform -> validate pipeline. Shared by preview
 * (no write) and confirm (write). Returns everything the caller needs.
 */
export async function buildInsightImport(
  files: ParsedInsightFile[],
  manualPlatform: unknown,
): Promise<InsightImportResult> {
  const detection = detectPlatform(files);

  // Manual override wins when detection is null OR not confident.
  let platform: Platform | null;
  const manual = normalizePlatform(manualPlatform);
  if (manual && (detection.platform === null || !detection.confident)) {
    platform = manual;
  } else if (detection.platform === null) {
    // No decisive signal and no manual override: DEFER to the UI instead of
    // throwing here. The controller turns this into platformDetected:false on
    // the preview path (the card shows a manual platform Select) and only
    // rejects on confirm, where a platform is mandatory.
    platform = null;
  } else {
    platform = detection.platform;
  }

  if (platform === null) {
    return {
      ok: true,
      platform: null,
      platformDetected: false,
      rowCount: 0,
      newRows: [],
      potentialDuplicates: [],
      preview: [],
      validation: { ok: true, items: [], blockReasons: [], rowCount: 0 },
      warnings: [],
    };
  }

  const { rows, warnings } = transformInsight(files, platform);
  const detectedHeaders = collectHeaders(files);
  const validation = validateInsight(files, rows, platform, detectedHeaders);

  return {
    ok: validation.ok,
    platform,
    platformDetected: true,
    rowCount: rows.length,
    newRows: rows,
    potentialDuplicates: [],
    preview: rows.slice(0, MAX_PREVIEW),
    validation,
    warnings,
  };
}

/** Union of all normalized headers across the files (for validator). */
function collectHeaders(files: ParsedInsightFile[]): string[] {
  const seen = new Set<string>();
  for (const f of files) {
    for (const h of f.headers) {
      seen.add(h);
    }
    if (f.kind === "instagram-per-metric" && f.title) {
      seen.add(f.title.toLowerCase().replace(/\s+/g, " "));
    }
  }
  return Array.from(seen);
}

/** Decode + parse the uploaded payload into ParsedInsightFile[] (safe errors). */
function parseFiles(files: InsightImportFile[]): ParsedInsightFile[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw apiError(ErrorCodes.VALIDATION_FAILED, "Tidak ada file yang diunggah.");
  }
  return files.map((f) => {
    if (!f || typeof f.name !== "string" || typeof f.contentB64 !== "string") {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Payload file tidak valid: setiap file butuh name dan contentB64.");
    }
    try {
      const buffer = Buffer.from(f.contentB64, "base64");
      return parseInsightFile(f.name, buffer);
    } catch (err) {
      userSafeError(err);
    }
  });
}

/**
 * POST /api/insight/import — editor.
 */
export async function insightImportController(
  session: Session | null,
  source: SheetSource,
  body: Partial<InsightImportBody> | null | undefined,
  auditLog: AuditLog,
): Promise<Response> {
  try {
    requireRole(session, "editor");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw apiError(ErrorCodes.VALIDATION_FAILED, "Request body harus berupa objek JSON.");
    }
    const confirm = body.confirm === true;
    const mode = body.mode === "all" ? "all" : "new";
    const parsed = parseFiles(body.files ?? []);
    const built = await buildInsightImport(parsed, body.platform);

    // Platform could NOT be resolved and no manual override was given.
    // - preview: DEFER to the UI (return platformDetected:false in a 200 so the
    //   card can render the manual platform Select; spec §5.4). No rows to show.
    // - confirm: this cannot be deferred — a platform is required to import.
    if (!built.platformDetected) {
      if (confirm) {
        throw apiError(
          ErrorCodes.VALIDATION_FAILED,
          "Platform tidak dapat dideteksi dari file. Pilih platform (Instagram/TikTok) secara manual.",
        );
      }
      return okJson({ ...built, newRows: [], potentialDuplicates: [], preview: [] });
    }

    // Transaction-like: any blocking validation error -> 400, NO write.
    if (!built.validation.ok) {
      return okJson(
        {
          ok: false,
          platform: built.platform,
          rowCount: built.rowCount,
          blockReasons: built.validation.blockReasons,
          validation: built.validation,
          platformDetected: built.platformDetected,
        },
        400,
      );
    }

    const existing = await source.fetchTable("insight");
    const { newRows, potentialDuplicates } = dedupeInsight(existing, built.newRows);

    if (!confirm) {
      const result: InsightImportResult = {
        ...built,
        rowCount: newRows.length,
        newRows,
        potentialDuplicates,
        preview: newRows.slice(0, MAX_PREVIEW),
      };
      return okJson(result);
    }

    // confirm=true: pick the user's set and append through the source.
    const toImport = mode === "all" ? [...newRows, ...potentialDuplicates] : newRows;
    if (toImport.length === 0) {
      return okJson({
        ok: true,
        platform: built.platform,
        rowsProcessed: 0,
        rowsImported: 0,
        duplicatesSkipped: 0,
        warnings: built.warnings,
        message: "Tidak ada baris baru untuk diimpor.",
      });
    }

    const cells = buildInsightCells(toImport);
    const res = await source.appendRows("insight", cells);
    if (!res.ok) {
      throw apiError(
        ErrorCodes.ADAPTER_FAILED,
        "Gagal menulis ke Google Sheets Insight.",
        { code: res.code, message: res.message },
      );
    }

    const duplicatesSkipped = mode === "new" ? potentialDuplicates.length : 0;
    record(auditLog, {
      actor: session!.identity,
      operation: "import",
      tableKey: "insight",
      targetResource: `insight (platform: ${built.platform}, mode: ${mode})`,
      success: true,
      summary: `Imported ${newRows.length} new row(s) (${duplicatesSkipped} duplicate(s) skipped).`,
    });

    return okJson({
      ok: true,
      platform: built.platform,
      rowsProcessed: toImport.length,
      rowsImported: newRows.length,
      duplicatesSkipped,
      warnings: built.warnings,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}