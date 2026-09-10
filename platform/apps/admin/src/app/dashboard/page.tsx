'use client'
import { useEffect, useState } from 'react'
import { Users, MessageSquare, TrendingUp, DollarSign, Zap, Target, ArrowUpRight } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { Card, Stat, Empty } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api, getToken } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'

// Cache em memória para dados do dashboard
let metricsCache: any = null
let byPeriodCache: any[] = []
let bySourceCache: any[] = []
let funnelCache: any[] = []
let lastFetch = 0
const CACHE_TTL = 30_000 // 30 segundos

export default function DashboardPage() {
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      const token = getToken()
      if (!token) return

      const now = Date.now()
      if (metricsCache && now - lastFetch < CACHE_TTL) return

      try {
        const [m, p, s, f] = await Promise.all([
          api('/dashboard/metrics', {}, token),
          api('/dashboard/leads-by-period', {}, token).catch(() => ({ data: [] })),
          api('/dashboard/leads-by-source', {}, token).catch(() => ({ data: [] })),
          api('/dashboard/funnel', {}, token).catch(() => ({ data: [] })),
        ])

        metricsCache = m.metrics
        byPeriodCache = p.data || []
        bySourceCache = s.data || []
        funnelCache = f.data || []
        lastFetch = now
        setRefresh(r => r + 1)
      } catch {}
    }

    fetchData()
  }, [])

  // Atualiza ao focar a aba
  useEffect(() => {
    const onFocus = () => {
      lastFetch = 0
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const metrics = metricsCache
  const byPeriod = byPeriodCache
  const bySource = bySourceCache
  const funnel = funnelCache

  // Valores padrão para evitar loading
  const safeMetrics = metrics || {
    leads_today: 0,
    leads_period: 0,
    in_attendance: 0,
    quotes: 0,
    conversion_rate: 0,
    pipeline_value: 0,
    qualified: 0,
    negotiations: 0,
    won: 0,
    lost: 0,
  }

  const maxByPeriod = Math.max(...byPeriod.map((d: any) => d.count || 0), 1)
  const totalLeads = safeMetrics.leads_period || 0

  return (
    <AppShell title="Dashboard">
      <div className="stats">
        <Stat label="Leads Hoje" value={safeMetrics.leads_today} icon={<Users size={18} />} />
        <Stat label="Leads no Período" value={safeMetrics.leads_period} icon={<TrendingUp size={18} />} />
        <Stat label="Em Atendimento" value={safeMetrics.in_attendance} icon={<MessageSquare size={18} />} />
        <Stat label="Orçamentos" value={safeMetrics.quotes} icon={<Zap size={18} />} />
        <Stat label="Conversão" value={`${safeMetrics.conversion_rate}%`} icon={<Target size={18} />} />
        <Stat label="Pipeline (R$)" value={formatCurrency(safeMetrics.pipeline_value)} icon={<DollarSign size={18} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
        {/* Gráfico de evolução */}
        <Card title="Evolução de leads (30 dias)" description="Novos leads por dia" className="lg:col-span-2">
          {byPeriod.length === 0 && !metrics ? (
            <Empty icon="📊" title="Carregando dados…" description="Aguarde enquanto buscamos as informações." />
          ) : byPeriod.length === 0 ? (
            <Empty icon="📊" title="Sem dados ainda" description="Os gráficos aparecerão quando houver leads." />
          ) : (
            <div className="flex items-end gap-1 h-40">
              {byPeriod.map((d: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                  <div
                    className="w-full bg-gradient-to-t from-brand to-brand-2 rounded-t min-h-[2px] transition-all hover:opacity-80"
                    style={{ height: `${((d.count || 0) / maxByPeriod) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Funil */}
        <Card title="Funil de vendas">
          {funnel.length === 0 && !metrics ? (
            <Empty icon="🎯" title="Carregando…" />
          ) : funnel.length === 0 ? (
            <Empty icon="🎯" title="Sem dados" />
          ) : (
            <div className="space-y-2">
              {funnel.map((s: any) => {
                const max = Math.max(...funnel.map((f: any) => f.count || 0), 1)
                const pct = Math.max(((s.count || 0) / max) * 100, 4)
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-text-dim">{s.count}</span>
                    </div>
                    <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Origem dos leads */}
        <Card title="Origem dos leads">
          {bySource.length === 0 && !metrics ? (
            <Empty icon="📍" title="Carregando…" />
          ) : bySource.length === 0 ? (
            <Empty icon="📍" title="Sem origens registradas" description="Os leads precisam de UTMs/fbclid para aparecer aqui." />
          ) : (
            <div className="space-y-2">
              {bySource.map((s: any) => {
                const pct = totalLeads ? Math.round((s.count / totalLeads) * 100) : 0
                return (
                  <div key={s.source} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={s.source === 'whatsapp' ? 'success' : s.source === 'site_form' ? 'accent' : 'info'}>
                        {s.source}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-text-dim">{pct}%</div>
                      <div className="font-display font-bold text-lg w-10 text-right">{s.count}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Resumo */}
        <Card title="Resumo do Período" className="lg:col-span-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Mini label="Qualificados" value={safeMetrics.qualified} />
            <Mini label="Negociações" value={safeMetrics.negotiations} />
            <Mini label="Ganhos" value={safeMetrics.won} variant="success" />
            <Mini label="Perdidos" value={safeMetrics.lost} variant="danger" />
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-text-dim">
            <span>
              {metrics ? `Período: ${formatDate(safeMetrics.range?.from)} → ${formatDate(safeMetrics.range?.to)}` : 'Carregando período…'}
            </span>
            {metrics && (
              <span className="flex items-center gap-1 text-brand">
                Atualizado <ArrowUpRight size={12} />
              </span>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function Mini({ label, value, variant }: any) {
  const colors: any = {
    success: 'text-emerald-600',
    danger: 'text-red-600',
  }
  return (
    <div>
      <div className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">{label}</div>
      <div className={`font-display font-bold text-2xl mt-1 ${colors[variant] || 'text-text'}`}>{value ?? 0}</div>
    </div>
  )
}
