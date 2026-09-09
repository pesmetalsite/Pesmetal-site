'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react'
import { api, setToken, setUser } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const expired = search.get('expired') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      router.replace('/dashboard')
    } catch (e: any) {
      setError(e.message || 'Erro ao entrar. Verifique suas credenciais.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background com gradiente comercial suave */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 60% 60% at 30% 30%, rgba(37, 211, 102, 0.1) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 70% 70%, rgba(18, 140, 74, 0.06) 0%, transparent 60%),
            #f7f8fa
          `,
        }}
      />
      {/* Padrão sutil */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(45deg, #1a9e5a 25%, transparent 25%), linear-gradient(-45deg, #1a9e5a 25%, transparent 25%)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center font-display font-bold text-2xl text-white shadow-[0_8px_24px_rgba(18,140,74,0.3)]">
            P
          </div>
          <div>
            <div className="font-display font-bold text-2xl tracking-[3px]">PESMETAL</div>
            <div className="text-[10px] text-text-muted tracking-[2px] uppercase">Painel Comercial</div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="bg-bg-1 border border-border rounded-2xl p-8 shadow-[0_24px_60px_rgba(16,24,40,0.12)]"
        >
          <h1 className="font-display font-bold text-xl mb-1">Entrar no painel</h1>
          <p className="text-sm text-text-dim mb-7">Acesse seu CRM, Kanban e automações.</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-5">
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
