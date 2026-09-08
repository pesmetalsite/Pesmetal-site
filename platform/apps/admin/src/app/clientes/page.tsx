'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Card, Empty, Loading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { api, getToken } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Search, Phone, Building2, FileText, MessageSquare, Pencil, UserPlus, Save, X } from 'lucide-react'

interface Contact {
  id: string
  name?: string | null
  custom_name?: string | null
  phone?: string | null
  email?: string | null
  company?: string | null
  document?: string | null
  address_line?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  address_neighborhood?: string | null
  state_registration?: string | null
  conversation_id?: string | null
  quote_count?: number
  created_at?: string
}

export default function ClientesPage() {
  const router = useRouter()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', company: '', document: '',
    address_line: '', address_city: '', address_state: '', address_zip: '',
    address_neighborhood: '', state_registration: '',
  })

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const r = await api(`/contacts?limit=200${search ? `&search=${encodeURIComponent(search)}` : ''}`, {}, getToken()!)
      setContacts(r.contacts || [])
    } catch { setContacts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadContacts()
  }, [search])

  const openCreate = () => {
    setEditingContact(null)
    setForm({ name: '', phone: '', email: '', company: '', document: '', address_line: '', address_city: '', address_state: '', address_zip: '', address_neighborhood: '', state_registration: '' })
    setEditorOpen(true)
  }

  const openEdit = (c: Contact) => {
    setEditingContact(c)
    setForm({
      name: c.name || c.custom_name || '', phone: c.phone || '', email: c.email || '',
      company: c.company || '', document: c.document || '',
      address_line: c.address_line || '', address_city: c.address_city || '',
      address_state: c.address_state || '', address_zip: c.address_zip || '',
      address_neighborhood: c.address_neighborhood || '', state_registration: c.state_registration || '',
    })
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) { alert('Nome e telefone são obrigatórios'); return }
    setSaving(true)
    try {
      if (editingContact) {
        await api(`/contacts/${editingContact.id}`, { method: 'PUT', body: JSON.stringify(form) }, getToken()!)
      } else {
        await api('/contacts', { method: 'POST', body: JSON.stringify(form) }, getToken()!)
      }
      setEditorOpen(false)
      loadContacts()
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateQuote = (c: Contact) => {
    const name = encodeURIComponent(c.name || c.custom_name || '')
    const phone = encodeURIComponent(c.phone || '')
    router.push(`/orcamentos?novo=1&contact_id=${c.id}&contact_name=${name}&contact_phone=${phone}`)
  }

  const handleOpenConversation = (c: Contact) => {
    if (c.conversation_id) {
      router.push(`/conversas?conversation=${c.conversation_id}`)
    }
  }

  return (
    <AppShell title="Clientes">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex items-center gap-2 bg-bg-2 border border-border rounded-lg px-3 py-2 flex-1 max-w-md">
            <Search size={16} className="text-text-muted" />
            <input
              className="bg-transparent border-none outline-none flex-1 text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome, telefone, empresa..."
            />
          </div>
          <Badge variant="muted">{contacts.length} clientes</Badge>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <UserPlus size={15} /> Novo Cliente
        </Button>
      </div>

      {loading ? (
        <Loading message="Carregando clientes..." />
      ) : contacts.length === 0 ? (
        <Card>
          <Empty
            icon="👥"
            title="Nenhum cliente encontrado"
            description={search ? "Tente outra busca." : "Cadastre clientes para criar orçamentos com dados completos."}
            action={!search ? (
              <Button variant="primary" onClick={openCreate}>
                <UserPlus size={15} /> Cadastrar primeiro cliente
              </Button>
            ) : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((c) => {
            const name = c.custom_name || c.name || 'Sem nome'
            const phone = c.phone || ''
            const company = c.company || ''
            return (
              <Card key={c.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-text truncate">{name}</div>
                    {company && (
                      <div className="flex items-center gap-1 text-xs text-text-dim mt-1">
                        <Building2 size={11} /> {company}
                      </div>
                    )}
                  </div>
                  <button className="p-1.5 rounded hover:bg-bg-2 text-text-dim hover:text-brand" title="Editar cliente" onClick={() => openEdit(c)}>
                    <Pencil size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-1 text-xs text-text-dim">
                  <Phone size={11} /> {phone || '—'}
                </div>

                {c.document && <div className="text-xs text-text-dim truncate">CPF/CNPJ: {c.document}</div>}
                {c.email && <div className="text-xs text-text-dim truncate">{c.email}</div>}
                {(c.address_line || c.address_city) && (
                  <div className="text-xs text-text-dim truncate">
                    {[c.address_line, c.address_neighborhood, c.address_city, c.address_state, c.address_zip].filter(Boolean).join(', ')}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>{(c.quote_count || 0)} orçamento(s)</span>
                  {c.created_at && <span>{formatDate(c.created_at)}</span>}
                </div>

                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="primary" onClick={() => handleCreateQuote(c)}>
                    <FileText size={13} /> Orçamento
                  </Button>
                  {c.conversation_id && (
                    <Button size="sm" variant="ghost" onClick={() => handleOpenConversation(c)}>
                      <MessageSquare size={13} /> Conversa
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingContact ? 'Editar Cliente' : 'Novo Cliente'}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Nome / Razão Social *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
          <Input label="Telefone / WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 (15) 99999-9999" />
          <Input label="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@email.com" />
          <Input label="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Razão social da empresa" />
          <Input label="CPF / CNPJ" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="000.000.000-00" />
          <Input label="RG / IE" value={form.state_registration} onChange={(e) => setForm({ ...form, state_registration: e.target.value })} placeholder="RG / Inscrição estadual" />
          <Input label="Endereço" value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} placeholder="Rua, número, complemento" />
          <Input label="Bairro" value={form.address_neighborhood} onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value })} placeholder="Bairro" />
          <Input label="Cidade" value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="UF" value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} placeholder="SP" />
            <Input label="CEP" value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} placeholder="00000-000" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <Button variant="ghost" onClick={() => setEditorOpen(false)}>Cancelar</Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? <><span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Salvando...</> : <><Save size={14} /> Salvar</>}
          </Button>
        </div>
      </Modal>
    </AppShell>
  )
}