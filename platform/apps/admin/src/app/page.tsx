'use client'
import { useEffect, useState } from 'react'
import { Users, MessageSquare, TrendingUp, DollarSign, Zap, Target, ArrowUpRight } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { Card, Stat, Empty, Loading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api, getToken } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [byPeriod, setByPeriod] = useState<any[]>([])
  const [bySource, setBySource] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api('/dashboard/metrics', {}, getToken()!),
      api('/dashboard/leads-by-period', {}, getToken!()).catch(() => ({ data: [] })),
      api('/dashboard/leads-by-source', {}, getToken!()).catch(() => ({ data: [] })),
      api('/dashboard/funnel', {}, getToken!()).catch(() => ({ data: [] })),
    ]).then(([m, p, s, f]) => {
      setMetrics(m.metrics)
      setByPeriod(p.data || [])
      setBySource(s.data || [])
      setFunnel(f.data || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading || !metrics) return <AppShell title="Dashboard"><Loading /></AppShell>

  const maxByPeriod = Math.max(...byPeriod.map(d => d.count), 1)
  const totalLeads = metrics.leads_period || 0

  return (
    <AppShell title="Dashboard">
      <div className="stats">
        <Stat label="Leads Hoje" value={metrics.leads_today} icon={<Users size={18} />} />
        <Stat label="Leads no Período" value={metrics.leads_period} icon={<TrendingUp size={18} />} />
        <Stat label="Em Atendimento" value={metrics.in_attendance} icon={<MessageSquare size={18} />} />
        <Stat label="Orçamentos" value={metrics.quotes} icon={<Zap size={18} />} />
        <Stat label="Conversão" value={`${metrics.conversion_rate}%`} icon={<Target size={18} />} />
        <Stat label="Pipeline (R$)" value={formatCurrency(metrics.pipeline_value)} icon={<DollarSign size={18} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
        {/* Gráfico de evolução */}
        <Card title="Evolução de leads (30 dias)" description="Novos leads por dia" className="lg:col-span-2">
          {byPeriod.length === 0 ? (
            <Empty icon="📊" title="Sem dados ainda" description="Os gráficos aparecerão quando houver leads." />
          ) : (
            <div className="flex items-end gap-1 h-40">
              {byPeriod.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                  <div
                    className="w-full bg-gradient-to-t from-brand to-brand-2 rounded-t min-h-[2px] transition-all hover:opacity-80"
                    style={{ height: `${(d.count / maxByPeriod) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Funil */}
        <Card title="Funil de vendas">
          {funnel.length === 0 ? (
            <Empty icon="🎯" title="Sem dados" />
          ) : (
            <div className="space-y-2">
              {funnel.map((s) => {
                const max = Math.max(...funnel.map(f => f.count), 1)
                const pct = Math.max((s.count / max) * 100, 4)
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
          {bySource.length === 0 ? (
            <Empty icon="📍" title="Sem origens registradas" description="Os leads precisam de UTMs/fbclid para aparecer aqui." />
          ) : (
            <div className="space-y-2">
              {bySource.map((s) => {
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
            <Mini label="Qualificados" value={metrics.qualified} />
            <Mini label="Negociações" value={metrics.negotiations} />
            <Mini label="Ganhos" value={metrics.won} variant="success" />
            <Mini label="Perdidos" value={metrics.lost} variant="danger" />
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-text-dim">
            <span>Período: {formatDate(metrics.range?.from)} → {formatDate(metrics.range?.to)}</span>
            <span className="flex items-center gap-1 text-brand">
              Atualizado agora <ArrowUpRight size={12} />
            </span>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function Mini({ label, value, variant }: any) {
  const colors: any = {
    success: 'text-emerald-400',
    danger: 'text-red-400',
  }
  return (
    <div>
      <div className="text-[11px] text-text-dim uppercase tracking-wide font-semibold">{label}</div>
      <div className={`font-display font-bold text-2xl mt-1 ${colors[variant] || 'text-text'}`}>{value}</div>
    </div>
  )
}
