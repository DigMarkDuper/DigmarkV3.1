/**
 * Button — the five interaction variants (UI_DESIGN_SPEC.md §C.14).
 *
 * Renders an <a> when `href` is given (semantic link), otherwise a <button>.
 * Every focusable gets the brand focus ring; disabled drops to opacity-50 with
 * no hover lift; reduced-motion kills the translate-y on hover.
 */
import { type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-brand to-brand-hover text-white rounded-[14px] px-6 py-3 " +
    "font-bold text-[0.92rem] shadow-[var(--dm-shadow-cta)] " +
    "hover:-translate-y-[1px] hover:shadow-[var(--dm-shadow-cta-hover)] motion-reduce:hover:translate-y-0",
  secondary:
    "bg-surface border border-border rounded-[12px] px-4 py-2 font-semibold text-ink " +
    "shadow-[var(--dm-shadow-xs)] hover:-translate-y-[1px] motion-reduce:hover:translate-y-0",
  ghost:
    "bg-transparent border border-brand/30 text-brand-hover rounded-[12px] px-4 py-2 " +
    "font-semibold hover:bg-brand/5 hover:border-brand hover:text-brand",
  destructive:
    "bg-danger text-white rounded-[12px] px-4 py-2 font-semibold " +
    "hover:shadow-[var(--dm-shadow-xs)]",
};

const BASE = "inline-flex items-center justify-center gap-2 transition-all duration-150 " +
  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";

interface ButtonProps {
  variant?: Variant;
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  /** Extra classes appended after the variant (e.g. layout tweaks). */
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}

export function Button({
  variant = "secondary",
  href,
  type = "button",
  onClick,
  disabled = false,
  className = "",
  children,
  ariaLabel,
}: ButtonProps) {
  const cls = `${BASE} ${VARIANTS[variant]} ${className}`.trim();
  if (href) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        onClick={onClick}
        className={cls}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      className={cls}
    >
      {children}
    </button>
  );
}