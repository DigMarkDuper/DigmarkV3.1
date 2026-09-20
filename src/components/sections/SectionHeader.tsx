/**
 * SectionHeader — headed section with yellow accent bar (UI_DESIGN_SPEC.md §C.9).
 */
export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  id?: string;
}

export function SectionHeader({ title, subtitle, id }: SectionHeaderProps) {
  return (
    <section className="my-6" id={id}>
      <h3 className="border-l-[4px] border-accent pl-3 text-[1.18rem] font-extrabold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      {subtitle ? <p className="ml-3 mt-0.5 text-[0.86rem] text-muted">{subtitle}</p> : null}
    </section>
  );
}