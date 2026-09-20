/**
 * Insight File Upload — validation summary.
 *
 * Produces a non-blocking vs blocking validation report for a transformed
 * import set, mirroring the spec's pre-import checklist:
 *   - platform detected (block if the caller couldn't settle a platform)
 *   - dates parsed (block if a required date cannot be resolved)
 *   - primary VIEW metric present (block if absent)
 *   - TikTok Likes/Comments/Shares (block for TikTok when none present AND no
 *     explicit content-interaction metric — without them CI can't be computed)
 *   - optional REACH / PROFILE VISIT / LINK CLICKS / FOLLOWER (warn-only)
 *
 * `blockReasons` is non-empty iff `ok` is false. Items carry a stable `key`
 * (for UI icons/list rendering), a human `label`, and a message `detail`.
 */

import type { InsightSchemaRow } from "./insightTransformer";
import type { ParsedInsightFile } from "./fileParser";
import { mapHeaderToMetric } from "./columnMapper";
import type { Platform } from "./platformDetector";

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
  rowCount: number;
}

/** Whether a schema row has usable content in the given metric (non-zero). */
export function hasMetric(
  row: InsightSchemaRow,
  metric: "VIEW" | "REACH" | "CONTENT INTERACTION" | "PROFILE VISIT" | "LINK CLICKS" | "FOLLOWER",
): boolean {
  const v = row[metric];
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) && n !== 0;
}

/**
 * Build the validation summary. `files` are used to detect which source
 * metrics actually existed, so we can warn about optional-metrics availability
 * independent of transformed (possibly 0) values.
 */
export function validateInsight(
  files: ParsedInsightFile[],
  rows: InsightSchemaRow[],
  platform: Platform,
  detectedHeaders: string[] = [],
): ValidationSummary {
  const items: ValidationItem[] = [];
  const blockReasons: string[] = [];

  // Which canonical metrics are PRESENT in any file (headers + IG titles)?
  const presentMetrics = new Set<string>();
  for (const h of detectedHeaders) {
    const m = mapHeaderToMetric(h);
    if (m) presentMetrics.add(m);
  }
  for (const f of files) {
    for (const h of f.headers) {
      const m = mapHeaderToMetric(h);
      if (m) presentMetrics.add(m);
    }
    if (f.kind === "instagram-per-metric" && f.title) {
      const m = mapHeaderToMetric(f.title);
      if (m) presentMetrics.add(m);
    }
  }
  const available = (metric: string): boolean => presentMetrics.has(metric);

  // Platform.
  if (platform !== "Instagram" && platform !== "TikTok") {
    items.push({ level: "error", key: "platform", label: "Platform", detail: "Platform tidak dapat dideteksi. Pilih manual." });
    blockReasons.push("Platform tidak dapat dideteksi.");
  } else {
    items.push({ level: "ok", key: "platform", label: "Platform", detail: `Platform: ${platform}` });
  }

  // Dates.
  const validDates = rows.filter((r) => r.TANGGAL !== "" && r.TANGGAL !== undefined).length;
  if (rows.length === 0) {
    items.push({ level: "error", key: "date", label: "Tanggal", detail: "Tidak ada baris data valid untuk diimpor." });
    blockReasons.push("Tidak ada baris data valid.");
  } else if (validDates === 0) {
    items.push({ level: "error", key: "date", label: "Tanggal", detail: "Tidak ada tanggal yang dapat diparsing." });
    blockReasons.push("Tanggal tidak dapat diparsing.");
  } else if (validDates < rows.length) {
    items.push({ level: "warn", key: "date", label: "Tanggal", detail: `${rows.length - validDates} baris tidak memiliki tanggal valid dan dilewati.` });
  } else {
    items.push({ level: "ok", key: "date", label: "Tanggal", detail: `${validDates} tanggal valid.` });
  }

  // Primary metric: VIEW.
  if (available("VIEW")) {
    const nonZero = rows.filter((r) => hasMetric(r, "VIEW")).length;
    items.push({
      level: nonZero === 0 ? "warn" : "ok",
      key: "views",
      label: "View",
      detail: nonZero === 0 ? "Kolom View ada tapi semua bernilai 0." : `Kolom View terdeteksi (${nonZero} baris > 0).`,
    });
  } else {
    items.push({ level: "error", key: "views", label: "View", detail: "Metrik utama View tidak ditemukan di file." });
    blockReasons.push("Kolom View tidak ditemukan.");
  }

  // TikTok: Likes/Comments/Shares (or an explicit content interaction).
  if (platform === "TikTok") {
    const hasCI = available("CONTENT_INTERACTION");
    const hasL = available("LIKES");
    const hasC = available("COMMENTS");
    const hasS = available("SHARES");
    if (hasCI) {
      items.push({ level: "ok", key: "interaction", label: "Content Interaction", detail: "Kolom Content Interaction tersedia." });
    } else if (hasL && hasC && hasS) {
      items.push({ level: "ok", key: "interaction", label: "Content Interaction", detail: "Dihitung dari Likes + Comments + Shares." });
    } else {
      const have = [hasL ? "Likes" : null, hasC ? "Comments" : null, hasS ? "Shares" : null].filter(Boolean).join(", ");
      items.push({ level: "error", key: "interaction", label: "Content Interaction", detail: `TikTok memerlukan Likes, Comments, dan Shares untuk menghitung interaksi (ditemukan: ${have || "tidak ada"}).` });
      blockReasons.push("Likes/Comments/Shares tidak lengkap (TikTok).");
    }
  } else {
    // Instagram: content interaction is optional (warn when absent).
    if (available("CONTENT_INTERACTION")) {
      items.push({ level: "ok", key: "interaction", label: "Content Interaction", detail: "Kolom Content Interaction tersedia." });
    } else {
      items.push({ level: "warn", key: "interaction", label: "Content Interaction", detail: "Content Interaction tidak tersedia (opsional)." });
    }
  }

  // Optional metrics (warn-only).
  const optional: Array<[string, string, string]> = [
    ["REACH", "reach", "Reach"],
    ["PROFILE_VISIT", "profile", "Profile Visit"],
    ["LINK_CLICKS", "links", "Link Clicks"],
    ["FOLLOWER", "follower", "Follower"],
  ];
  for (const [metric, key, label] of optional) {
    const present = available(metric);
    if (present) {
      items.push({ level: "ok", key, label, detail: `${label} tersedia.` });
    } else {
      items.push({ level: "warn", key, label, detail: `${label} tidak tersedia (disimpan 0).` });
    }
  }

  return {
    ok: blockReasons.length === 0,
    items,
    blockReasons,
    rowCount: rows.length,
  };
}