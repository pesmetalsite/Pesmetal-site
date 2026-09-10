'use client'
import { useEffect, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken, setToken, getUser } from '@/lib/api'

export default function ConfiguracoesPage() {
  const [company, setCompany] = useState<any>({})
  const [saved, setSaved] = useState('')

  const [account, setAccount] = useState<any>({ name: '', email: '' })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [accountMsg, setAccountMsg] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    api('/settings/company', {}, getToken()!).then((c) => setCompany(c.settings))
    const u = getUser()
    if (u) setAccount({ name: u.name || '', email: u.email || '' })
  }, [])

  const saveCompany = async () => {
    await api('/settings/company', { method: 'PUT', body: JSON.stringify(company) }, getToken()!)
    setSaved('Configurações da empresa salvas'); setTimeout(() => setSaved(''), 2500)
  }

  const saveAccount = async () => {
    setAccountMsg(null)
    try {
      const res = await api('/auth/me', { method: 'PUT', body: JSON.stringify({ name: account.name, email: account.email }) }, getToken()!)
      if (res?.token) setToken(res.token)
      setAccountMsg({ text: 'Dados salvos', error: false })
    } catch (e: any) {
      setAccountMsg({ text: e.message || 'Erro ao salvar dados', error: true })
    }
  }

  const changePassword = async () => {
    setAccountMsg(null)
    if (newPassword !== confirmPassword) {
      setAccountMsg({ text: 'Confirmação não confere', error: true })
      return
    }
    try {
      await api('/auth/password', { method: 'PUT', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword }) }, getToken()!)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setAccountMsg({ text: 'Senha alterada', error: false })
    } catch (e: any) {
      setAccountMsg({ text: e.message || 'Erro ao alterar senha', error: true })
    }
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

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Minha conta</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Nome</label>
            <input className="input" value={account.name || ''} onChange={e => setAccount({ ...account, name: e.target.value })} />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={account.email || ''} onChange={e => setAccount({ ...account, email: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={saveAccount}>Salvar dados</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Alterar senha</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Senha atual</label>
            <input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div></div>
          <div>
            <label className="label">Nova senha</label>
            <input className="input" type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirmar nova senha</label>
            <input className="input" type="password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={changePassword}>Alterar senha</button>
        </div>
      </div>

      {accountMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: accountMsg.error ? 'var(--danger)' : 'var(--success)', color: 'white', padding: '10px 16px', borderRadius: 6, fontWeight: 600 }}>
          {accountMsg.text}
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