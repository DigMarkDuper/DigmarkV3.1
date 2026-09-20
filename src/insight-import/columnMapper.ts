/**
 * Insight File Upload — column mapper.
 *
 * Maps a normalized header (or Instagram per-metric title) to a canonical
 * metric via an extensible alias table. Headers are matched case-insensitively
 * with whitespace collapsed (see `normalizeHeader` in src/lib/validation).
 *
 * Canonical metrics follow the INSIGHT schema + the feature spec:
 *   VIEW, REACH, CONTENT_INTERACTION, PROFILE_VISIT, LINK_CLICKS, FOLLOWER,
 * and the three TikTok sub-metrics computed into CONTENT_INTERACTION:
 *   LIKES, COMMENTS, SHARES.
 *
 * Unknown aliases return null — the caller (transformer/validator) decides
 * whether a missing metric is a warn or a block.
 */

/** Canonical metrics that map onto the INSIGHT schema (or feed its TT calc). */
export type CanonicalMetric =
  | "VIEW"
  | "REACH"
  | "CONTENT_INTERACTION"
  | "PROFILE_VISIT"
  | "LINK_CLICKS"
  | "FOLLOWER"
  | "LIKES"
  | "COMMENTS"
  | "SHARES";

export const CANONICAL_METRICS: CanonicalMetric[] = [
  "VIEW",
  "REACH",
  "CONTENT_INTERACTION",
  "PROFILE_VISIT",
  "LINK_CLICKS",
  "FOLLOWER",
  "LIKES",
  "COMMENTS",
  "SHARES",
];

/**
 * The extensible alias table. Future export formats add new alias strings
 * (already-normalized: lowercase, trimmed, whitespace-collapsed). The mapper
 * normalizes input headers with the same rule before lookup.
 */
export const ALIASES: Record<CanonicalMetric, string[]> = {
  VIEW: ["views", "video views", "video views", "total views", "video views"],
  REACH: ["viewers", "reach", "unique viewers"],
  CONTENT_INTERACTION: ["content interactions", "content interaction", "interactions"],
  PROFILE_VISIT: ["profile views", "profile view", "profile visits", "visits", "facebook visits"],
  LINK_CLICKS: ["link clicks", "facebook link clicks", "link click"],
  FOLLOWER: ["follows", "followers", "follower", "facebook follows", "difference in followers from previous day", "new followers"],
  LIKES: ["likes", "like", "total likes"],
  COMMENTS: ["comments", "comment", "total comments"],
  SHARES: ["shares", "share", "total shares"],
};

/** A single registered alias (kept in one table for tooling/extensibility). */
interface AliasEntry {
  normalized: string;
  metric: CanonicalMetric;
}

const REGISTRY: AliasEntry[] = (Object.keys(ALIASES) as CanonicalMetric[]).flatMap((metric) =>
  ALIASES[metric].map((normalized) => ({ normalized, metric })),
);

/** Metric lookup index: normalized alias -> canonical metric. */
const BY_ALIAS = new Map<string, CanonicalMetric>();
for (const e of REGISTRY) {
  if (!BY_ALIAS.has(e.normalized)) {
    BY_ALIAS.set(e.normalized, e.metric);
  }
}

/**
 * Map a normalized header/title to a canonical metric, or null when unknown.
 * `value` is normalized here (lowercase + whitespace-collapsed) so callers can
 * pass either the exact header or a raw `Date`/`Users`-style title.
 */
export function mapHeaderToMetric(value: unknown): CanonicalMetric | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return BY_ALIAS.get(normalized) ?? null;
}

/** Register a new alias programmatically (extensible for future formats). */
export function registerAlias(metric: CanonicalMetric, normalizedAlias: string): void {
  const n = normalizedAlias.trim().toLowerCase().replace(/\s+/g, " ");
  if (n && !BY_ALIAS.has(n)) {
    BY_ALIAS.set(n, metric);
  }
}

/** Whether any of the given headers maps to a given metric. */
export function headersContain(headers: string[], metric: CanonicalMetric): boolean {
  return headers.some((h) => mapHeaderToMetric(h) === metric);
}