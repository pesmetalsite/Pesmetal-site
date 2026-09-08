'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Card, Empty, Loading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { api, getToken, API_URL } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Search, Plus, Pencil, FileDown, Send, Copy, Trash2, X, Save,
} from 'lucide-react'

interface QuoteItem {
  id?: string
  description: string
  quantity: number
  unit_price: number
}

interface Quote {
  id: string
  number?: string | number
  title: string
  description?: string
  status: string
  amount: number
  valid_until?: string
  created_at: string
  updated_at?: string
  contact_name?: string
  contact_phone?: string
  contact_id?: string
  conversation_id?: string
  items?: QuoteItem[]
  notes?: string
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'draft', label: 'Rascunho' },
  { id: 'sent', label: 'Enviado' },
  { id: 'accepted', label: 'Aceito' },
  { id: 'expired', label: 'Expirado' },
]

const STATUS_BADGE: Record<string, 'muted' | 'info' | 'success' | 'warn' | 'danger'> = {
  draft: 'muted',
  sent: 'info',
  accepted: 'success',
  expired: 'warn',
  deleted: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  accepted: 'Aceito',
  expired: 'Expirado',
  deleted: 'Excluído',
}

export default function OrcamentosPage() {
  const router = useRouter()
  const [queryParams, setQueryParams] = useState<URLSearchParams | null>(null)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [sendPhoneOpen, setSendPhoneOpen] = useState<string | null>(null)
  const [sendPhone, setSendPhone] = useState('')
  const [sendMsg, setSendMsg] = useState('')

  // editor form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    valid_until: '',
    status: 'draft',
    notes: '',
    contact_id: '',
    conversation_id: '',
  })
  const [items, setItems] = useState<QuoteItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ])

  const total = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0)
  }, [items])

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadQuotes = async () => {
    setLoading(true)
    try {
      const r = await api('/quotes?limit=200', {}, getToken()!)
      setQuotes(r.quotes || r.data || (Array.isArray(r) ? r : []))
    } catch { setQuotes([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadQuotes()
    const params = new URLSearchParams(window.location.search)
    setQueryParams(params)
    if (params.get('novo') === '1') {
      openEditorFromParams(params)
    }
  }, [])

  const openEditorFromParams = (params: URLSearchParams) => {
    setEditing(null)
    setForm({
      title: '',
      description: '',
      valid_until: '',
      status: 'draft',
      notes: '',
      contact_id: params.get('contact_id') || '',
      conversation_id: params.get('conversation_id') || '',
    })
    const name = params.get('contact_name') || ''
    setForm(f => ({ ...f, title: name ? `Orçamento — ${name}` : '' }))
    setItems([{ description: '', quantity: 1, unit_price: 0 }])
    setEditorOpen(true)
  }

  const openEditorEdit = (q: Quote) => {
    setEditing(q)
    setForm({
      title: q.title || '',
      description: q.description || '',
      valid_until: q.valid_until ? q.valid_until.split('T')[0] : '',
      status: q.status || 'draft',
      notes: q.notes || '',
      contact_id: q.contact_id || '',
      conversation_id: q.conversation_id || '',
    })
    setItems(q.items && q.items.length > 0 ? q.items : [{ description: '', quantity: 1, unit_price: 0 }])
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { alert('Título é obrigatório'); return }
    setSaving(true)
    const body = {
      title: form.title,
      description: form.description || undefined,
      valid_until: form.valid_until || undefined,
      status: form.status,
      notes: form.notes || undefined,
      contact_id: form.contact_id || undefined,
      conversation_id: form.conversation_id || undefined,
      items: items.filter(i => i.description.trim()),
      amount: total,
    }
    try {
      if (editing) {
        await api(`/quotes/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) }, getToken()!)
      } else {
        await api('/quotes', { method: 'POST', body: JSON.stringify(body) }, getToken()!)
      }
      setEditorOpen(false)
      loadQuotes()
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async (quoteId: string, phone?: string) => {
    setSendingId(quoteId)
    setSendMsg('')
    try {
      const body: any = {}
      if (phone) body.phone = phone
      const r = await api(`/quotes/${quoteId}/send`, { method: 'POST', body: JSON.stringify(body) }, getToken()!)
      setSendMsg(r.message || 'Orçamento enviado com sucesso!')
      loadQuotes()
    } catch (e: any) {
      setSendMsg(e.message || 'Falha ao enviar')
    } finally {
      setSendingId(null)
      if (phone) setSendPhoneOpen(null)
    }
  }

  const handleDuplicate = async (quoteId: string) => {
    setDuplicatingId(quoteId)
    try {
      await api(`/quotes/${quoteId}/duplicate`, { method: 'POST', body: JSON.stringify({}) }, getToken()!)
      loadQuotes()
    } catch (e: any) {
      alert(e.message || 'Falha ao duplicar')
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleDelete = async (quoteId: string) => {
    if (!confirm('Excluir este orçamento?')) return
    try {
      await api(`/quotes/${quoteId}`, { method: 'DELETE' }, getToken()!)
      loadQuotes()
    } catch (e: any) {
      alert(e.message || 'Falha ao excluir')
    }
  }

  const filtered = quotes.filter((q) => {
    if (statusFilter !== 'all' && q.status !== statusFilter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (q.title || '').toLowerCase().includes(s) ||
      (q.contact_name || '').toLowerCase().includes(s) ||
      String(q.number || q.id || '').toLowerCase().includes(s)
    )
  })

  const updateItem = (idx: number, patch: Partial<QuoteItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const pdfUrl = (id: string) => `${API_URL}/quotes/${id}/pdf`

  return (
    <AppShell title="Orçamentos">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
            <Search size={16} className="text-text-muted" />
            <input
              className="bg-transparent border-none outline-none flex-1 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por título, cliente, número..."
            />
          </div>
        </div>
        <Button variant="primary" onClick={() => { setEditing(null); setForm({ title: '', description: '', valid_until: '', status: 'draft', notes: '', contact_id: '', conversation_id: '' }); setItems([{ description: '', quantity: 1, unit_price: 0 }]); setEditorOpen(true) }}>
          <Plus size={15} /> Novo Orçamento
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${statusFilter === f.id ? 'bg-gradient-to-br from-brand to-brand-dark text-white border-brand' : 'bg-transparent text-text-dim border-border hover:bg-bg-2'}`}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading message="Carregando orçamentos..." />
      ) : filtered.length === 0 ? (
        <Card>
          <Empty
            icon="📄"
            title="Nenhum orçamento"
            description="Crie um novo orçamento ou gere a partir de uma conversa de cliente."
            action={
              <Button variant="primary" onClick={() => { setEditing(null); setForm({ title: '', description: '', valid_until: '', status: 'draft', notes: '', contact_id: '', conversation_id: '' }); setItems([{ description: '', quantity: 1, unit_price: 0 }]); setEditorOpen(true) }}>
                <Plus size={15} /> Criar primeiro orçamento
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="bg-bg-1 border border-border rounded-xl shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id}>
                    <td className="font-mono text-xs text-text-muted">#{q.number || q.id.slice(0, 8)}</td>
                    <td className="font-semibold">{q.title}</td>
                    <td>{q.contact_name || '—'}</td>
                    <td className="font-semibold text-brand-dark">{formatCurrency(q.amount)}</td>
                    <td>
                      <Badge variant={STATUS_BADGE[q.status] || 'muted'}>
                        {STATUS_LABEL[q.status] || q.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-text-dim">{formatDate(q.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <button className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-brand" title="Editar" onClick={() => openEditorEdit(q)}>
                          <Pencil size={14} />
                        </button>
                        <a href={pdfUrl(q.id)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-brand" title="PDF">
                          <FileDown size={14} />
                        </a>
                        <button
                          className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-brand"
                          title="Enviar WhatsApp"
                          disabled={sendingId === q.id}
                          onClick={() => {
                            if (q.contact_id) {
                              handleSend(q.id)
                            } else {
                              setSendPhoneOpen(q.id)
                              setSendPhone(q.contact_phone || '')
                            }
                          }}
                        >
                          <Send size={14} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-brand" title="Duplicar" disabled={duplicatingId === q.id} onClick={() => handleDuplicate(q.id)}>
                          <Copy size={14} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-danger" title="Excluir" onClick={() => handleDelete(q.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sendMsg && (
        <div className="fixed bottom-6 right-6 bg-bg-1 border border-border rounded-lg shadow-lg px-4 py-3 text-sm z-50">
          {sendMsg}
          <button className="ml-3 text-text-muted" onClick={() => setSendMsg('')}><X size={14} /></button>
        </div>
      )}

      {/* Modal: Send phone */}
      {sendPhoneOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSendPhoneOpen(null)}>
          <div className="bg-bg-1 border border-border rounded-2xl p-6 w-[92%] max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg mb-4">Enviar por WhatsApp</h3>
            <p className="text-xs text-text-dim mb-3">Este orçamento não tem contato vinculado. Informe o telefone:</p>
            <Input
              value={sendPhone}
              onChange={(e) => setSendPhone(e.target.value)}
              placeholder="+55 (15) 99999-9999"
            />
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" onClick={() => setSendPhoneOpen(null)}>Cancelar</Button>
              <Button variant="primary" disabled={!sendPhone.trim()} onClick={() => handleSend(sendPhoneOpen, sendPhone.trim())}>
                <Send size={14} /> Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Editar Orçamento #${editing.number || editing.id.slice(0, 8)}` : 'Novo Orçamento'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Título *"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Orçamento — Cliente X"
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição geral do orçamento..."
              rows={2}
            />
          </div>
          <Input
            label="Válido até"
            type="date"
            value={form.valid_until}
            onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
          />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Status</label>
            <select
              className="w-full px-3.5 py-2.5 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand focus:bg-bg-1"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="draft">Rascunho</option>
              <option value="sent">Enviado</option>
              <option value="accepted">Aceito</option>
              <option value="expired">Expirado</option>
            </select>
          </div>
        </div>

        {/* Items */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-sm">Itens do Orçamento</h3>
            <Button size="sm" variant="ghost" onClick={addItem}>
              <Plus size={13} /> Adicionar item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 md:col-span-6">
                  <input
                    className="w-full px-3 py-2 rounded-md bg-bg-2 border border-border text-sm focus:outline-none focus:border-brand focus:bg-bg-1"
                    placeholder="Descrição do item"
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="w-full px-3 py-2 rounded-md bg-bg-2 border border-border text-sm text-center focus:outline-none focus:border-brand focus:bg-bg-1"
                    placeholder="Qtd"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-5 md:col-span-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 rounded-md bg-bg-2 border border-border text-sm text-right focus:outline-none focus:border-brand focus:bg-bg-1"
                    placeholder="Preço unit."
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-1">
                  <span className="text-xs font-semibold text-text-dim hidden md:inline">
                    {formatCurrency((item.quantity || 0) * (item.unit_price || 0))}
                  </span>
                  {items.length > 1 && (
                    <button className="p-1 rounded hover:bg-bg-3 text-text-muted hover:text-danger" onClick={() => removeItem(idx)}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-3 pt-3 border-t border-border">
            <div className="text-right">
              <div className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">Total</div>
              <div className="font-display font-bold text-2xl text-brand-dark">{formatCurrency(total)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Textarea
            label="Observações"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notas internas, condições, etc..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <div className="flex gap-2">
            {editing && (
              <>
                <a href={pdfUrl(editing.id)} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm"><FileDown size={14} /> Gerar PDF</Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sendingId === editing.id}
                  onClick={() => {
                    if (editing.contact_id) handleSend(editing.id)
                    else { setSendPhoneOpen(editing.id); setSendPhone(editing.contact_phone || '') }
                  }}
                >
                  <Send size={14} /> Enviar WhatsApp
                </Button>
              </>
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
