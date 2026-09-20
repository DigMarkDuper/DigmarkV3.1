/**
 * SalesFunnelCard — Home "Quick Insight" sales funnel (quick_insight_funnel_ui_spec.md).
 *
 * PURE presentational component: it renders already-formatted strings +
 * booleans. It does NO fetching and NO formatting math beyond displaying the
 * passed strings. All derived strings (percentages, counts, "—" placeholders)
 * are computed SERVER-SIDE in the overview controller; the component only
 * renders them.
 *
 * States:
 *   loading  -> skeleton boxes (no fake numbers)
 *   ready    -> real formatted values (or "—" for zero-divisor / empty)
 * Error is handled by the caller (app/page.tsx renders ErrorState instead).
 */
import { Fragment } from "react";

export interface SalesFunnelStage {
  name: string;
  /** Final formatted value ("—" for empty). */
  value: string;
  /** Optional small sub-label (e.g. "Views …" under Reach). */
  sub?: string;
}

export interface SalesFunnelConnector {
  /** Already-formatted "0.9%" or "—". */
  rate: string;
}

export interface SalesFunnelCardProps {
  /** Skeleton when true (ignores stages/connectors/supports values). */
  loading?: boolean;
  /** Exactly 5: AWARENESS, INTENT, LEAD, DAFTAR, CLOSING. */
  stages: SalesFunnelStage[];
  /** Exactly 4 rates (between adjacent stages). */
  connectors: SalesFunnelConnector[];
  /** Already-formatted overall lead→closing rate ("4.9%" or "—"). */
  overall?: string;
  /** Exactly 4 supporting metrics: Views, Interaksi, Profile Visit, Ad Spend. */
  supports: SalesFunnelStage[];
}

/** The card's slim title row (header strip) — shared by ready + skeleton. */
function CardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-[1rem] font-extrabold tracking-tight text-ink">SALES FUNNEL</h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">Awareness → Intent → Lead → Daftar → Closing</p>
      </div>
      <div className="flex items-center">
        <span className="rounded-full border border-divider bg-brand/5 px-2.5 py-1 text-[0.75rem] font-semibold text-brand">
          live dari data
        </span>
        <span aria-hidden className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[var(--dm-shadow-arrow)]" />
      </div>
    </div>
  );
}

/** One neutral stage card shell (value in text-ink). */
function StageCard({ s }: { s: SalesFunnelStage }) {
  return (
    <div className="flex flex-col justify-between rounded-[14px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">{s.name}</span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <div className="text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">{s.value}</div>
        {s.sub ? <div className="text-[0.8rem] font-semibold text-muted">{s.sub}</div> : null}
      </div>
    </div>
  );
}

export function SalesFunnelCard({ loading, stages, connectors, overall, supports }: SalesFunnelCardProps) {
  if (loading) {
    return (
      <section
        aria-label="Sales funnel"
        className="mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]"
      >
        <CardHeader />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
          {[0, 1, 2, 3, 4].map((i) => (
            <Fragment key={i}>
              {i > 0 && (
                <div className="hidden flex-col items-center gap-1 md:flex" aria-hidden>
                  <div className="h-3 w-3 rounded bg-muted/20 animate-pulse" />
                  <div className="h-2.5 w-8 rounded bg-muted/20 animate-pulse" />
                </div>
              )}
              <div className="flex flex-col justify-between rounded-[14px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]" aria-busy="true">
                <div className="h-3 w-16 rounded bg-muted/20 animate-pulse" />
                <div className="mt-3 h-6 w-20 rounded bg-muted/20 animate-pulse" />
              </div>
            </Fragment>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-divider pt-3 sm:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col">
              <div className="h-2.5 w-14 rounded bg-muted/20 animate-pulse" />
              <div className="mt-1 h-4 w-20 rounded bg-muted/20 animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Sales funnel"
      className="mt-6 rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)] backdrop-blur-[10px] saturate-[140%]"
    >
      <CardHeader />

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
        {stages.map((s, i) => (
          <Fragment key={s.name}>
            {i > 0 && (
              <div className="flex flex-col items-center justify-center gap-0.5" aria-hidden>
                {/* horizontal chevron + rate (desktop) */}
                <div className="hidden flex-col items-center justify-center gap-0.5 md:flex">
                  <span className="text-[0.9rem] leading-none text-brand">›››</span>
                  <span className="text-[0.75rem] font-semibold text-muted">{connectors[i - 1].rate}</span>
                </div>
                {/* vertical chevron + rate (small screens) */}
                <div className="flex flex-col items-center gap-0.5 md:hidden">
                  <span className="text-[0.9rem] leading-none text-brand">↓</span>
                  <span className="text-[0.75rem] font-semibold text-muted">{connectors[i - 1].rate}</span>
                </div>
              </div>
            )}
            {i === 4 ? (
              /* CLOSING endpoint emphasis — slight blue ring + stronger fill */
              <div className="flex flex-col justify-between rounded-[14px] border-2 border-brand/70 bg-brand/[0.06] p-4 shadow-[var(--dm-shadow-xs)] ring-1 ring-inset ring-brand/40">
                <div className="flex items-center justify-between">
                  <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-muted">{s.name}</span>
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  <div className="text-[1.3rem] font-extrabold leading-[1.1] tracking-[-0.02em] text-brand">{s.value}</div>
                  {s.sub ? <div className="text-[0.8rem] font-semibold text-muted">{s.sub}</div> : null}
                </div>
              </div>
            ) : (
              <StageCard s={s} />
            )}
          </Fragment>
        ))}

        {overall ? (
          <div className="col-span-full mt-2 text-right text-[0.75rem] font-semibold text-muted">
            Konversi keseluruhan Lead → Closing: <span className="text-brand">{overall}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-3 border-t border-divider pt-3 sm:grid-cols-4">
        {supports.map((x) => (
          <div key={x.name} className="flex flex-col">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-muted">{x.name}</span>
            <span className="mt-0.5 text-[1.1rem] font-extrabold tracking-[-0.01em] text-ink">{x.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}