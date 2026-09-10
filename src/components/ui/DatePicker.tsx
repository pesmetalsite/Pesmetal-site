'use client'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDateStr(s: string): Date | null {
  if (!s) return null
  const d = new Date(`${s}T12:00:00`)
  return isNaN(d.getTime()) ? null : d
}

export interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  label?: string
  placeholder?: string
  min?: string
  max?: string
  className?: string
  /** permite digitar data manualmente também */
  allowInput?: boolean
}

export function DatePicker({ value, onChange, label, placeholder, min, max, className, allowInput = true }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => parseDateStr(value || '') || new Date())
  const [inputVal, setInputVal] = useState(value || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    setInputVal(value || '')
  }, [value])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const goToday = () => { setViewDate(new Date()); select(toDateStr(new Date())) }

  const select = (d: string) => {
    onChange?.(d)
    setInputVal(d)
    setOpen(false)
  }

  const inRange = (d: string) => {
    if (min && d < min) return false
    if (max && d > max) return false
    return true
  }

  const cells: Array<{ date: string; day: number; current: boolean; isToday: boolean; isSel: boolean; disabled: boolean }> = []
  for (let i = 0; i < startOffset; i++) cells.push({ date: '', day: 0, current: false, isToday: false, isSel: false, disabled: true })
  const todayStr = toDateStr(new Date())
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(new Date(year, month, d))
    cells.push({
      date: ds,
      day: d,
      current: true,
      isToday: ds === todayStr,
      isSel: ds === value,
      disabled: !inRange(ds),
    })
  }

  return (
    <div ref={ref} className="w-full relative">
      {label && <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">{label}</label>}
      <div
        className={cn(
          'w-full flex items-center gap-2 px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm cursor-pointer',
          'focus-within:border-brand hover:border-brand/60 transition-colors',
          className,
        )}
        onClick={() => setOpen(o => !o)}
      >
        <Calendar size={14} className="text-text-muted flex-shrink-0" />
        <input
          className="bg-transparent border-none outline-none flex-1 text-sm cursor-pointer"
          readOnly={!allowInput}
          value={inputVal}
          placeholder={placeholder || 'Selecionar data'}
          onChange={(e) => {
            setInputVal(e.target.value)
            if (allowInput) onChange?.(e.target.value)
          }}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-bg-1 border border-border rounded-xl shadow-[0_16px_40px_rgba(16,24,40,0.16)] p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="p-1.5 rounded-md hover:bg-bg-2 text-text-dim" onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold text-text">
              {MONTHS[month]} {year}
            </div>
            <button type="button" className="p-1.5 rounded-md hover:bg-bg-2 text-text-dim" onClick={nextMonth} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-text-muted py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => (
              c.current ? (
                <button
                  key={i}
                  type="button"
                  disabled={c.disabled}
                  onClick={() => select(c.date)}
                  className={cn(
                    'h-8 rounded-md text-sm flex items-center justify-center transition-colors',
                    c.isSel
                      ? 'bg-gradient-to-br from-brand to-brand-dark text-white font-bold'
                      : c.isToday
                        ? 'bg-brand-soft text-brand-dark font-bold'
                        : 'text-text hover:bg-bg-2',
                    c.disabled && 'opacity-30 cursor-not-allowed',
                  )}
                >
                  {c.day}
                </button>
              ) : (
                <div key={i} className="h-8" />
              )
            ))}
          </div>

          <div className="flex justify-between mt-2 pt-2 border-t border-border">
            <button type="button" className="text-xs text-brand-dark font-semibold hover:underline" onClick={goToday}>
              Hoje
            </button>
            {value && (
              <button type="button" className="text-xs text-text-muted hover:underline" onClick={() => select('')}>
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}