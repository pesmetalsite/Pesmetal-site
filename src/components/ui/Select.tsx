'use client'
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <div className="w-full">
      {label && <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">{label}</label>}
      <select
        ref={ref}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm',
          'focus:outline-none focus:border-brand focus:bg-bg-1',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  ),
)
Select.displayName = 'Select'
