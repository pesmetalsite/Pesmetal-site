'use client'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-br from-brand to-brand-dark text-bg-0 border-brand shadow-[0_2px_8px_rgba(255,107,26,0.3)] hover:shadow-[0_4px_16px_rgba(255,107,26,0.5)] hover:-translate-y-px',
  ghost: 'bg-bg-2 text-text-dim border-border hover:bg-bg-3 hover:text-text',
  danger: 'bg-danger text-white border-danger hover:bg-red-600',
  outline: 'bg-transparent text-text border-border hover:border-brand hover:text-brand',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-[13px]',
  lg: 'px-6 py-3 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all border whitespace-nowrap',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
