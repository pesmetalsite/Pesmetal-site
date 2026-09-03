'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function MarketingPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pixel, setPixel] = useState<any>({ pixelId: '', gaId: '', gtmId: '' })

  useEffect(() => {
    Promise.all([
      api('/dashboard/campaigns', {}, getToken()!),
      api('/public/pixel').catch(() => ({ pixelId: '', gaId: '', gtmId: '' })),
    ]).then(([c, p]) => {
      setData(c.data); setPixel(p); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <AppShell title="Marketing & Origem">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Pixels e Tags</h3>
          <Field label="Meta Pixel ID" value={pixel.pixelId} />
          <Field label="Google Analytics ID" value={pixel.gaId} />
          <Field label="Google Tag Manager ID" value={pixel.gtmId} />
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            Configure em <a href="/configuracoes" style={{ color: 'var(--accent)' }}>Configurações → Integrações</a>.
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Campanhas (atribuição)</h3>
          {loading ? <div className="loading">Carregando…</div> :
            data.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>
                <div style={{ fontSize: 12 }}>Sem campanhas registradas ainda.</div>
                <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-muted)' }}>Quando leads chegarem com UTM, aparecerão aqui.</div>
              </div>
            ) : (
              <table className="table">
                <thead><tr><th>Campanha</th><th>Origem</th><th>Leads</th><th>Fechados</th></tr></thead>
                <tbody>
                  {data.slice(0, 10).map((d: any, i: number) => (
                    <tr key={i}>
                      <td>{d.campaign}</td>
                      <td><span className="badge badge-info">{d.source}</span></td>
                      <td><strong>{d.leads}</strong></td>
                      <td>{d.won || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      </div>
    </AppShell>
  )
}

function Field({ label, value }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="label">{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'monospace', background: 'var(--bg-2)', padding: '6px 10px', borderRadius: 4 }}>
        {value || <span style={{ color: 'var(--text-muted)' }}>não configurado</span>}
      </div>
    </div>
  )
}