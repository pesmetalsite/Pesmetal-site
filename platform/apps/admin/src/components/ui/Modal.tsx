'use client'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={cn(
          'bg-bg-1 border border-border rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.6)] max-h-[88vh] overflow-y-auto w-[92%] p-7',
          sizes[size],
        )}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-bg-3 flex items-center justify-center text-text-dim">
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
