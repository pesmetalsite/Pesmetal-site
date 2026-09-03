'use client'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  elevated?: boolean
}

export function Card({ title, description, action, elevated, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border',
        elevated ? 'bg-bg-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]' : 'bg-gradient-to-b from-bg-1 to-bg-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border">
          <div>
            {title && <h3 className="font-display font-bold text-base">{title}</h3>}
            {description && <p className="text-xs text-text-dim mt-1">{description}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}

interface StatProps {
  label: string
  value: string | number
  delta?: string
  icon?: ReactNode
}

export function Stat({ label, value, delta, icon }: StatProps) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-bg-1 to-bg-0 border border-border rounded-xl p-5">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand to-brand-2" />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] text-text-dim uppercase tracking-wider font-semibold">{label}</div>
          <div className="font-display font-bold text-3xl text-text mt-1 leading-none">{value}</div>
          {delta && <div className="text-[11px] text-text-muted mt-2">{delta}</div>}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export function Empty({ icon = '📋', title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 px-6 text-text-dim">
      <div className="text-5xl mb-4 opacity-40">{icon}</div>
      <h3 className="font-display text-lg font-bold text-text mb-2">{title}</h3>
      {description && <p className="text-sm max-w-md mx-auto leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function Loading({ message = 'Carregando…' }: { message?: string }) {
  return (
    <div className="py-12 text-center text-text-dim flex items-center justify-center gap-3">
      <span className="w-4 h-4 rounded-full border-2 border-bg-3 border-t-brand animate-spin" />
      <span>{message}</span>
    </div>
  )
}