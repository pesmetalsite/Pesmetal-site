'use client'
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="w-full">
      {label && <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-md bg-bg-2 border text-sm transition-colors',
          'focus:outline-none focus:border-brand focus:bg-bg-1',
          'placeholder:text-text-muted',
          error ? 'border-danger' : 'border-border',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  ),
)
Input.displayName = 'Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, ...props }, ref) => (
    <div className="w-full">
      {label && <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">{label}</label>}
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm min-h-[80px] resize-y',
          'focus:outline-none focus:border-brand focus:bg-bg-1',
          'placeholder:text-text-muted',
          className,
        )}
        {...props}
      />
    </div>
  ),
)
Textarea.displayName = 'Textarea'
