'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function MarketingPage() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [integrations, setIntegrations] = useState<any>({ meta_pixel_id: '', google_analytics_id: '', gtm_id: '' })
  const [saved, setSaved] = useState('')

  useEffect(() => {
    Promise.all([
      api('/dashboard/campaigns', {}, getToken()!).catch(() => ({ data: [] })),
      api('/settings/integrations', {}, getToken()!).catch(() => ({ settings: {} })),
    ]).then(([c, i]) => {
      setData(c.data || []); setIntegrations(i.settings || {}); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const saveIntegrations = async () => {
    await api('/settings/integrations', { method: 'PUT', body: JSON.stringify(integrations) }, getToken()!)
    setSaved('Rastreamento salvo'); setTimeout(() => setSaved(''), 2500)
  }

  return (
    <AppShell title="Marketing & Rastreamento">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Rastreamento</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Meta Pixel, Google Analytics e Google Tag Manager são injetados na landing a partir destes IDs.
          </p>
          <Field label="Meta Pixel ID" k="meta_pixel_id" obj={integrations} setObj={setIntegrations} placeholder="123456789012345" />
          <Field label="Google Analytics ID" k="google_analytics_id" obj={integrations} setObj={setIntegrations} placeholder="G-XXXXXXXXXX" />
          <Field label="Google Tag Manager ID" k="gtm_id" obj={integrations} setObj={setIntegrations} placeholder="GTM-XXXXXXX" />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveIntegrations}>Salvar</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Campanhas (atribuição)</h3>
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

      {saved && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--success)', color: 'white', padding: '10px 16px', borderRadius: 6, fontWeight: 600 }}>{saved}</div>}
    </AppShell>
  )
}

function Field({ label, k, obj, setObj, placeholder }: any) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="label">{label}</label>
      <input className="input" placeholder={placeholder} value={obj[k] || ''} onChange={e => setObj({ ...obj, [k]: e.target.value })} />
    </div>
  )
}