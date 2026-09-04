'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'
import { Wifi, WifiOff, Trash2, Loader2, QrCode, Link2 } from 'lucide-react'

interface Instance {
  id: string; name: string; sender_name?: string; description?: string; phone?: string;
  instance_name: string; webhook_url?: string; is_default: number;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  connected_at?: string; error?: string; created_at: string;
}

export default function ConexoesPage() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', instance_name: '', sender_name: '' })
  const [qrInput, setQrInput] = useState('')
  const [creating, setCreating] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [saved, setSaved] = useState('')

  const showSaved = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(''), 2500) }

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/instances', {}, getToken()!)
      setInstances(r.instances || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const createAndConnect = async () => {
    if (!form.name.trim() || !form.instance_name.trim()) return
    setCreating(true)
    try {
      // Cria a instância
      const r = await api('/instances', { method: 'POST', body: JSON.stringify({
        name: form.name,
        instance_name: form.instance_name,
        sender_name: form.sender_name || form.name,
      })}, getToken()!) as any

      // Se QR foi colado, conecta com ele
      if (qrInput.trim()) {
        setConnecting(r.id)
        try {
          await api(`/instances/${r.id}/qr`, {
            method: 'POST',
            body: JSON.stringify({ qr: qrInput.trim() })
          }, getToken()!)
        } catch {}
        setConnecting(null)
      }

      setShowForm(false)
      setForm({ name: '', instance_name: '', sender_name: '' })
      setQrInput('')
      showSaved('Conexão criada!')
      load()
    } finally { setCreating(false) }
  }

  const deleteInstance = async (id: string) => {
    if (!confirm('Remover esta conexão?')) return
    await api(`/instances/${id}`, { method: 'DELETE' }, getToken()!)
    load()
  }

  const statusColor = (status: string) => {
    if (status === 'connected') return { bg: 'rgba(16,185,129,0.12)', color: '#10b981' }
    if (status === 'error') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' }
    return { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' }
  }

  return (
    <AppShell title="Conexões WhatsApp">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-3xl mb-1">Conexões WhatsApp</h1>
            <p className="text-sm text-text-muted">Cole o QR Code para conectar um número</p>
          </div>
          <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
            <QrCode size={16} /> Conectar
          </button>
        </div>

        {/* Form simplificado */}
        {showForm && (
          <div className="card mb-6" style={{ border: '1px solid var(--border)' }}>
            <h3 className="font-display font-bold text-lg mb-4">Nova Conexão</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div className="label">Nome da conexão *</div>
                <input className="input" placeholder="Ex: Wesley - WhatsApp"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <div className="label">Nome do atendente (aparece entre asteriscos) *</div>
                <input className="input" placeholder="Ex: Wesley"
                  value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Exemplo: <strong>*Wesley*</strong> Olá, bom dia!
                </div>
              </div>
              <div>
                <div className="label">QR Code (cole o base64)</div>
                <textarea className="input" rows={4} placeholder="Cole aqui o conteúdo do QR Code..."
                  value={qrInput} onChange={e => setQrInput(e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Cole o texto do QR code gerado pela Evolution API
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={createAndConnect}
                disabled={creating || !form.name.trim() || !form.instance_name.trim()}>
                {creating ? 'Criando...' : 'Conectar'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setQrInput('') }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : instances.length === 0 ? (
          <div className="empty">
            <div className="icon text-5xl mb-4"><Link2 size={64} style={{ opacity: 0.3 }} /></div>
            <div className="title">Nenhuma conexão</div>
            <div className="desc">Clique em "Conectar" e cole o QR Code.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {instances.map(inst => {
              const sc = statusColor(inst.status)
              return (
                <div key={inst.id} className="card" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: sc.bg }}>
                        {inst.status === 'connected' ? (
                          <Wifi size={18} style={{ color: sc.color }} />
                        ) : (
                          <WifiOff size={18} style={{ color: sc.color }} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong style={{ fontSize: 14 }}>{inst.name}</strong>
                          {inst.sender_name && (
                            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                              → *{inst.sender_name}*
                            </span>
                          )}
                          {inst.is_default === 1 && (
                            <span className="badge badge-accent text-[10px]">Padrão</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                          @{inst.instance_name}
                          {inst.connected_at && (
                            <span> · Conectado em {new Date(inst.connected_at).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                        {inst.error && (
                          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Erro: {inst.error}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                        {inst.status === 'connected' ? 'Conectado' : inst.status === 'connecting' ? 'Conectando...' : inst.status === 'error' ? 'Erro' : 'Desconectado'}
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteInstance(inst.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {saved && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--success)', color: 'white',
          padding: '10px 16px', borderRadius: 6, fontWeight: 600, zIndex: 999
        }}>
          {saved}
        </div>
      )}
    </AppShell>
  )
}
