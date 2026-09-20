/**
 * MetricCard — one glass KPI tile (UI_DESIGN_SPEC.md §C.5).
 */
export interface MetricCardProps {
  icon?: string;
  label: string;
  /** Final formatted value string ("—" renders the empty/muted state). */
  value: string;
  /** Optional delta: positive -> success, negative -> danger, else muted. */
  delta?: number;
  deltaLabel?: string;
  /** Show a loading skeleton instead of a value. */
  loading?: boolean;
}

export function MetricCard({
  icon = "•",
  label,
  value,
  delta,
  deltaLabel = "vs last period",
  loading = false,
}: MetricCardProps) {
  return (
    <article
      className="dm-metric flex flex-col gap-1 rounded-[20px] border border-border bg-surface p-4 backdrop-blur-[10px] saturate-[140%] shadow-[var(--dm-shadow)] transition-all duration-200 hover:-translate-y-[2px] hover:bg-surface-strong hover:shadow-[var(--dm-shadow-hover)] motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-brand/10 to-brand/16 text-[1rem]">
          {icon}
        </span>
        <span className="text-[0.82rem] font-semibold text-muted">{label}</span>
      </div>
      {loading ? (
        <div aria-busy="true" className="mt-1 h-6 w-2/5 rounded bg-muted/20 animate-pulse" />
      ) : (
        <div className="mt-1 text-[1.6rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">
          {value}
        </div>
      )}
      {!loading && delta !== undefined ? (
        <div className="text-[0.82rem] font-semibold">
          <span className={delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}
          </span>{" "}
          <span className="text-muted">{deltaLabel}</span>
        </div>
      ) : null}
    </article>
  );
}