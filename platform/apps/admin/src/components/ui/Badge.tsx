'use client'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'accent' | 'success' | 'warn' | 'danger' | 'info' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  accent: 'bg-brand-soft text-brand-dark border-brand/30',
  success: 'bg-emerald-500/15 text-emerald-700 border-emerald-600/30',
  warn: 'bg-amber-500/15 text-amber-700 border-amber-600/30',
  danger: 'bg-red-500/15 text-red-700 border-red-600/30',
  info: 'bg-blue-500/15 text-blue-700 border-blue-600/30',
  muted: 'bg-zinc-500/15 text-zinc-600 border-zinc-500/30',
}

export function Badge({ variant = 'muted', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
