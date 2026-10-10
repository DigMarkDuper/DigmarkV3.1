/**
 * Shared UI constants + pure display helpers (UI_DESIGN_SPEC.md §A.1).
 *
 * This is the single JS mirror of the Tailwind tokens in app/globals.css.
 * Components import NAMED constants here instead of hard-coding magic hex/px,
 * and these constants are also used for inline styles / gradients that
 * Tailwind utilities cannot express (e.g. the yellow radial ball). No magic
 * numbers in components.
 */

// --- Palette (spec B.2) — Sneat mirror of the --dm-* tokens in app/globals.css ---
export const PALETTE = {
  brand: "#3E7BFA",
  brandHover: "#2E7AF6",
  accent: "#E8A317",
  // Deeper amber: used only as a gradient midpoint + chart-series graphic
  // (never as text), so it is tuned for >=3:1 against white, not 4.5:1.
  accentDeep: "#B87A0A",
  ink: "#22303E",
  muted: "#646E78",
  grid: "#E4E6E8",
  success: "#2DCE89",
  warning: "#FFB547",
  danger: "#EA4253",
  pink: "#C2559B",
  surface: "#FFFFFF",
  surfaceStrong: "#FFFFFF",
  border: "#E2E8F0",
  divider: "#EEF2F6",
  inkOnBrand: "#FFFFFF",
  // --- Categorical multi-hue family (UI redesign §3.1, additive) ---
  // Distinct mid-tone hues for categorical charts: cycle per category, never a
  // sequential single-hue ramp. Tuned on opaque white so each fill is separable
  // from the card (>=2:1) while `PALETTE.ink` labels drawn on top stay AA (>=4.5:1).
  // Validated on wa-admin Tag Asal treemap.
  catBlue: "#679EDB",
  catGreen: "#59AA81",
  catPurple: "#AE8ADE",
  catOrange: "#D08C38",
  catTeal: "#67A4AD",
  catPink: "#DC7CA8",
  catSlate: "#8D9CAD",
  catSand: "#B69477",
  catLavender: "#C97FD6",
  catMint: "#44AE66",
} as const;

// --- Brand blue heat ramp (single source for map fill + legend gradient) ---
// Lightest (#catBlue) -> deepest (PALETTE.brand). Both IndonesiaMap's heat fill
// and ProspectMapSection's legend gradient derive from this so they never drift.
export const BRAND_RAMP = [
  "#DCE9F8",
  "#A9C7EE",
  "#6FA0DE",
  "#3E7BFA", // PALETTE.brand
  "#2E5FC4",
  "#1D3F86",
] as const;

// --- Radius scale (spec B.4) — mirrors --dm-radius-* in app/globals.css ---
export const RADII = {
  sm: "4px",
  sm6: "6px",
  md: "8px",
  md16: "8px",
  md18: "10px",
  lg: "10px",
  panel: "12px",
  pill: "9999px",
} as const;

// --- Shadow scale (spec B.4) — neutral gray lift, mirrors --dm-shadow-* ---
export const SHADOWS = {
  xs: "0 1px 2px rgba(34,48,62,0.06)",
  xsB6: "0 1px 2px rgba(34,48,62,0.06)",
  base: "0 1px 3px rgba(34,48,62,0.10)",
  hover: "0 3px 6px rgba(34,48,62,0.10)",
  lift: "0 4px 8px rgba(34,48,62,0.10)",
  cta: "0 1px 2px rgba(62,123,250,0.24)",
  ctaHover: "0 2px 4px rgba(62,123,250,0.28)",
  panel: "0 3px 8px rgba(34,48,62,0.08)",
  mono: "0 1px 2px rgba(34,48,62,0.12)",
  arrow: "0 1px 2px rgba(120,83,0,0.18)",
  ball: "0 1px 3px rgba(120,83,0,0.22)",
} as const;

// --- Typography scale (spec B.1), documented for reference (dense Sneat sizing) ---
export const TYPE_SCALE = {
  displayH1: "clamp(2.1rem,4.6vw,3.4rem)",
  displayH1Lh: "1.06",
  h1: "clamp(1.7rem,3.4vw,2.5rem)",
  h1Lh: "1.1",
  h2: "1.5rem",
  h3: "1.125rem",
  h4: "0.9375rem",
  body: "14px",
} as const;

// --- Responsive breakpoints (spec B.9) ---
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1440 } as const;

/* ---------------------------------------------------------------------------
 * Pure display helpers (spec §C.7 / D.2 — formatting mirrors V3 exactly)
 * ------------------------------------------------------------------------- */

/** Integer/large count with dot grouping (V3 f"{v:,.0f}".replace(",",".")). */
export function formatCount(value: number): string {
  if (Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("id-ID");
}

/** Percentage with one decimal, or an em-dash when there are no leads. */
export function formatPercent(pct: number, hasBase: boolean): string {
  return hasBase ? `${pct.toFixed(1)}%` : "—";
}

/** ROAS as "x" multiple with one decimal, or an em-dash when no spend. */
export function formatRoas(roas: number, hasSpend: boolean): string {
  return hasSpend ? `${roas.toFixed(1)}x` : "—";
}

/** Rupiah with Rp prefix + dot grouping (V3 ui.components.rupiah). */
export function formatRupiah(value: number): string {
  if (Number.isNaN(value)) return "—";
  return `Rp ${value.toLocaleString("id-ID")}`;
}