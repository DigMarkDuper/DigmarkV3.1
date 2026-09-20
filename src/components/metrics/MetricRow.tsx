/**
 * MetricRow — N MetricCards in a responsive auto-fit row (UI_DESIGN_SPEC.md §C.6).
 * 4-up lg, 2-up md, 1-up below.
 */
import { type ReactNode } from "react";

export function MetricRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">{children}</div>;
}