'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [filter, setFilter] = useState<any>({ search: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(Object.entries(filter).filter(([_, v]) => v).map(([k, v]: any) => [k, v])).toString()
      const [l, sv, st] = await Promise.all([
        api('/leads?' + qs, {}, getToken()!),
        api('/services', {}, getToken()!),
        api('/kanban/stages', {}, getToken()!),
      ])
      setLeads(l.leads); setServices(sv.services); setStages(st.stages)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <AppShell title="Leads">
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Buscar por nome, telefone, empresa..."
          value={filter.search || ''} onChange={e => setFilter({ ...filter, search: e.target.value })}
          style={{ flex: 1, minWidth: 240 }} />
        <select className="select" value={filter.stage_id || ''} onChange={e => setFilter({ ...filter, stage_id: e.target.value || undefined })}>
          <option value="">Todas as etapas</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select" value={filter.service_id || ''} onChange={e => setFilter({ ...filter, service_id: e.target.value || undefined })}>
          <option value="">Todos os serviços</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={load}>Filtrar</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="loading">Carregando…</div> :
          leads.length === 0 ? (
            <div className="empty">
              <div className="icon">👥</div>
              <div>Nenhum lead encontrado.</div>
              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>Os leads aparecem aqui quando chegam pelo site, WhatsApp ou são criados manualmente.</div>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th><th>Empresa</th><th>Contato</th><th>Etapa</th><th>Serviço</th><th>Origem</th><th>Criado</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.name}</strong>{l.interest && <span className="badge badge-accent" style={{ marginLeft: 8 }}>{l.interest}</span>}</td>
                    <td>{l.company || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.phone}<br />
                      <span style={{ color: 'var(--text-muted)' }}>{l.email || ''}</span>
                    </td>
                    <td>{l.stage_name ? <span className="badge" style={{ background: (l.stage_color || '#666') + '33', color: l.stage_color }}>{l.stage_name}</span> : '—'}</td>
                    <td>{l.service_name || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.source || '—'}
                      {l.campaign && <><br /><span style={{ color: 'var(--text-muted)' }}>{l.campaign}</span></>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </AppShell>
  )
}