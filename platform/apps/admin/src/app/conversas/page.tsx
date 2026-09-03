'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function ConversasPage() {
  const [convs, setConvs] = useState<any[]>([])
  const [active, setActive] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const r = await api('/whatsapp/conversations', {}, getToken()!)
    setConvs(r.conversations); setLoading(false)
    if (r.conversations.length && !active) setActive(r.conversations[0])
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!active) return
    const t = setInterval(async () => {
      const r = await api(`/whatsapp/conversations/${active.id}/messages`, {}, getToken()!)
      setMessages(r.messages)
    }, 5000)
    return () => clearInterval(t)
  }, [active])
  useEffect(() => {
    if (active) api(`/whatsapp/conversations/${active.id}/messages`, {}, getToken()!).then(r => setMessages(r.messages))
  }, [active])

  const send = async () => {
    if (!reply.trim() || !active) return
    try {
      await api(`/whatsapp/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ text: reply }) }, getToken()!)
      setReply('')
      const r = await api(`/whatsapp/conversations/${active.id}/messages`, {}, getToken()!)
      setMessages(r.messages)
    } catch (e: any) { alert(e.message) }
  }

  const takeover = async () => {
    await api(`/whatsapp/conversations/${active.id}/takeover`, { method: 'POST' }, getToken()!)
    load()
  }

  return (
    <AppShell title="Conversas WhatsApp">
      {loading ? <div className="loading">Carregando…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 280px', gap: 16, height: 'calc(100vh - 120px)' }}>
          <div className="card" style={{ padding: 0, overflowY: 'auto' }}>
            {convs.length === 0 ? (
              <div className="empty">
                <div className="icon">💬</div>
                <div>Sem conversas ainda.</div>
                <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-muted)' }}>Aguardando primeira mensagem WhatsApp.</div>
              </div>
            ) : convs.map((c: any) => (
              <div key={c.id}
                onClick={() => setActive(c)}
                style={{ padding: 14, borderBottom: '1px solid var(--border)', cursor: 'pointer', background: active?.id === c.id ? 'var(--bg-2)' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ fontSize: 13 }}>{c.contact_name || c.contact_phone}</strong>
                  {c.unread_count > 0 && <span className="badge badge-accent">{c.unread_count}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>{c.contact_phone}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {c.stage_name && <span className="badge" style={{ background: (c.stage_color || '#666') + '33', color: c.stage_color, fontSize: 10 }}>{c.stage_name}</span>}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.last_message_at ? new Date(c.last_message_at).toLocaleString('pt-BR') : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            {!active ? <div className="empty">Selecione uma conversa</div> : (
              <>
                <div style={{ padding: '0 0 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{active.contact_name || active.contact_phone}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{active.contact_phone}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={takeover}>Assumir atendimento humano</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {messages.length === 0 ? <div className="empty">Sem mensagens ainda.</div> :
                    messages.map((m: any) => (
                      <div key={m.id} style={{
                        alignSelf: m.direction === 'outgoing' ? 'flex-end' : 'flex-start',
                        maxWidth: '70%',
                        padding: '8px 12px', borderRadius: 12,
                        background: m.direction === 'outgoing' ? 'var(--accent)' : 'var(--bg-2)',
                        color: m.direction === 'outgoing' ? '#0a0a0a' : 'var(--text)',
                      }}>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                          {m.sent_by === 'automation' ? '🤖 Automação' : m.direction === 'outgoing' ? '👤 Você' : '👤 Cliente'}
                        </div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{new Date(m.created_at).toLocaleString('pt-BR')}</div>
                      </div>
                    ))
                  }
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input className="input" value={reply} onChange={e => setReply(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && send()}
                    placeholder="Digite uma mensagem..." />
                  <button className="btn btn-primary" onClick={send}>Enviar</button>
                </div>
              </>
            )}
          </div>

          <div className="card">
            {active ? (
              <>
                <h3 style={{ fontSize: 13, marginBottom: 12 }}>Detalhes</h3>
                <Detail label="Lead" value={active.lead_id} />
                <Detail label="Etapa" value={active.stage_name} />
                <Detail label="Status" value={active.status} />
                <Detail label="Automação" value={active.automation_status} />
                <Detail label="Responsável" value={active.assigned_user_id || '—'} />
              </>
            ) : <div className="empty">—</div>}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Detail({ label, value }: any) {
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="label">{label}</div>
      <div style={{ fontSize: 12 }}>{value || '—'}</div>
    </div>
  )
}