/**
 * DigMark shared core — the SINGLE canonical import surface.
 *
 * Re-exports the pure, framework-free business-logic modules so BOTH the
 * DigMark app and (future) Tarjo import ONE barrel and therefore get
 * bit-identical numbers. Purely ADDITIVE: nothing is moved or changed, and
 * no existing import path is broken.
 *
 * Modules are exported as NAMESPACES (`metrics.funnel(...)`, `waAdmin.closingCount(...)`)
 * because several modules legitimately share export names (e.g. `statusCol`,
 * `funnel`, `normalizePhone`, `isDone`); namespace re-exports avoid collisions
 * while preserving every symbol.
 *
 * The two canonical WA closing helpers are additionally available flat, since
 * they are unique to this entire core:
 *   - resolveWaStatusCol(rows)  -> the single status-column resolver
 *   - isClosingStatus(value)    -> the single "closing" predicate
 */

export * as helpers from "@/server/utils/helpers";
export * as metrics from "@/server/metrics/metrics";

export * as sosmed from "@/workspaces/sosmed";
export * as insight from "@/workspaces/insight";
export * as waAdmin from "@/workspaces/waAdmin";
export * as registration from "@/workspaces/registration";
export * as crm from "@/workspaces/crm";
export * as dm from "@/workspaces/dm";
export * as ads from "@/workspaces/ads";
export * as interview from "@/workspaces/interview";
export * as website from "@/workspaces/website";

export { isClosingStatus, resolveWaStatusCol } from "@/server/utils/helpers";