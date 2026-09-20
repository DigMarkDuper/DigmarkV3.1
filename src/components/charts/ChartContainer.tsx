/**
 * ChartContainer — stable visual frame for charts (UI_DESIGN_SPEC.md §C.17).
 * The body stays empty until a charting library is wired in Phase E; the frame
 * (glass surface, radius 18, blur 8/140%, fixed height) is stable so the layout
 * does not shift when charts land. Renders an EmptyState when no data.
 */
import { EmptyState } from "@/components/sections/EmptyState";

export interface ChartContainerProps {
  label?: string;
  heightClass?: string;
  data?: unknown[];
  children?: React.ReactNode;
}

export function ChartContainer({
  label,
  heightClass = "h-72",
  data,
  children,
}: ChartContainerProps) {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-2 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]">
      {label ? <span className="mb-1 block text-[0.82rem] font-semibold text-muted">{label}</span> : null}
      {data && data.length > 0 && children ? (
        <div className={heightClass}>{children}</div>
      ) : (
        <EmptyState title="Belum ada data untuk chart ini." />
      )}
    </div>
  );
}