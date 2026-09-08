'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { Card, Empty, Loading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { api, getToken } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Search, Phone, Building2, FileText, MessageSquare } from 'lucide-react'

export default function ClientesPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        const r = await api('/leads?limit=200', {}, getToken()!)
        setLeads(r.leads || r.data || (Array.isArray(r) ? r : []))
      } catch { setLeads([]) }
      finally { setLoading(false) }
    }
    run()
  }, [])

  const filtered = leads.filter((l: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.company || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q)
    )
  })

  const handleCreateQuote = (lead: any) => {
    const name = encodeURIComponent(lead.name || lead.custom_name || '')
    const phone = encodeURIComponent(lead.phone || '')
    router.push(`/orcamentos?novo=1&contact_id=${lead.contact_id || lead.id || ''}&contact_name=${name}&contact_phone=${phone}`)
  }

  const handleOpenConversation = (lead: any) => {
    if (lead.conversation_id) {
      router.push(`/conversas?conversation=${lead.conversation_id}`)
    }
  }

  return (
    <AppShell title="Clientes">
      <div className="flex items-center justify-between mb-4">
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
          <Badge variant="muted">{filtered.length} clientes</Badge>
        </div>
      </div>

      {loading ? (
        <Loading message="Carregando clientes..." />
      ) : filtered.length === 0 ? (
        <Card>
          <Empty
            icon="👥"
            title="Nenhum cliente encontrado"
            description={search ? "Tente outra busca." : "Os leads do Kanban aparecerão aqui automaticamente."}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lead: any) => {
            const name = lead.name || lead.custom_name || lead.contact_name || 'Sem nome'
            const phone = lead.phone || lead.contact_phone || ''
            const company = lead.company || lead.contact_company || ''
            const source = lead.source || 'WhatsApp'
            return (
              <Card key={lead.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-text truncate">{name}</div>
                    {company && (
                      <div className="flex items-center gap-1 text-xs text-text-dim mt-1">
                        <Building2 size={11} /> {company}
                      </div>
                    )}
                  </div>
                  <Badge variant={lead.priority === 'high' ? 'danger' : lead.priority === 'medium' ? 'warn' : 'muted'}>
                    {lead.priority || 'normal'}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 text-xs text-text-dim">
                  <Phone size={11} /> {phone || '—'}
                </div>

                {lead.email && (
                  <div className="text-xs text-text-dim truncate">{lead.email}</div>
                )}

                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>Origem: {source}</span>
                  {lead.created_at && <span>{formatDate(lead.created_at)}</span>}
                </div>

                {lead.interest && (
                  <div className="text-[11px] text-brand-dark bg-brand-soft rounded px-2 py-1 inline-block w-fit">
                    {lead.interest}
                  </div>
                )}

                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="primary" onClick={() => handleCreateQuote(lead)}>
                    <FileText size={13} /> Orçamento
                  </Button>
                  {lead.conversation_id && (
                    <Button size="sm" variant="ghost" onClick={() => handleOpenConversation(lead)}>
                      <MessageSquare size={13} /> Conversa
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
