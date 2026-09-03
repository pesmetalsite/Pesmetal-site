'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function AutomacoesPage() {
  const [autos, setAutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [wa, setWa] = useState<any>(null)
  const [editing, setEditing] = useState<any>(null)

  const load = async () => {
    const [a, w] = await Promise.all([
      api('/automations', {}, getToken()!),
      api('/whatsapp/status', {}, getToken()!).catch(() => ({ state: 'unconfigured' })),
    ])
    setAutos(a.automations); setWa(w); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const seed = async () => {
    if (!confirm('Instalar automação padrão "Atendimento Principal"? Ela substituirá qualquer automação com mesmo nome.')) return
    await api('/automations/seed-defaults', { method: 'POST' }, getToken()!)
    load()
  }

  const toggle = async (a: any) => {
    await api(`/automations/${a.id}`, { method: 'PUT', body: JSON.stringify({ status: a.status === 'active' ? 'inactive' : 'active' }) }, getToken()!)
    load()
  }

  return (
    <AppShell title="Automações WhatsApp">
      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>STATUS DO WHATSAPP</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
              {wa?.state === 'open' && <span style={{ color: 'var(--success)' }}>● Conectado</span>}
              {wa?.state === 'close' && <span style={{ color: 'var(--danger)' }}>● Desconectado</span>}
              {wa?.state !== 'open' && wa?.state !== 'close' && <span style={{ color: 'var(--warn)' }}>● {wa?.state || 'desconhecido'}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {wa?.configured ? 'API configurada' : 'Evolution API não configurada — defina EVOLUTION_API_URL/KEY no .env'}
            </div>
          </div>
          <button className="btn btn-primary" onClick={seed}>+ Instalar automação padrão</button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {loading ? <div className="loading">Carregando…</div> :
          autos.length === 0 ? (
            <div className="empty">
              <div className="icon">⚙️</div>
              <div>Nenhuma automação configurada.</div>
              <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>Clique em "Instalar automação padrão" para começar.</div>
            </div>
          ) : autos.map((a: any) => (
            <div key={a.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>{a.name}</strong>
                    <span className={'badge ' + (a.status === 'active' ? 'badge-success' : 'badge-muted')}>{a.status}</span>
                    <span className="badge badge-info">gatilho: {a.trigger}</span>
                  </div>
                  {a.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{a.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>Ver fluxos</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(a)}>
                    {a.status === 'active' ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {editing && <AutomationModal automation={editing} onClose={() => { setEditing(null); load() }} />}
    </AppShell>
  )
}

function AutomationModal({ automation, onClose }: any) {
  const [detail, setDetail] = useState<any>(null)
  useEffect(() => {
    api(`/automations/${automation.id}`, {}, getToken()!).then(r => setDetail(r.automation)).catch(() => {})
  }, [automation.id])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18 }}>{automation.name}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {!detail ? <div className="loading">Carregando…</div> : (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-dim)' }}>
              <strong>Fluxo:</strong> {detail.description}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {JSON.parse(detail.graph).nodes.map((n: any) => (
                <div key={n.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="badge badge-accent">{n.type}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ {n.next || (n.options ? 'aguarda input' : 'fim')}</span>
                  </div>
                  {n.config?.text && <div style={{ marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.config.text}</div>}
                  {n.options && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                      {n.options.map((o: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, padding: 4, background: 'var(--bg-2)', borderRadius: 4 }}>
                          <strong>{o.key}</strong> — {o.label} → {o.next}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}