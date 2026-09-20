/**
 * SectionHead — homepage big section head (UI_DESIGN_SPEC.md §C.20):
 * "Explore Your Workspace" / "Quick Insight" → 1.9rem/800 title + muted sub.
 */
import { type ReactNode } from "react";

export interface SectionHeadProps {
  title: ReactNode;
  sub?: ReactNode;
  id?: string;
}

export function SectionHead({ title, sub, id }: SectionHeadProps) {
  return (
    <div id={id}>
      <h2 className="text-[1.9rem] font-extrabold tracking-tight text-ink">{title}</h2>
      {sub ? <p className="mt-2 text-[1rem] text-muted">{sub}</p> : null}
    </div>
  );
}