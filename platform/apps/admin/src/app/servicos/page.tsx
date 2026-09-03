'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function ServicosPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>({ name: '', slug: '', description: '', category: '' })

  const load = async () => {
    const r = await api('/services', {}, getToken()!)
    setItems(r.services); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.name || !form.slug) return alert('Preencha nome e slug')
    await api('/services', { method: 'POST', body: JSON.stringify(form) }, getToken()!)
    setForm({ name: '', slug: '', description: '', category: '' }); load()
  }

  return (
    <AppShell title="Serviços">
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 14 }}>Cadastrar serviço</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="slug" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
          <input className="input" placeholder="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </div>
        <textarea className="textarea" placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={create}>Cadastrar</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {loading ? <div className="loading">Carregando…</div> :
          items.map((s: any) => (
            <div key={s.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <span className="badge badge-info">{s.category}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{s.description}</div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>slug: {s.slug}</div>
            </div>
          ))
        }
      </div>
    </AppShell>
  )
}