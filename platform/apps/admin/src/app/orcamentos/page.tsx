'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function OrcamentosPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({ lead_id: '', title: '', amount: 0 })
  const [show, setShow] = useState(false)

  const load = async () => {
    const [q, l] = await Promise.all([
      api('/quotes', {}, getToken()!),
      api('/leads', {}, getToken()!),
    ])
    setQuotes(q.quotes); setLeads(l.leads); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.lead_id || !form.title) return alert('Selecione um lead e informe o título')
    await api('/quotes', { method: 'POST', body: JSON.stringify(form) }, getToken()!)
    setShow(false); setForm({ lead_id: '', title: '', amount: 0 }); load()
  }

  return (
    <AppShell title="Orçamentos">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{quotes.length} orçamento(s)</div>
        <button className="btn btn-primary" onClick={() => setShow(true)}>+ Novo orçamento</button>
      </div>

      {show && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>Novo orçamento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select className="select" value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })}>
              <option value="">Selecione um lead</option>
              {leads.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input className="input" placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className="input" type="number" placeholder="Valor (R$)" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
          </div>
          <textarea className="textarea" placeholder="Descrição" value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={create}>Criar</button>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Carregando…</div> :
          quotes.length === 0 ? (
            <div className="empty"><div className="icon">📑</div><div>Nenhum orçamento cadastrado.</div></div>
          ) : (
            <table className="table">
              <thead><tr><th>Número</th><th>Lead</th><th>Título</th><th>Valor</th><th>Status</th><th>Criado</th></tr></thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id}>
                    <td><code>{q.number}</code></td>
                    <td>{q.lead_name}</td>
                    <td><strong>{q.title}</strong>{q.description && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{q.description}</div>}</td>
                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(q.amount)}</td>
                    <td><span className={'badge ' + statusBadge(q.status)}>{q.status}</span></td>
                    <td>{new Date(q.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </AppShell>
  )
}

function statusBadge(s: string) {
  if (s === 'approved') return 'badge-success'
  if (s === 'rejected' || s === 'expired') return 'badge-danger'
  if (s === 'sent' || s === 'analyzing') return 'badge-info'
  return 'badge-muted'
}