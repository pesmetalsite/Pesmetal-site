'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'
import { Wifi, WifiOff, Trash2, Loader2, QrCode, Link2, X, RefreshCw } from 'lucide-react'

interface Instance {
  id: string; name: string; sender_name?: string; description?: string; phone?: string;
  instance_name: string; webhook_url?: string; is_default: number;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  connected_at?: string; error?: string; created_at: string;
  qr_code_base64?: string; qr_expires_at?: string;
}

export default function ConexoesPage() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', sender_name: '' })
  const [creating, setCreating] = useState(false)
  const [qrLoading, setQrLoading] = useState(false)
  const [pendingInstance, setPendingInstance] = useState<Instance | null>(null)
  const [qrData, setQrData] = useState<{ qr?: string; pairingCode?: string } | null>(null)
  const [saved, setSaved] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/instances', {}, getToken()!) as any
      setInstances(r.instances || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const showSaved = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(''), 2500) }

  const createAndGenerateQr = async () => {
    if (!form.name.trim() || !form.sender_name.trim()) return
    setCreating(true)
    try {
      const r = await api('/instances', { method: 'POST', body: JSON.stringify({
        name: form.name,
        sender_name: form.sender_name,
        instance_name: form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36),
      })}, getToken()!) as any

      setPendingInstance({ ...r, name: form.name, sender_name: form.sender_name } as Instance)
      setShowForm(false)
      setQrLoading(true)
      setQrData(null)

      // Gera QR via API
      try {
        const qr = await api(`/instances/${r.id}/qr`, { method: 'POST' }, getToken()!) as any
        if (qr.status === 'connected') {
          showSaved('WhatsApp já conectado!')
          load()
          setPendingInstance(null)
        } else {
          setQrData({ qr: qr.qr, pairingCode: qr.pairingCode })
        }
      } catch (e: any) {
        alert('Erro ao gerar QR: ' + e.message)
        setPendingInstance(null)
      } finally {
        setQrLoading(false)
      }

      setForm({ name: '', sender_name: '' })
    } finally { setCreating(false) }
  }

  const refreshQr = async () => {
    if (!pendingInstance) return
    setQrLoading(true)
    setQrData(null)
    try {
      const qr = await api(`/instances/${pendingInstance.id}/qr`, { method: 'POST' }, getToken()!) as any
      if (qr.status === 'connected') {
        showSaved('WhatsApp conectado!')
        load()
        setPendingInstance(null)
      } else {
        setQrData({ qr: qr.qr, pairingCode: qr.pairingCode })
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setQrLoading(false)
    }
  }

  const closeQrModal = () => {
    setPendingInstance(null)
    setQrData(null)
    load()
  }

  const deleteInstance = async (id: string) => {
    if (!confirm('Remover esta conexão?')) return
    await api(`/instances/${id}`, { method: 'DELETE' }, getToken()!) as any
    load()
  }

  const statusColor = (status: string) => {
    if (status === 'connected') return { bg: 'rgba(16,185,129,0.12)', color: '#10b981' }
    if (status === 'error') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' }
    if (status === 'connecting') return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
    return { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' }
  }

  return (
    <AppShell title="Conexões WhatsApp">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-3xl mb-1">Conexões WhatsApp</h1>
            <p className="text-sm text-text-muted">Conecte números WhatsApp ao sistema</p>
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
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={createAndGenerateQr}
                disabled={creating || !form.name.trim() || !form.sender_name.trim()}>
                {creating ? 'Criando...' : 'Gerar QR Code'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Modal QR Code */}
        {pendingInstance && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}>
            <div style={{
              background: 'var(--bg-card)', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%',
              border: '1px solid var(--border)', textAlign: 'center'
            }}>
              <button onClick={closeQrModal} style={{
                position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
                color: 'var(--text-dim)', cursor: 'pointer', fontSize: 24, lineHeight: 1
              }}>
                <X size={24} />
              </button>

              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{pendingInstance.name}</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
                Escaneie o QR Code com o WhatsApp
              </p>

              <div style={{
                background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16,
                display: 'flex', justifyContent: 'center'
              }}>
                {qrLoading ? (
                  <div style={{ padding: 40, color: '#666' }}>
                    <Loader2 size={48} className="animate-spin" style={{ color: '#666' }} />
                    <p style={{ marginTop: 12, fontSize: 13 }}>Gerando QR Code...</p>
                  </div>
                ) : qrData?.qr ? (
                  <img src={qrData.qr} alt="QR Code" style={{ width: 220, height: 220 }} />
                ) : (
                  <div style={{ padding: 40, color: '#ef4444' }}>
                    <p style={{ fontSize: 13 }}>Erro ao gerar QR Code</p>
                  </div>
                )}
              </div>

              {qrData?.pairingCode && (
                <div style={{
                  background: 'var(--bg-2)', borderRadius: 8, padding: '12px 16px', marginBottom: 16
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Código de pareamento</div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', letterSpacing: 4 }}>
                    {qrData.pairingCode}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
                QR Code expira em 60 segundos
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary flex items-center gap-2" onClick={refreshQr} disabled={qrLoading}>
                  <RefreshCw size={14} className={qrLoading ? 'animate-spin' : ''} />
                  Atualizar QR
                </button>
                <button className="btn btn-ghost" onClick={closeQrModal}>
                  Fechar
                </button>
              </div>
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
            <div className="desc">Clique em "Conectar" para adicionar um WhatsApp.</div>
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
                        ) : inst.status === 'connecting' ? (
                          <Loader2 size={18} style={{ color: sc.color }} className="animate-spin" />
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
