/**
 * Form controls (field pattern, UI_DESIGN_SPEC.md §C.16) — shared surface:
 *   bg-surface-input, radius 12, border-border, ink text, muted/70 placeholder,
 *   brand focus border + soft shadow, dm-meta (0.82rem/600) labels.
 */
/** Supported input kinds for the TextInput field. */
type InputType = "text" | "password" | "email" | "number" | "tel" | "search" | "url";

const FIELD_BASE =
  "w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink " +
  "placeholder:text-muted/70 focus:border-brand focus:shadow-[var(--dm-shadow-xs)] " +
  "focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

export interface FieldProps {
  id?: string;
  label?: string;
  hint?: string;
}

function Label({ id, label }: { id?: string; label?: string }) {
  return label ? (
    <label htmlFor={id} className="mb-1 block text-[0.82rem] font-semibold text-muted">
      {label}
    </label>
  ) : null;
}

export interface TextInputProps extends FieldProps {
  type?: InputType;
  name?: string;
  value?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  onInput?: (value: string) => void;
}

export function TextInput({
  id, name, label, hint, type = "text", value = "", placeholder, autoComplete, required = false, onInput,
}: TextInputProps) {
  return (
    <span className="flex flex-col gap-1">
      <Label id={id} label={label} />
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={FIELD_BASE}
        onChange={(e) => onInput?.(e.target.value)}
      />
      {hint ? <span className="text-[0.78rem] text-muted">{hint}</span> : null}
    </span>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends FieldProps {
  name?: string;
  value?: string;
  options: SelectOption[];
  onSelect?: (value: string) => void;
}

export function Select({
  id, name, label, hint, value = "", options, onSelect,
}: SelectProps) {
  return (
    <span className="flex flex-col gap-1">
      <Label id={id} label={label} />
      <span className="relative">
        <select
          id={id}
          name={name}
          value={value}
          className={`${FIELD_BASE} appearance-none pr-9`}
          onChange={(e) => onSelect?.(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-accent">
          ▾
        </span>
      </span>
      {hint ? <span className="text-[0.78rem] text-muted">{hint}</span> : null}
    </span>
  );
}

export interface CheckboxProps extends FieldProps {
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  onToggle?: (checked: boolean) => void;
}

export function Checkbox({
  id, name, label, hint, checked = false, disabled = false, onToggle,
}: CheckboxProps) {
  return (
    <span className={`flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}>
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="h-[18px] w-[18px] rounded-[5px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand focus:ring-offset-2"
        onChange={(e) => onToggle?.(e.target.checked)}
      />
      {label ? (
        <label htmlFor={id} className="text-[0.82rem] font-semibold text-muted">
          {label}
        </label>
      ) : null}
      {hint ? <span className="text-[0.78rem] text-muted">{hint}</span> : null}
    </span>
  );
}