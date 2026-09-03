'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function AgendaPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({ title: '', date: '', type: 'meeting' })

  const load = async () => {
    const r = await api('/appointments', {}, getToken()!)
    setItems(r.appointments); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.title || !form.date) return alert('Preencha título e data')
    await api('/appointments', { method: 'POST', body: JSON.stringify(form) }, getToken()!)
    setShowForm(false); setForm({ title: '', date: '', type: 'meeting' }); load()
  }

  return (
    <AppShell title="Agenda">
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{items.length} compromisso(s)</div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Novo compromisso</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>Novo compromisso</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <input className="input" type="datetime-local" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="meeting">Reunião</option>
              <option value="visit">Visita</option>
              <option value="call">Ligação</option>
              <option value="quote">Orçamento</option>
              <option value="return">Retorno</option>
            </select>
          </div>
          <textarea className="textarea" placeholder="Observações" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={create}>Criar</button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Carregando…</div> :
          items.length === 0 ? (
            <div className="empty"><div className="icon">📅</div><div>Nenhum compromisso agendado.</div></div>
          ) : (
            <table className="table">
              <thead><tr><th>Data</th><th>Título</th><th>Tipo</th><th>Lead</th><th>Status</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td>{new Date(i.date).toLocaleString('pt-BR')}</td>
                    <td><strong>{i.title}</strong>{i.notes && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{i.notes}</div>}</td>
                    <td><span className="badge badge-info">{i.type}</span></td>
                    <td>{i.lead_name || '—'}</td>
                    <td>{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </AppShell>
  )
}