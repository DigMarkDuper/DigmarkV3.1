/**
 * ModuleHero — workspace page intro (UI_DESIGN_SPEC.md §C.4).
 *
 * Built for Phase E workspace pages; kept as a reusable component now so every
 * workspace shell shares it. Single column: kicker → icon tile → title → sub.
 */
export interface ModuleHeroProps {
  icon: string;
  title: string;
  /** Muted description (V3 max-w 62ch). */
  desc: string;
}

export function ModuleHero({ icon, title, desc }: ModuleHeroProps) {
  return (
    <div className="pb-5">
      <span className="inline-block rounded-full bg-brand px-3 py-1 text-[0.76rem] font-bold tracking-[0.05em] text-white">
        MODULE
      </span>
      <div className="mt-4 flex h-[44px] w-[44px] items-center justify-center rounded-[8px] bg-brand text-[1.25rem]">
        {icon}
      </div>
      <h1 className="mt-3 text-[clamp(1.35rem,2.2vw,1.75rem)] font-bold leading-[1.25] tracking-[-0.01em] text-ink">
        {title}
      </h1>
      <p className="mt-2 max-w-[76ch] text-[0.9rem] leading-[1.5] text-muted">
        {desc}
      </p>
    </div>
  );
}
