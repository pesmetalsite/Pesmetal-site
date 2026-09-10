'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { Card, Empty } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { api, getToken, invalidateCache } from '@/lib/api'
import { useRealtime } from '@/lib/realtime'
import { cn, formatDate } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Save, Calendar, Check, Clock } from 'lucide-react'

interface Appointment {
  id: string
  title: string
  type: string
  date: string
  time?: string | null
  duration_min?: number
  notes?: string | null
  location?: string | null
  category?: string | null
  status: string
  contact_id?: string | null
  quote_id?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  user_name?: string | null
  quote_number?: string | null
  quote_title?: string | null
}

interface ContactOption { id: string; name?: string | null; custom_name?: string | null; phone?: string | null }
interface QuoteOption { id: string; number?: string | number; title: string; contact_name?: string }

const TYPE_LABEL: Record<string, string> = {
  meeting: 'Reunião', visit: 'Visita', call: 'Ligação', quote: 'Orçamento',
  delivery: 'Entrega', return: 'Retorno', other: 'Outro',
}
const TYPE_COLOR: Record<string, string> = {
  meeting: 'bg-blue-500', visit: 'bg-emerald-500', call: 'bg-amber-500', quote: 'bg-violet-500',
  delivery: 'bg-brand', return: 'bg-pink-500', other: 'bg-slate-400',
}
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendado', confirmed: 'Confirmado', done: 'Concluído', cancelled: 'Cancelado', missed: 'Perdido',
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYMD(s: string): Date {
  const d = new Date(`${s}T12:00:00`)
  return isNaN(d.getTime()) ? new Date() : d
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d); c.setDate(c.getDate() + n); return c
}
function startOfWeek(d: Date): Date {
  const c = new Date(d); const day = c.getDay(); c.setDate(c.getDate() - day); return c
}
function fmtTime(t: string | null | undefined): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${h}:${m || '00'}`
}
function timeLabel(a: Appointment): string {
  if (a.time) return fmtTime(a.time)
  return ''
}

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [anchor, setAnchor] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<string>(toYMD(new Date()))

  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [quotes, setQuotes] = useState<QuoteOption[]>([])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({
    title: '', type: 'meeting', date: toYMD(new Date()), time: '', duration_min: 60,
    notes: '', location: '', category: '', status: 'scheduled', contact_id: '', quote_id: '',
  })
  const [loadingData, setLoadingData] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api('/appointments', {}, getToken()!)
      setAppointments(r.appointments || [])
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  const loadOptions = useCallback(async () => {
    try {
      const [c, q] = await Promise.all([
        api('/contacts?limit=200', {}, getToken()!),
        api('/quotes?limit=200', {}, getToken()!),
      ])
      setContacts((c.contacts || []).map((x: any) => ({ id: x.id, name: x.custom_name || x.name, phone: x.phone })))
      setQuotes((q.quotes || []).filter((x: any) => x.status !== 'deleted').map((x: any) => ({ id: x.id, number: x.number, title: x.title, contact_name: x.contact_name })))
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    load()
    loadOptions()
  }, [load, loadOptions])

  // realtime: atualiza agenda automaticamente
  useRealtime((ev) => {
    if (ev.entity !== 'appointments') return
    if (ev.action === 'deleted') {
      setAppointments(prev => prev.filter(a => a.id !== ev.data.id))
    } else if (ev.action === 'created') {
      const existing = appointments.find(a => a.id === ev.data.id)
      if (!existing) {
        // recarrega para ter os joins completos
        load()
      }
    } else {
      load()
    }
  })

  // quando orçamento muda (status/envio), atualiza opções
  useRealtime((ev) => {
    if (ev.entity === 'quotes') loadOptions()
  })

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const byDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const a of appointments) {
      const key = (a.date || '').slice(0, 10)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(a)
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    return map
  }, [appointments])

  const openCreate = (date?: string) => {
    setEditing(null)
    setForm({ title: '', type: 'meeting', date: date || selectedDay, time: '', duration_min: 60, notes: '', location: '', category: '', status: 'scheduled', contact_id: '', quote_id: '' })
    setEditorOpen(true)
  }

  const openEdit = (a: Appointment) => {
    setEditing(a)
    setForm({
      title: a.title, type: a.type, date: (a.date || '').slice(0, 10), time: a.time || '',
      duration_min: a.duration_min || 60, notes: a.notes || '', location: a.location || '',
      category: a.category || '', status: a.status || 'scheduled', contact_id: a.contact_id || '', quote_id: a.quote_id || '',
    })
    setEditorOpen(true)
  }

  /** Cria evento de entrega a partir de um orçamento com prazo. */
  const createDeliveryFromQuote = async (q: QuoteOption) => {
    if (!q.id) return
    try {
      const detail = await api(`/quotes/${q.id}`, {}, getToken()!)
      const quote = detail.quote
      const deliveryDate = quote?.delivery_date ? quote.delivery_date.slice(0, 10) : toYMD(addDays(new Date(), 15))
      // evita duplicar evento de entrega para o mesmo orçamento
      const dup = appointments.find(a => a.quote_id === q.id && a.type === 'delivery')
      if (dup) { alert('Já existe um compromisso de entrega para este orçamento.'); return }
      const title = `Entrega — ${q.contact_name || quote?.contact_name || q.title}`
      const body = { title, type: 'delivery', date: deliveryDate, time: '09:00', duration_min: 60, notes: `Entrega do orçamento ${q.number} — ${q.title}`, status: 'scheduled', quote_id: q.id, contact_id: quote?.contact_id || undefined }
      await api('/appointments', { method: 'POST', body: JSON.stringify(body) }, getToken()!)
      invalidateCache('/appointments')
      setForm({ ...form, ...body })
      setEditorOpen(false)
      load()
      alert(`Compromisso de entrega criado para ${deliveryDate}.`)
    } catch (e: any) {
      alert(e.message || 'Erro ao criar entrega')
    }
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) { alert('Preencha título e data'); return }
    setSaving(true)
    const body = { ...form, time: form.time || null }
    try {
      if (editing) {
        await api(`/appointments/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) }, getToken()!)
      } else {
        await api('/appointments', { method: 'POST', body: JSON.stringify(body) }, getToken()!)
      }
      invalidateCache('/appointments')
      setEditorOpen(false)
      load()
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar compromisso')
    } finally { setSaving(false) }
  }

  const handleDelete = async (a: Appointment) => {
    if (!confirm(`Excluir "${a.title}"?`)) return
    try {
      await api(`/appointments/${a.id}`, { method: 'DELETE' }, getToken()!)
      invalidateCache('/appointments')
      load()
    } catch (e: any) { alert(e.message || 'Erro ao excluir') }
  }

  const navPrev = () => {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))
    else if (view === 'week') setAnchor(addDays(anchor, -7))
    else setAnchor(addDays(anchor, -1))
  }
  const navNext = () => {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))
    else if (view === 'week') setAnchor(addDays(anchor, 7))
    else setAnchor(addDays(anchor, 1))
  }
  const goToday = () => { setAnchor(new Date()); setSelectedDay(toYMD(new Date())) }

  const monthCells = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const offset = start.getDay()
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
    const cells: Array<{ date: string; day: number; current: boolean }> = []
    for (let i = 0; i < offset; i++) {
      const d = addDays(start, i - offset)
      cells.push({ date: toYMD(d), day: d.getDate(), current: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = toYMD(new Date(anchor.getFullYear(), anchor.getMonth(), d))
      cells.push({ date, day: d, current: true })
    }
    return cells
  }, [anchor])

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i)
      return { date: toYMD(d), label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) }
    })
  }, [anchor])

  const todayStr = toYMD(new Date())
  const selectedEvents = byDay[selectedDay] || []

  return (
    <AppShell title="Agenda">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goToday}>Hoje</Button>
          <Button variant="ghost" size="sm" onClick={navPrev} aria-label="Anterior"><ChevronLeft size={16} /></Button>
          <Button variant="ghost" size="sm" onClick={navNext} aria-label="Próximo"><ChevronRight size={16} /></Button>
          <div className="font-display font-bold text-lg capitalize ml-1">
            {view === 'month' ? monthLabel : view === 'week' ? 'Semana' : formatDate(selectedDay)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-2 border border-border rounded-lg p-0.5">
            {(['month', 'week', 'day'] as const).map(v => (
              <button
                key={v}
                className={cn('px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all', view === v ? 'bg-brand text-white' : 'text-text-dim hover:text-text')}
                onClick={() => setView(v)}
              >
                {v === 'month' ? 'Mês' : v === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => openCreate()}>
            <Plus size={14} /> Novo compromisso
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-dim flex items-center justify-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-bg-3 border-t-brand animate-spin" /> Carregando agenda...
        </div>
      ) : view === 'month' ? (
        <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-bg-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((w, i) => (
              <div key={i} className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-text-dim text-center">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((c, i) => {
              const evs = byDay[c.date] || []
              const isToday = c.date === todayStr
              const isSel = c.date === selectedDay
              return (
                <button
                  key={i}
                  className={cn(
                    'min-h-[92px] border-b border-r border-border text-left align-top p-1.5 transition-colors hover:bg-bg-2/60',
                    !c.current && 'bg-bg-0/40 opacity-50',
                    isToday && 'bg-brand-soft/30',
                    isSel && 'ring-2 ring-inset ring-brand',
                  )}
                  onClick={() => { setSelectedDay(c.date); setView('day') }}
                >
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1', isToday ? 'bg-brand text-white' : 'text-text')}>
                    {c.day}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map(a => (
                      <div key={a.id} className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-white truncate" style={{ background: TYPE_COLOR[a.type] || '#94a3b8' }}>
                        {a.time && <Clock size={9} className="flex-shrink-0" />}
                        <span className="truncate">{a.time ? `${fmtTime(a.time)} — ${a.title}` : a.title}</span>
                      </div>
                    ))}
                    {evs.length > 3 && (
                      <div className="text-[10px] text-text-muted px-1">+{evs.length - 3} compromissos</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((wd) => {
            const evs = byDay[wd.date] || []
            const isToday = wd.date === todayStr
            return (
              <button
                key={wd.date}
                className={cn('bg-bg-1 border border-border rounded-xl p-2 min-h-[280px] text-left hover:border-brand/50 transition-colors', isToday && 'ring-1 ring-brand')}
                onClick={() => { setSelectedDay(wd.date); setView('day') }}
              >
                <div className={cn('text-xs font-bold mb-2', isToday ? 'text-brand-dark' : 'text-text')}>{wd.label}</div>
                <div className="space-y-1">
                  {evs.map(a => (
                    <div key={a.id} className="rounded px-1.5 py-1 text-[11px] text-white" style={{ background: TYPE_COLOR[a.type] || '#94a3b8' }}>
                      <div className="font-semibold truncate">{a.time ? `${fmtTime(a.time)} — ${a.title}` : a.title}</div>
                      {a.contact_name && <div className="text-[9px] opacity-80 truncate">{a.contact_name}</div>}
                    </div>
                  ))}
                  {evs.length === 0 && <div className="text-[11px] text-text-muted">Sem compromissos</div>}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <Card className="p-4">
              <DatePicker value={selectedDay} onChange={(v) => { if (v) setSelectedDay(v); setAnchor(parseYMD(v)) }} />
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-text-dim">Criar de orçamento</h3>
                <select
                  className="w-full px-3 py-2 rounded-md bg-bg-2 border border-border text-sm focus:outline-none"
                  value=""
                  onChange={(e) => { if (e.target.value) createDeliveryFromQuote(quotes.find(q => q.id === e.target.value)!) }}
                >
                  <option value="">Selecionar orçamento com entrega...</option>
                  {quotes.map(q => <option key={q.id} value={q.id}>{q.number} — {q.contact_name || q.title}</option>)}
                </select>
              </div>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold">{formatDate(selectedDay)}</h3>
                <Button size="sm" variant="ghost" onClick={() => openCreate(selectedDay)}><Plus size={13} /> Adicionar</Button>
              </div>
              {selectedEvents.length === 0 ? (
                <Empty icon="📅" title="Nenhum compromisso neste dia" description="Clique em Adicionar para criar." />
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map(a => (
                    <div key={a.id} className="flex items-start gap-3 border border-border rounded-xl p-3 hover:bg-bg-2/50 transition-colors">
                      <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', TYPE_COLOR[a.type] || 'bg-slate-400')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-brand-dark">{a.time ? fmtTime(a.time) : '—'}</span>
                          <span className="text-sm font-semibold truncate">{a.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-2 text-text-dim">{TYPE_LABEL[a.type] || a.type}</span>
                        </div>
                        <div className="text-xs text-text-dim mt-1 space-y-0.5">
                          {a.contact_name && <div>👤 {a.contact_name}{a.contact_phone ? ` · ${a.contact_phone}` : ''}</div>}
                          {a.quote_number && <div>📄 {a.quote_number} — {a.quote_title}</div>}
                          {a.location && <div>📍 {a.location}</div>}
                          {a.notes && <div>{a.notes}</div>}
                          {a.duration_min && <div>⏱ {a.duration_min} min</div>}
                        </div>
                        <div className="mt-1"><span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-2 text-text-dim">{STATUS_LABEL[a.status] || a.status}</span></div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button className="p-1.5 rounded hover:bg-bg-2 text-text-muted hover:text-brand" onClick={() => openEdit(a)}><Pencil size={14} /></button>
                        <button className="p-1.5 rounded hover:bg-bg-2 text-text-muted hover:text-danger" onClick={() => handleDelete(a)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Modal editor */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editing ? 'Editar compromisso' : 'Novo compromisso'} size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input label="Título *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Visita técnica" />
          </div>
          <DatePicker label="Data *" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Horário</label>
            <input type="time" className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Tipo</label>
            <select className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Status</label>
            <select className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Duração (min)</label>
            <input type="number" min="5" step="5" className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: parseInt(e.target.value) || 60 })} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Cliente</label>
            <select className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.contact_id || ''} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}>
              <option value="">Sem cliente</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name || c.phone || 'Sem nome'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Orçamento</label>
            <select className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand" value={form.quote_id || ''} onChange={(e) => setForm({ ...form, quote_id: e.target.value })}>
              <option value="">Sem orçamento</option>
              {quotes.map(q => <option key={q.id} value={q.id}>{q.number} — {q.contact_name || q.title}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <Input label="Localização" value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Endereço / local" />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Descrição / Observações" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <div className="flex gap-2">
            {editing && (
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => handleDelete(editing)}>
                <Trash2 size={14} /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={saving} onClick={handleSave}>
              {saving ? <><span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Salvando...</> : <><Save size={14} /> Salvar</>}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}