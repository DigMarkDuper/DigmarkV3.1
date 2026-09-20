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
      <span className="inline-block rounded-full bg-gradient-to-br from-brand to-brand-hover px-3 py-1 text-[0.76rem] font-bold tracking-[0.05em] text-white">
        MODULE
      </span>
      <div className="mt-5 flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-gradient-to-br from-brand/10 to-accent/28 text-[1.6rem]">
        {icon}
      </div>
      <h1 className="mt-4 text-[clamp(1.7rem,3.4vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-[62ch] text-[1rem] leading-[1.6] text-muted">{desc}</p>
    </div>
  );
}