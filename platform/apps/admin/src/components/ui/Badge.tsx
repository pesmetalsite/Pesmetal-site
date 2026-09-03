'use client'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'accent' | 'success' | 'warn' | 'danger' | 'info' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  accent: 'bg-brand-soft text-brand border-brand/30',
  success: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  warn: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  danger: 'bg-red-400/15 text-red-400 border-red-400/30',
  info: 'bg-blue-400/15 text-blue-400 border-blue-400/30',
  muted: 'bg-zinc-400/15 text-zinc-400 border-zinc-400/30',
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
