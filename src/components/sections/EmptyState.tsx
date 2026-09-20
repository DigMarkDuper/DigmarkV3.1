/**
 * EmptyState — friendly no-data zone (UI_DESIGN_SPEC.md §C.11).
 */
export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: string;
}

export function EmptyState({ title, hint, icon = "📭" }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="rounded-[16px] border border-dashed border-divider bg-white/60 px-6 py-16 text-center"
    >
      <div className="mx-auto flex flex-col items-center justify-center gap-3">
        <span aria-hidden className="text-[2.5rem]">{icon}</span>
        <p className="text-[1rem] font-semibold text-ink">{title}</p>
        {hint ? <p className="text-[0.86rem] text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}