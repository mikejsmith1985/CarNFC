// Button primitive that enforces the 48px touch-target floor structurally, so no call site can accidentally ship a smaller one.
'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'default' | 'large'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  fullWidth?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-text-inverse active:bg-accent',
  secondary: 'bg-surface-raised text-text-primary border border-border-strong active:bg-border',
  ghost: 'bg-transparent text-text-secondary active:bg-surface-raised',
  danger: 'bg-danger text-text-inverse active:opacity-80',
}

/*
  min-h-touch / min-w-touch resolve to the 48px token in globals.css.
  They are applied here rather than left to each call site because FR-014 is not
  a suggestion — a control smaller than a gloved thumb is unusable in the one
  situation this product exists for.
*/
const BASE_CLASSES = [
  'inline-flex items-center justify-center gap-2',
  'min-h-touch min-w-touch px-4 py-3',
  'rounded-card font-semibold text-base',
  'transition-colors duration-150',
  'disabled:opacity-40 disabled:pointer-events-none',
  'select-none touch-manipulation',
].join(' ')

/**
 * A touch-safe button.
 *
 * `size="large"` is for the primary action on a screen someone is operating
 * one-handed while holding a tool in the other.
 */
export function Button({
  variant = 'secondary',
  size = 'default',
  icon,
  fullWidth = false,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const sizeClasses = size === 'large' ? 'min-h-14 text-lg px-5' : ''
  const widthClasses = fullWidth ? 'w-full' : ''

  return (
    <button
      className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${sizeClasses} ${widthClasses} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
