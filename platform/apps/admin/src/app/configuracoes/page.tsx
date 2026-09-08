'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken } from '@/lib/api'

export default function ConfiguracoesPage() {
  const [company, setCompany] = useState<any>({})
  const [saved, setSaved] = useState('')

  useEffect(() => {
    api('/settings/company', {}, getToken()!).then((c) => setCompany(c.settings))
  }, [])

  const saveCompany = async () => {
    await api('/settings/company', { method: 'PUT', body: JSON.stringify(company) }, getToken()!)
    setSaved('Configurações da empresa salvas'); setTimeout(() => setSaved(''), 2500)
  }

  return (
    <AppShell title="Configurações">
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Empresa</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Config label="Nome da empresa" k="company_name" obj={company} setObj={setCompany} />
          <Config label="Telefone" k="company_phone" obj={company} setObj={setCompany} />
          <Config label="WhatsApp" k="company_whatsapp" obj={company} setObj={setCompany} />
          <Config label="E-mail" k="company_email" obj={company} setObj={setCompany} />
          <Config label="Cidade" k="company_city" obj={company} setObj={setCompany} />
          <Config label="Estado" k="company_state" obj={company} setObj={setCompany} />
          <Config label="Endereço" k="company_address" obj={company} setObj={setCompany} />
          <Config label="Horário de atendimento" k="company_business_hours" obj={company} setObj={setCompany} />
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