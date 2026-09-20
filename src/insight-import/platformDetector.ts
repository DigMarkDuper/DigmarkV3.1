/**
 * Insight File Upload — platform detector.
 *
 * Classifies parsed files as Instagram or TikTok from, in order of preference:
 *   1. structural signals (each `ParsedInsightFile` exposes its shape),
 *   2. header/title keywords,
 *   3. filename as the LAST fallback.
 *
 * Detection is confident (returns a decisive platform when signals agree) or
 * ambiguous (two-armed) — callers then ask the user to pick manually. The
 * registration is extensible: fututre platforms add a `Detector` entry.
 */

import { headersContain } from "./columnMapper";
import type { ParsedInsightFile } from "./fileParser";

export type Platform = "Instagram" | "TikTok";

export type Detection = {
  /** Settled platform, or null when ambiguous/unknown. */
  platform: Platform | null;
  /** True when signals were strong enough to auto-settle. */
  confident: boolean;
  /** Human-readable reasons (for validation items). */
  reasons: string[];
};

/** Signals for a platform-specific alert built from one parsed file. */
interface FileSignal {
  instagram: boolean;
  tiktok: boolean;
  reason: string;
}

/**
 * Per-file structural header signals. Extensible — add new rules here for
 * future export formats or platforms.
 */
function signalForFile(f: ParsedInsightFile): FileSignal {
  const h = f.headers;
  if (f.kind === "instagram-per-metric") {
    return { instagram: true, tiktok: false, reason: `Instagram per-metric file (title: ${f.title ?? "?"})` };
  }
  if (h[0] === "date" && h[1] === "primary" && h.length === 2) {
    return { instagram: true, tiktok: false, reason: "Instagram-style Date,Primary rows" };
  }
  const hasTtOverview =
    headersContain(h, "VIEW") &&
    (headersContain(h, "LIKES") || headersContain(h, "COMMENTS") || headersContain(h, "SHARES"));
  const hasProfileViews = h.some((x) => x.includes("profile view"));
  if (hasTtOverview || (h.length >= 2 && hasProfileViews && headersContain(h, "VIEW"))) {
    return { tiktok: true, instagram: false, reason: "TikTok Overview headers (views + likes/comments/shares)" };
  }
  if (headersContain(h, "FOLLOWER") && h.some((x) => x.includes("difference in followers"))) {
    return { tiktok: true, instagram: false, reason: "TikTok FollowerHistory (difference in followers)" };
  }
  return { instagram: false, tiktok: false, reason: "No decisive header signal" };
}

/** Drill down to a single settled platform across files, or null when split. */
function settle(signals: FileSignal[]): Detection {
  const ig = signals.filter((s) => s.instagram);
  const tt = signals.filter((s) => s.tiktok);
  const reasons = signals.map((s) => s.reason);
  if (ig.length > 0 && tt.length === 0) {
    return { platform: "Instagram", confident: true, reasons };
  }
  if (tt.length > 0 && ig.length === 0) {
    return { platform: "TikTok", confident: true, reasons };
  }
  if (ig.length > 0 && tt.length > 0) {
    return { platform: null, confident: false, reasons: [...reasons, "Conflicting platform signals."] };
  }
  return { platform: null, confident: false, reasons };
}

/** Last-resort filename heuristic (low confidence). */
function filenameSignal(names: string[]): FileSignal | null {
  const joined = names.join(" ").toLowerCase();
  if (/tiktok/.test(joined)) {
    return { tiktok: true, instagram: false, reason: "Filename suggests TikTok" };
  }
  if (/instagram|meta|facebook/.test(joined)) {
    return { instagram: true, tiktok: false, reason: "Filename suggests Instagram" };
  }
  return null;
}

/**
 * Detect the platform from parsed files (+ their filenames). Returns a settled
 * platform or null (ambiguous/unknown). `platform` regions are type-checked so
 * a caller-provided manual override type-checks as a `Platform`.
 */
export function detectPlatform(files: ParsedInsightFile[]): Detection {
  if (!files.length) {
    return { platform: null, confident: false, reasons: ["No files provided."] };
  }
  const signals = files.map(signalForFile);
  const structural = settle(signals);
  if (structural.confident) {
    return structural;
  }
  // Structural signals were split or unknown — try ambiguous-aware filename.
  const fn = filenameSignal(files.map((f) => f.filename));
  if (fn) {
    const merged = settle([...signals, fn]);
    return { ...merged, confident: merged.platform !== null };
  }
  return { platform: null, confident: false, reasons: structural.reasons };
}

/** True when a manual override is a valid platform label (case-insensitive). */
export function isPlatform(v: unknown): boolean {
  return v === "Instagram" || v === "TikTok" || v === "instagram" || v === "tiktok";
}

/** Normalize a manual override to the canonical title-case label, or null. */
export function normalizePlatform(v: unknown): Platform | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "instagram") return "Instagram";
  if (s === "tiktok") return "TikTok";
  return null;
}