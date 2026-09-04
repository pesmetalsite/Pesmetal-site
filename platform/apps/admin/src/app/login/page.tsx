'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react'
import { api, setToken, setUser } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const expired = search.get('expired') === '1'
  const [email, setEmail] = useState('admin@pesmetal.local')
  const [password, setPassword] = useState('pesmetal123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(expired ? 'Sua sessão expirou. Faça login novamente.' : '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(token); setUser(user)
      router.replace('/')
    } catch (e: any) {
      setError(e.message || 'Erro ao entrar. Verifique suas credenciais.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background com gradiente industrial */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 60% 60% at 30% 30%, rgba(255, 107, 26, 0.15) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 70% 70%, rgba(255, 184, 0, 0.08) 0%, transparent 60%),
            #0a0a0a
          `,
        }}
      />
      {/* Padrão de aço sutil */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center font-display font-bold text-2xl text-bg-0 shadow-[0_8px_24px_rgba(255,107,26,0.4)]">
            P
          </div>
          <div>
            <div className="font-display font-bold text-2xl tracking-[3px]">PESMETAL</div>
            <div className="text-[10px] text-text-muted tracking-[2px] uppercase">Painel Comercial</div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="bg-gradient-to-b from-bg-1 to-bg-0 border border-border rounded-2xl p-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        >
          <h1 className="font-display font-bold text-xl mb-1">Entrar no painel</h1>
          <p className="text-sm text-text-dim mb-7">Acesse seu CRM, Kanban e automações.</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-5">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className="mb-4">
            <label className="label">E-mail</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="input pl-10"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="label">Senha</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="input pl-10"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center py-3.5 text-sm uppercase tracking-wider font-bold disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Entrando...</>
            ) : (
              'Entrar'
            )}
          </button>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-[11px] text-text-muted leading-relaxed">
              Acesso restrito à equipe autorizada.<br />
              Em caso de dúvidas, contate o administrador.
            </p>
          </div>
        </form>

        <p className="text-center text-[11px] text-text-muted mt-6">
          © {new Date().getFullYear()} Pes Metal · Caldeiraria · Soldagem · Usinagem
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
