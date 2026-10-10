/**
 * HeroVisualPanel — the glass command-center card (UI_DESIGN_SPEC.md §C.3,
 * right column of the Overview hero). Non-interactive.
 *
 * Monogram → two metric chips bridged by a yellow arrow → footer status + the
 * 70px yellow module-count ball. closing/roas are pre-formatted display
 * strings (e.g. "12" / "4.2x"); `live` toggles the "data live" vs "sync"
 * status copy in the panel footer.
 */
import { PALETTE } from "@/components/ui-common";

export interface HeroVisualPanelProps {
  closing: string;
  roas: string;
  moduleCount: number;
  /** True when metrics resolved; false while loading/error (V3 degrade). */
  live: boolean;
  /** Render shimmer chips instead of values while metrics load. */
  loading?: boolean;
}

/** A single white metric chip (bg-surface per spec C.3). */
export function MetricChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-surface px-3 py-2 shadow-[var(--dm-shadow-xs-b6)]">
      <strong className="block font-sans text-ink">{value}</strong>
      <span className="block text-muted text-[0.78rem]">{label}</span>
    </div>
  );
}

/** The 48px module-count ball (spec C.3 / F.19, retuned to the Sneat density). */
export function ModuleBall({ count }: { count: number }) {
  return (
    <div
      aria-label={`${count} modules`}
      className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full text-[1.25rem] font-bold text-ink shadow-[var(--dm-shadow-ball)]"
      style={{
        backgroundImage: `radial-gradient(circle at 30% 30%, ${PALETTE.accent} 0%, ${PALETTE.accentDeep} 60%, ${PALETTE.accent} 100%)`,
      }}
    >
      {count}
    </div>
  );
}

export function HeroVisualPanel({
  closing,
  roas,
  moduleCount,
  live,
  loading = false,
}: HeroVisualPanelProps) {
  return (
    <div className="relative p-2">
      <div className="bg-surface p-4 border border-border rounded-[8px] shadow-[var(--dm-shadow-panel)]">
        {/* PanelHeader */}
        <div className="flex items-center gap-3">
          <div className="flex h-[40px] w-[40px] items-center justify-center rounded-[6px] bg-brand text-[1rem] font-bold text-white shadow-[var(--dm-shadow-mono)]">
            DM
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-ink text-[0.9375rem]">
              Command Center
            </div>
            <div className="text-muted text-[0.78rem]">LPK Duta Persada</div>
          </div>
        </div>

        {/* PanelMetrics: chip → yellow arrow → chip */}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <MetricChip value={loading ? "—" : closing} label="siswa closing" />
          <span
            aria-hidden
            className="text-[1.25rem] font-semibold text-ink shadow-[var(--dm-shadow-arrow)]"
          >
            →
          </span>
          <MetricChip value={loading ? "—" : roas} label="ROAS" />
        </div>

        {/* PanelFooter */}
        <div className="mt-4 flex items-center gap-3">
          <div className="min-w-0 flex-1 text-muted text-[0.82rem]">
            {moduleCount} modules •{" "}
            {live ? "semua data live ke Google Sheets" : "data sedang sync"}
          </div>
          <ModuleBall count={moduleCount} />
        </div>
      </div>
    </div>
  );
}
