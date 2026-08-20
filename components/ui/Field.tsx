// Form field primitives sized for gloved hands and legible in poor light.
'use client'

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const CONTROL_CLASSES = [
  'w-full min-h-touch px-3 py-3',
  'bg-surface-sunken border border-border-strong rounded-card',
  'text-text-primary text-base placeholder:text-text-muted',
  'focus:border-accent focus:outline-none',
].join(' ')

interface FieldShellProps {
  label: string
  hint?: string
  error?: string | null
  unit?: string
  children: ReactNode
  htmlFor?: string
}

/** Label, unit, hint, and error chrome shared by every control below. */
export function FieldShell({ label, hint, error, unit, children, htmlFor }: FieldShellProps) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-text-secondary">{label}</span>
        {/* Units are shown beside every numeric value, never left implicit (FR-055). */}
        {unit ? <span className="text-xs text-text-muted tabular">{unit}</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
  unit?: string
}

/** Single-line text or numeric input. */
export function TextField({ label, hint, error, unit, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} unit={unit}>
      <input
        className={`${CONTROL_CLASSES} ${rest.type === 'number' ? 'tabular' : ''} ${className}`}
        // A numeric keypad rather than a full keyboard: fewer taps, bigger keys.
        inputMode={rest.type === 'number' ? 'decimal' : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string | null
}

/** Multi-line notes. */
export function TextAreaField({ label, hint, error, className = '', ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <textarea rows={3} className={`${CONTROL_CLASSES} ${className}`} {...rest} />
    </FieldShell>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string | null
  options: ReadonlyArray<{ value: string; label: string }>
}

/** Dropdown backed by the native picker, which is already touch-optimised on mobile. */
export function SelectField({
  label,
  hint,
  error,
  options,
  className = '',
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <select className={`${CONTROL_CLASSES} ${className}`} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

interface ToggleFieldProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** A full-width toggle row — the whole row is the target, not just the switch. */
export function ToggleField({ label, hint, checked, onChange }: ToggleFieldProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className="flex min-h-touch w-full items-center justify-between rounded-card border border-border-strong bg-surface-sunken px-3 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        {hint ? <span className="block text-xs text-text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={`ml-3 h-7 w-12 shrink-0 rounded-full p-1 transition-colors ${
          checked ? 'bg-accent-strong' : 'bg-border-strong'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-text-primary transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  )
}
