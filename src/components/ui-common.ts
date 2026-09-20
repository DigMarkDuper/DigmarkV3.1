/**
 * Shared UI constants + pure display helpers (UI_DESIGN_SPEC.md §A.1).
 *
 * This is the single JS mirror of the Tailwind tokens in app/globals.css.
 * Components import NAMED constants here instead of hard-coding magic hex/px,
 * and these constants are also used for inline styles / gradients that
 * Tailwind utilities cannot express (e.g. the yellow radial ball). No magic
 * numbers in components.
 */

// --- Palette (spec B.2) [PRESERVED] ---
export const PALETTE = {
  brand: "#0058A3",
  brandHover: "#0A6FBF",
  accent: "#FFDB00",
  accentDeep: "#f4c400",
  ink: "#102A43",
  muted: "#5B6B7E",
  grid: "#E6EBF2",
  success: "#22A06B",
  warning: "#E8930C",
  danger: "#D64550",
  pink: "#D95FA8",
  surface: "rgba(255,255,255,0.72)",
  surfaceStrong: "rgba(255,255,255,0.85)",
  border: "rgba(255,255,255,0.9)",
  divider: "rgba(0,88,163,0.12)",
  inkOnBrand: "#FFFFFF",
  // --- Categorical multi-hue family (UI redesign §3.1, additive) ---
  // Distinct pastel hues (AA-on-ink) for categorical charts: cycle per category,
  // never a sequential single-hue ramp. Validated on wa-admin Tag Asal treemap.
  catBlue: "#BFD9F0",
  catGreen: "#B5DFC7",
  catPurple: "#cfc6f0",
  catOrange: "#F2CDA2",
  catTeal: "#A9D9E2",
  catPink: "#EFC7DC",
  catSlate: "#C6D3DF",
  catSand: "#E0C2A8",
  catLavender: "#D4BFD9",
  catMint: "#B8D8C1",
} as const;

// --- Radius scale (spec B.4) ---
export const RADII = {
  sm: "10px",
  sm6: "12px",
  md: "14px",
  md16: "16px",
  md18: "18px",
  lg: "20px",
  panel: "22px",
  pill: "9999px",
} as const;

// --- Shadow scale (spec B.4) ---
export const SHADOWS = {
  xs: "0 3px 10px rgba(0,88,163,0.08)",
  xsB6: "0 4px 12px rgba(0,88,163,0.10)",
  base: "0 8px 22px rgba(0,88,163,0.10)",
  hover: "0 18px 38px rgba(0,88,163,0.20)",
  lift: "0 20px 45px rgba(0,88,163,0.18)",
  cta: "0 6px 18px rgba(0,88,163,0.25)",
  ctaHover: "0 10px 24px rgba(0,88,163,0.32)",
  panel: "0 18px 40px rgba(0,88,163,0.16)",
  mono: "0 8px 20px rgba(0,88,163,0.30)",
  arrow: "0 2px 6px rgba(255,219,0,0.35)",
  ball: "0 10px 24px rgba(240,200,0,0.40)",
} as const;

// --- Typography scale (spec B.1), documented for reference ---
export const TYPE_SCALE = {
  displayH1: "clamp(2.1rem,4.6vw,3.4rem)",
  displayH1Lh: "1.06",
  h1: "clamp(1.7rem,3.4vw,2.5rem)",
  h1Lh: "1.1",
  h2: "1.9rem",
  h3: "1.18rem",
  h4: "1.08rem",
  body: "15px",
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