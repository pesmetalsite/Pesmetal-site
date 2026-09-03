'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function ConfiguracoesPage() {
  const [company, setCompany] = useState<any>({})
  const [integrations, setIntegrations] = useState<any>({})
  const [tab, setTab] = useState<'company' | 'integrations'>('company')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    Promise.all([
      api('/settings/company', {}, getToken()!),
      api('/settings/integrations', {}, getToken()!),
    ]).then(([c, i]) => { setCompany(c.settings); setIntegrations(i.settings) })
  }, [])

  const saveCompany = async () => {
    await api('/settings/company', { method: 'PUT', body: JSON.stringify(company) }, getToken()!)
    setSaved('Configurações da empresa salvas'); setTimeout(() => setSaved(''), 2500)
  }
  const saveIntegrations = async () => {
    await api('/settings/integrations', { method: 'PUT', body: JSON.stringify(integrations) }, getToken()!)
    setSaved('Integrações salvas'); setTimeout(() => setSaved(''), 2500)
  }

  return (
    <AppShell title="Configurações">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={'btn ' + (tab === 'company' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('company')}>Empresa</button>
        <button className={'btn ' + (tab === 'integrations' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('integrations')}>Integrações</button>
      </div>

      {tab === 'company' && (
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Config label="Nome da empresa" k="company_name" obj={company} setObj={setCompany} />
            <Config label="Telefone" k="company_phone" obj={company} setObj={setCompany} />
            <Config label="WhatsApp" k="company_whatsapp" obj={company} setObj={setCompany} />
            <Config label="E-mail" k="company_email" obj={company} setObj={setCompany} />
            <Config label="Cidade" k="company_city" obj={company} setObj={setCompany} />
            <Config label="Estado" k="company_state" obj={company} setObj={setCompany} />
            <Config label="Endereço" k="company_address" obj={company} setObj={setCompany} />
            <Config label="Horário" k="company_business_hours" obj={company} setObj={setCompany} />
            <Config label="Anos de experiência" k="company_experience_years" obj={company} setObj={setCompany} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="label">Sobre a empresa</label>
            <textarea className="textarea" rows={4} value={company.company_about || ''} onChange={e => setCompany({ ...company, company_about: e.target.value })} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={saveCompany}>Salvar</button>
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="card">
          <Config label="Meta Pixel ID" k="meta_pixel_id" obj={integrations} setObj={setIntegrations} placeholder="123456789012345" />
          <Config label="Google Analytics ID" k="google_analytics_id" obj={integrations} setObj={setIntegrations} placeholder="G-XXXXXXXXXX" />
          <Config label="Google Tag Manager ID" k="gtm_id" obj={integrations} setObj={setIntegrations} placeholder="GTM-XXXXXXX" />
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12 }}>
            <strong>WhatsApp / Evolution API:</strong> URL, instância e chave são lidos do <code>.env</code> do servidor (não expostos no front por segurança).
            Estado atual: <code>{integrations.evolution_api_key_set ? 'configurado' : 'não configurado'}</code>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={saveIntegrations}>Salvar</button>
          </div>
        </div>
      )}

      {saved && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--success)', color: 'white', padding: '10px 16px', borderRadius: 6, fontWeight: 600 }}>{saved}</div>}
    </AppShell>
  )
}

function Config({ label, k, obj, setObj, placeholder }: any) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" placeholder={placeholder} value={obj[k] || ''} onChange={e => setObj({ ...obj, [k]: e.target.value })} />
    </div>
  )
}