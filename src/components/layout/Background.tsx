/**
 * Background — decorative full-page glow layer (UI_DESIGN_SPEC.md §B.5).
 *
 * Renders the V3 layered radial-gradient glows (blue top-left, yellow
 * top-right over a 165deg linear base) as a fixed, non-interactive element.
 * Painted once at root by app/layout.tsx. Kept a separate element (rather
 * than only a body background) so opaque content — e.g. DataTable wrappers
 * with sticky headers + backdrop-blur — still reads the glow around it.
 */
export function Background() {
  return <div className="dm-bg-layer" aria-hidden="true" />;
}