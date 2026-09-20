/**
 * Hero — command-center variant, the Overview hero (UI_DESIGN_SPEC.md §C.3).
 *
 * Two columns ≥ lg (1.15fr 1fr, gap-10); stacks below md (text then visual
 * panel, centered). Left: kicker chip → display-h1 title → muted sub → CTA +
 * inline closing/ROAS stats. Right: the glass HeroVisualPanel.
 */
import { Button } from "@/components/ui/Button";
import { HeroVisualPanel } from "./HeroVisualPanel";

export interface HeroProps {
  /** Pre-formatted closing count (e.g. "12") or "—". */
  closing: string;
  /** Pre-formatted ROAS (e.g. "4.2x") or "—". */
  roas: string;
  moduleCount: number;
  /** True when metric data resolved (toggles "live" vs "sync" copy). */
  live: boolean;
  /** While metrics load, panel chips show shimmer/"—". */
  loading?: boolean;
  /** Which workspace anchor the CTA points at (default #workspace). */
  worksAnchor?: string;
}

export function Hero({ closing, roas, moduleCount, live, loading = false, worksAnchor = "#workspace" }: HeroProps) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
      {/* Left — HeroText */}
      <div>
        <span className="inline-block rounded-full bg-gradient-to-br from-brand to-brand-hover px-3 py-1 text-[0.76rem] font-bold tracking-[0.05em] text-white">
          DIGMARK
        </span>
        <h1 className="mt-4 text-[clamp(2.1rem,4.6vw,3.4rem)] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink">
          Digital Marketing <span className="text-brand">Command Center</span>
        </h1>
        <p className="mt-4 max-w-[54ch] text-[1.05rem] leading-[1.55] text-muted">
          Kelola, pantau, dan analisis seluruh aktivitas digital marketing Duta Persada dalam satu dashboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <Button variant="primary" href={worksAnchor}>
            Explore Workspace →
          </Button>
          <div className="flex items-center gap-3 text-[0.9rem] font-semibold text-muted">
            <span className="text-ink">{closing} siswa closing</span>
            <span aria-hidden className="font-bold text-accent">•</span>
            <span className="text-ink">{roas} ROAS</span>
          </div>
        </div>
      </div>

      {/* Right — glass command-center panel */}
      <HeroVisualPanel closing={closing} roas={roas} moduleCount={moduleCount} live={live} loading={loading} />
    </div>
  );
}