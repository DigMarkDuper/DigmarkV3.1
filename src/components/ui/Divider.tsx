/**
 * Divider — section rule (UI_DESIGN_SPEC.md §C.19): 1px rgba(0,88,163,.12) top
 * border with my-8 vertical rhythm. Stateless.
 */
export function Divider() {
  return <hr className="my-8 border-b-0 border-t border-divider" />;
}