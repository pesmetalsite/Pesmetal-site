'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'
import { Plus, Wifi, WifiOff, QrCode, Trash2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2, Plug } from 'lucide-react'

interface Instance {
  id: string; name: string; description?: string; phone?: string;
  instance_name: string; webhook_url?: string; is_default: number;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  connected_at?: string; error?: string; created_at: string;
  qr_code_base64?: string; qr_expires_at?: string;
}

export default function ConexoesPage() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', instance_name: '', description: '', phone: '', is_default: false })
  const [creating, setCreating] = useState(false)
  const [qrLoading, setQrLoading] = useState<string | null>(null)
  const [qrData, setQrData] = useState<{ [id: string]: { qr?: string; pairingCode?: string } }>({})
  const [webhookLoading, setWebhookLoading] = useState<string | null>(null)
  const [saved, setSaved] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/instances', {}, getToken()!)
      setInstances(r.instances || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const createInstance = async () => {
    if (!form.name.trim() || !form.instance_name.trim()) return
    setCreating(true)
    try {
      await api('/instances', { method: 'POST', body: JSON.stringify(form) }, getToken()!)
      setShowForm(false)
      setForm({ name: '', instance_name: '', description: '', phone: '', is_default: false })
      showSaved('Conexao criada!')
      load()
    } finally { setCreating(false) }
  }

  const deleteInstance = async (id: string) => {
    if (!confirm('Desativar esta conexao? Esta acao nao pode ser desfeita.')) return
    await api(`/instances/${id}`, { method: 'DELETE' }, getToken()!)
    load()
  }

  const generateQr = async (inst: Instance) => {
    if (inst.status === 'connected') return
    setQrLoading(inst.id)
    setQrData(prev => ({ ...prev, [inst.id]: {} }))
    try {
      const r = await api(`/instances/${inst.id}/qr`, { method: 'POST' }, getToken()!)
      if (r.status === 'connected') {
        showSaved('WhatsApp ja conectado!')
        load()
      } else {
        setQrData(prev => ({ ...prev, [inst.id]: { qr: r.qr, pairingCode: r.pairingCode } }))
      }
    } catch (e: any) {
      alert(e.message)
    } finally { setQrLoading(null) }
  }

  const configureWebhook = async (inst: Instance) => {
    setWebhookLoading(inst.id)
    try {
      const r = await api(`/instances/${inst.id}/webhook`, { method: 'POST' }, getToken()!)
      if (r.ok) {
        showSaved('Webhook configurado!')
        load()
      }
    } catch (e: any) {
      alert(e.message)
    } finally { setWebhookLoading(null) }
  }

  const showSaved = (msg: string) => {
    setSaved(msg); setTimeout(() => setSaved(''), 2500)
  }

  const statusColor = (status: string) => {
    if (status === 'connected') return { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' }
    if (status === 'connecting') return { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' }
    if (status === 'error') return { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' }
    return { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' }
  }

  return (
    <AppShell title="Conexoes WhatsApp">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-3xl mb-1">Conexoes WhatsApp</h1>
            <p className="text-sm text-text-muted">Gerencie multiplos numeros WhatsApp Business conectados ao sistema</p>
          </div>
          <button className="btn btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Nova Conexao
          </button>
        </div>

        {/* Form de nova conexao */}
        {showForm && (
          <div className="card mb-6" style={{ border: '1px solid var(--border)' }}>
            <h3 className="font-display font-bold text-lg mb-4">Nova Conexao WhatsApp</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="label">Nome da conexao *</div>
                <input className="input" placeholder="Ex: WhatsApp Principal"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <div className="label">Nome da instancia Evolution *</div>
                <input className="input" placeholder="Ex: pesmetal-wa1"
                  value={form.instance_name} onChange={e => setForm({ ...form, instance_name: e.target.value })} />
              </div>
              <div>
                <div className="label">Numero do WhatsApp (opcional)</div>
                <input className="input" placeholder="+55 15 99999-0000"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                  Conexao padrao
                </label>
              </div>
              <div className="col-span-2">
                <div className="label">Descricao</div>
                <input className="input" placeholder="Ex: Numero comercial principal da Pes Metal"
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-primary" onClick={createInstance}
                disabled={creating || !form.name.trim() || !form.instance_name.trim()}>
                {creating ? 'Criando...' : 'Criar Conexao'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Lista de conexoes */}
        {loading ? (
          <div className="loading">Carregando...</div>
        ) : instances.length === 0 ? (
          <div className="empty">
            <div className="icon text-5xl mb-4">
              <Plug size={64} style={{ opacity: 0.3 }} />
            </div>
            <div className="title">Nenhuma conexao WhatsApp</div>
            <div className="desc">Clique em "Nova Conexao" para adicionar seu primeiro numero WhatsApp Business.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {instances.map(inst => {
              const sc = statusColor(inst.status)
              return (
                <div key={inst.id} className="card" style={{ border: '1px solid var(--border)' }}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: sc.bg }}>
                        {inst.status === 'connected' ? (
                          <Wifi size={18} style={{ color: sc.color }} />
                        ) : inst.status === 'connecting' ? (
                          <Loader2 size={18} style={{ color: sc.color }} className="animate-spin" />
                        ) : inst.status === 'error' ? (
                          <XCircle size={18} style={{ color: sc.color }} />
                        ) : (
                          <WifiOff size={18} style={{ color: sc.color }} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong style={{ fontSize: 15 }}>{inst.name}</strong>
                          {inst.is_default === 1 && (
                            <span className="badge badge-accent text-[10px]">Padrao</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            @{inst.instance_name}
                          </span>
                        </div>
                        <div className="text-sm flex items-center gap-2 mt-1" style={{ color: 'var(--text-dim)' }}>
                          {inst.phone && <span>{inst.phone}</span>}
                          {inst.connected_at && (
                            <span>Conectado em {new Date(inst.connected_at).toLocaleDateString('pt-BR')}</span>
                          )}
                          {inst.description && <span>· {inst.description}</span>}
                        </div>
                        {inst.error && (
                          <div className="text-xs mt-1" style={{ color: '#ef4444' }}>Erro: {inst.error}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                        {inst.status === 'connected' ? 'Conectado' : inst.status === 'connecting' ? 'Conectando...' : inst.status === 'error' ? 'Erro' : 'Desconectado'}
                      </span>
                      <button className="btn btn-ghost btn-sm" title="Excluir"
                        onClick={() => deleteInstance(inst.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* QR Code display */}
                  {qrData[inst.id]?.qr && (
                    <div className="mb-4 p-4 rounded-xl flex items-center gap-4" style={{ background: '#fff' }}>
                      <img src={qrData[inst.id].qr} alt="QR Code" className="block" style={{ width: 200, height: 200 }} />
                      <div>
                        <p className="font-semibold mb-1" style={{ fontSize: 13, color: '#111' }}>Escaneie com o WhatsApp</p>
                        {qrData[inst.id].pairingCode && (
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                            Codigo: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{qrData[inst.id].pairingCode}</span>
                          </div>
                        )}
                        <p style={{ fontSize: 11, color: '#999' }}>Expira em 60 segundos. Clique em "Gerar QR" se expirou.</p>
                        <button className="btn btn-ghost btn-sm mt-3" onClick={() => setQrData(prev => ({ ...prev, [inst.id]: {} }))}>
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Acoes */}
                  <div className="flex items-center gap-3 flex-wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <button
                      className="btn btn-primary btn-sm flex items-center gap-2"
                      onClick={() => generateQr(inst)}
                      disabled={qrLoading === inst.id || inst.status === 'connected'}
                    >
                      {qrLoading === inst.id ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
                      {inst.status === 'connected' ? 'Conectado' : inst.status === 'connecting' ? 'Aguardando...' : 'Gerar QR'}
                    </button>

                    {inst.status === 'connected' && (
                      <button
                        className="btn btn-ghost btn-sm flex items-center gap-2"
                        onClick={() => configureWebhook(inst)}
                        disabled={webhookLoading === inst.id}
                      >
                        {webhookLoading === inst.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Configurar Webhook
                      </button>
                    )}

                    {inst.webhook_url && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                        Webhook ativo
                      </span>
                    )}
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
