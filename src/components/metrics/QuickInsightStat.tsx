/**
 * QuickInsightStat — homepage Quick Insight tile (UI_DESIGN_SPEC.md §C.7).
 */
export interface QuickInsightStatProps {
  label: string;
  /** Final formatted value ("—" for the empty state). */
  value: string;
  loading?: boolean;
}

export function QuickInsightStat({ label, value, loading = false }: QuickInsightStatProps) {
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4 backdrop-blur-[10px] saturate-[140%] shadow-[var(--dm-shadow)]">
      <div className="text-[0.8rem] font-semibold text-muted">{label}</div>
      {loading ? (
        <div aria-busy="true" className="mt-1 h-8 w-2/4 rounded bg-muted/20 animate-pulse" />
      ) : (
        <div className="mt-1 text-[1.5rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
          {value}
        </div>
      )}
    </div>
  );
}