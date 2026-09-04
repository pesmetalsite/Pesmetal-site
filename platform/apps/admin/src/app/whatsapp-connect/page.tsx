'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { QrCode, Smartphone, CheckCircle2, AlertCircle, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react'

export default function WhatsAppConnectPage() {
  const [qr, setQr] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [status, setStatus] = useState<{ state: string; configured: boolean; error?: string }>({ state: 'unknown', configured: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [webhookConfigured, setWebhookConfigured] = useState(false)
  const [configuringWebhook, setConfiguringWebhook] = useState(false)

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/whatsapp/status')
      const data = await r.json()
      setStatus(data)
      if (data.state === 'open') {
        setQr(null)
      }
    } catch (e: any) {
      setError(e.message)
    }
  }

  const fetchQR = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/whatsapp/qr', { method: 'POST' })
      const data = await r.json()
      if (data.base64) setQr(data.base64)
      if (data.pairingCode) setPairingCode(data.pairingCode)
      if (data.error) setError(data.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const configureWebhook = async () => {
    setConfiguringWebhook(true)
    setError('')
    try {
      const r = await fetch('/api/whatsapp/webhook-url', { method: 'POST' })
      const data = await r.json()
      if (data.ok) setWebhookConfigured(true)
      else setError(data.error || 'Falha ao configurar webhook')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setConfiguringWebhook(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const statusInterval = setInterval(fetchStatus, 5000)
    return () => clearInterval(statusInterval)
  }, [])

  useEffect(() => {
    if (status.state !== 'open' && !qr) {
      fetchQR()
    }
  }, [status.state])

  useEffect(() => {
    // Auto-refresh QR a cada 60s se não conectado
    if (status.state !== 'open') {
      const qrInterval = setInterval(() => {
        if (status.state !== 'open') fetchQR()
      }, 60000)
      return () => clearInterval(qrInterval)
    }
  }, [status.state])

  const isConnected = status.state === 'open'
  const isConnecting = status.state === 'connecting'
  const isError = status.state === 'error' || status.state === 'close' || !status.configured

  return (
    <AppShell title="Conectar WhatsApp">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="font-display font-bold text-3xl mb-1">Conectar WhatsApp</h1>
          <p className="text-text-muted text-sm">Conecte o WhatsApp Business da Pes Metal via Evolution API</p>
        </div>

        {/* Status Card */}
        <div className="bg-bg-1 border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 size={24} className="text-green-400" />
                </div>
              ) : isConnecting ? (
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <Loader2 size={24} className="text-yellow-400 animate-spin" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle size={24} className="text-red-400" />
                </div>
              )}
              <div>
                <div className="font-semibold text-lg">
                  {isConnected && 'WhatsApp Conectado'}
                  {isConnecting && 'Aguardando conexão...'}
                  {isError && (status.state === 'unconfigured' ? 'Evolution API não configurada' : 'Desconectado')}
                </div>
                <div className="text-sm text-text-muted">
                  Instância: <span className="font-mono text-text">{status.configured ? 'pesmetal-main' : '—'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={fetchStatus}
              className="p-2 rounded-lg hover:bg-bg-2 text-text-muted hover:text-text transition-colors"
              title="Atualizar status"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {status.error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {status.error}
            </div>
          )}

          {/* Webhook Config */}
          {!webhookConfigured && (
            <div className="mt-4 p-3 bg-bg-0 border border-border rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-text-dim">
                  <strong className="text-text)">Receber mensagens</strong>
                  <br />Configure o webhook para receber mensagens do WhatsApp no sistema.
                </div>
                <button
                  onClick={configureWebhook}
                  disabled={configuringWebhook || !status.configured}
                  className="btn btn-primary btn-sm flex items-center gap-2"
                >
                  {configuringWebhook ? 'Configurando...' : '⟳ Configurar Webhook'}
                </button>
              </div>
            </div>
          )}
          {webhookConfigured && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 flex items-center gap-2">
              ✓ Webhook configurado — mensagens de entrada serão recebidas
            </div>
          )}
        </div>

        {/* QR Code Card */}
        {!isConnected && (
          <div className="bg-bg-1 border border-border rounded-xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* QR Code */}
              <div className="flex flex-col items-center">
                <div className="mb-4 text-center">
                  <h2 className="font-display font-bold text-xl mb-1">QR Code</h2>
                  <p className="text-xs text-text-muted">Atualiza automaticamente a cada 60s</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-2xl" style={{ minWidth: 280, minHeight: 280 }}>
                  {loading && !qr ? (
                    <div className="flex items-center justify-center" style={{ width: 248, height: 248 }}>
                      <Loader2 size={48} className="text-bg-0 animate-spin" />
                    </div>
                  ) : qr ? (
                    <img
                      src={qr}
                      alt="QR Code WhatsApp"
                      className="block"
                      style={{ width: 248, height: 248 }}
                    />
                  ) : (
                    <div className="flex items-center justify-center text-bg-0 text-sm text-center p-4" style={{ width: 248, height: 248 }}>
                      {error || 'QR não disponível. Clique em "Gerar QR" abaixo.'}
                    </div>
                  )}
                </div>

                <button
                  onClick={fetchQR}
                  disabled={loading}
                  className="mt-4 btn btn-secondary px-6 py-2 text-sm flex items-center gap-2"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Gerar novo QR
                </button>
              </div>

              {/* Instruções */}
              <div>
                <div className="mb-4">
                  <h2 className="font-display font-bold text-xl mb-1 flex items-center gap-2">
                    <Smartphone size={20} className="text-brand" />
                    Como conectar
                  </h2>
                  <p className="text-xs text-text-muted">Siga os passos abaixo no seu celular</p>
                </div>

                <ol className="space-y-4 text-sm">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-bg-0 font-bold flex items-center justify-center text-sm">1</span>
                    <div>
                      <strong className="text-text">Abra o WhatsApp</strong> no celular que será o número comercial da Pes Metal
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-bg-0 font-bold flex items-center justify-center text-sm">2</span>
                    <div>
                      Vá em <strong className="text-text">Configurações</strong> (Android) ou <strong className="text-text">Ajustes</strong> (iPhone)
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-bg-0 font-bold flex items-center justify-center text-sm">3</span>
                    <div>
                      Toque em <strong className="text-text">Aparelhos conectados</strong>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-bg-0 font-bold flex items-center justify-center text-sm">4</span>
                    <div>
                      Toque em <strong className="text-text">Conectar um aparelho</strong>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand text-bg-0 font-bold flex items-center justify-center text-sm">5</span>
                    <div>
                      <strong className="text-text">Aponte a câmera</strong> para o QR Code ao lado
                    </div>
                  </li>
                </ol>

                <div className="mt-6 p-3 bg-bg-0 border border-border rounded-lg">
                  <div className="flex items-start gap-2 text-xs text-text-muted">
                    <Wifi size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-text">Pronto!</strong> Quando o status mudar para <em>"WhatsApp Conectado"</em>, o bot estará ativo e responderá automaticamente as mensagens recebidas.
                    </div>
                  </div>
                </div>

                {pairingCode && (
                  <div className="mt-4 p-3 bg-bg-0 border border-brand/30 rounded-lg">
                    <div className="text-xs text-text-muted mb-1">Código de pareamento (alternativa):</div>
                    <div className="font-mono text-xl text-brand font-bold tracking-wider">{pairingCode}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sucesso */}
        {isConnected && (
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/30 rounded-xl p-12 text-center">
            <div className="inline-flex w-20 h-20 rounded-full bg-green-500/20 items-center justify-center mb-4">
              <CheckCircle2 size={40} className="text-green-400" />
            </div>
            <h2 className="font-display font-bold text-2xl mb-2 text-green-400">Tudo conectado!</h2>
            <p className="text-text-muted mb-6 max-w-md mx-auto">
              O WhatsApp Business está conectado e recebendo mensagens. O bot de automações está ativo.
            </p>
            <div className="flex gap-3 justify-center">
              <a href="/conversas" className="btn btn-primary px-6 py-2.5">
                Ver Conversas
              </a>
              <a href="/automacoes" className="btn btn-secondary px-6 py-2.5">
                Configurar Automações
              </a>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
