'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { Card, Empty, Loading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { api, getToken } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

export default function RelatoriosPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [byService, setByService] = useState<any[]>([])
  const [bySource, setBySource] = useState<any[]>([])
  const [funnel, setFunnel] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api('/dashboard/metrics', {}, getToken()!).catch(() => ({ metrics: null })),
      api('/dashboard/leads-by-service', {}, getToken()!).catch(() => ({ data: [] })),
      api('/dashboard/leads-by-source', {}, getToken()!).catch(() => ({ data: [] })),
      api('/dashboard/funnel', {}, getToken()!).catch(() => ({ data: [] })),
      api('/dashboard/campaigns', {}, getToken()!).catch(() => ({ data: [] })),
    ]).then(([m, sv, src, f, c]) => {
      setMetrics(m.metrics)
      setByService(sv.data || [])
      setBySource(src.data || [])
      setFunnel(f.data || [])
      setCampaigns(c.data || [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading || !metrics) return <AppShell title="Relatórios"><Loading /></AppShell>

  const totalLeads = metrics.leads_period || 0
  const maxFunnel = Math.max(...funnel.map((s) => s.count), 1)

  return (
    <AppShell title="Relatórios">
      <div className="stats">
        <Metric label="Leads no Período" value={metrics.leads_period} />
        <Metric label="Conversão" value={`${metrics.conversion_rate}%`} />
        <Metric label="Negociações" value={metrics.negotiations} />
        <Metric label="Pipeline (R$)" value={formatCurrency(metrics.pipeline_value)} />
        <Metric label="Valor Aprovado (R$)" value={formatCurrency(metrics.won_value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Leads por serviço" description="Distribuição de leads pelos serviços">
          {byService.length === 0 ? (
            <Empty icon="🧰" title="Sem dados de serviço" />
          ) : (
            <BarList rows={byService} valueKey="count" labelKey="service" />
          )}
        </Card>

        <Card title="Leads por origem" description="Fonte de captação dos leads">
          {bySource.length === 0 ? (
            <Empty icon="📍" title="Sem origens registradas" />
          ) : (
            <div className="space-y-2">
              {bySource.map((s) => {
                const pct = totalLeads ? Math.round((s.count / totalLeads) * 100) : 0
                return (
                  <div key={s.source} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <Badge variant={s.source === 'whatsapp' ? 'success' : s.source === 'site_form' ? 'accent' : 'info'}>
                      {s.source}
                    </Badge>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-dim">{pct}%</span>
                      <span className="font-display font-bold text-lg w-10 text-right">{s.count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Funil de vendas" description="Leads ativos por etapa">
          {funnel.length === 0 ? (
            <Empty icon="🎯" title="Sem dados de funil" />
          ) : (
            <div className="space-y-3">
              {funnel.map((s) => (
                <div key={s.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-text-dim">{s.count}</span>
                  </div>
                  <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max((s.count / maxFunnel) * 100, 4)}%`, background: s.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Campanhas" description="Atribuição de leads por campanha/origem">
          {campaigns.length === 0 ? (
            <Empty icon="📣" title="Sem campanhas registradas" description="Quando leads chegarem com UTM, aparecerão aqui." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Origem</th>
                    <th>Leads</th>
                    <th>Fechados</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 12).map((c, i) => (
                    <tr key={i}>
                      <td>{c.campaign}</td>
                      <td><Badge variant="info">{c.source}</Badge></td>
                      <td><strong>{c.leads}</strong></td>
                      <td>{c.won || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

function BarList({ rows, valueKey, labelKey }: { rows: any[]; valueKey: string; labelKey: string }) {
  const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1)
  return (
    <div className="space-y-2">
      {rows.slice(0, 12).map((r, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-semibold">{r[labelKey]}</span>
            <span className="text-text-dim">{r[valueKey]}</span>
          </div>
          <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${Math.max((r[valueKey] / max) * 100, 4)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
