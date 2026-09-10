'use client'
import { useEffect, useState } from 'react'
import { Copy, Pencil, Plus, Power, Trash2, Zap } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { AutomationEditor } from '@/components/automations/AutomationEditor'
import { parseOptions, serializeOptions } from '@/components/automations/options'
import type { AutomationSummary, Stage } from '@/components/automations/types'
import { Badge, Button, Card, Empty, Loading } from '@/components/ui'
import { api, getToken } from '@/lib/api'

export default function AutomacoesPage() {
  const [autos, setAutos] = useState<AutomationSummary[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AutomationSummary | null>(null)

  const load = async () => {
    try {
      const [a, s] = await Promise.all([
        api('/automations', {}, getToken()!),
        api('/kanban/stages', {}, getToken()!).catch(() => ({ stages: [] })),
      ])
      setAutos(a.automations || [])
      setStages(s.stages || [])
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar automações.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const run = async (id: string | null, fn: () => Promise<void>) => {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e: any) {
      setError(e?.message || 'Erro na operação.')
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = (a: AutomationSummary) =>
    run(a.id, async () => {
      const d = (await api(`/automations/${a.id}`, {}, getToken()!)).automation
      const payload = {
        name: d.name,
        description: d.description || '',
        status: d.status === 'active' ? 'inactive' : 'active',
        initial_message: d.initial_message || '',
        options: serializeOptions(parseOptions(d.options)),
        invalid_message: d.invalid_message || '',
      }
      await api(`/automations/${a.id}`, { method: 'PUT', body: JSON.stringify(payload) }, getToken()!)
    })

  const duplicate = (a: AutomationSummary) =>
    run(a.id, async () => {
      const d = (await api(`/automations/${a.id}`, {}, getToken()!)).automation
      const payload = {
        name: `${d.name} (cópia)`,
        description: d.description || '',
        status: d.status,
        initial_message: d.initial_message || '',
        options: serializeOptions(parseOptions(d.options)),
        invalid_message: d.invalid_message || '',
      }
      await api('/automations', { method: 'POST', body: JSON.stringify(payload) }, getToken()!)
    })

  const remove = (a: AutomationSummary) => {
    if (!confirm(`Excluir a automação "${a.name}"?`)) return
    run(a.id, async () => {
      await api(`/automations/${a.id}`, { method: 'DELETE' }, getToken()!)
    })
  }

  const seed = async () => {
    if (!confirm('Instalar a automação padrão "Atendimento Principal"?')) return
    run(null, async () => {
      await api('/automations/seed-defaults', { method: 'POST' }, getToken()!)
    })
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case 'active': return { label: 'Ativa', variant: 'success' as const }
      case 'draft': return { label: 'Rascunho', variant: 'warn' as const }
      case 'archived': return { label: 'Arquivada', variant: 'muted' as const }
      default: return { label: 'Inativa', variant: 'muted' as const }
    }
  }

  return (
    <AppShell title="Automações">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <p className="text-sm text-text-dim max-w-xl">
          Configure o atendimento automático do WhatsApp com um menu numérico de opções.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={seed}>Instalar padrão</Button>
          <Button size="md" onClick={() => setCreating(true)}>
            <Plus size={14} /> Criar automação
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger bg-red-500/10 border border-red-500/30 rounded-md px-4 py-2.5">{error}</div>
      )}

      {loading ? (
        <Loading />
      ) : autos.length === 0 ? (
        <Card>
          <Empty
            icon={<Zap size={48} />}
            title="Nenhuma automação"
            description="Crie sua primeira automação para responder automaticamente aos novos contatos com um menu de opções."
            action={<Button onClick={() => setCreating(true)}><Plus size={14} /> Criar automação</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {autos.map((a) => {
            const b = statusBadge(a.status)
            const isActive = a.status === 'active'
            return (
              <Card key={a.id} className="flex flex-col">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-[15px] truncate">{a.name}</h3>
                  </div>
                  <div className="mt-2">
                    <Badge variant={b.variant}>{b.label}</Badge>
                  </div>
                  {a.description && <p className="text-xs text-text-dim mt-2 leading-relaxed">{a.description}</p>}
                </div>
                <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(a)} disabled={busyId === a.id}>
                    <Pencil size={13} /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => duplicate(a)} disabled={busyId === a.id}>
                    <Copy size={13} /> Duplicar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleStatus(a)} loading={busyId === a.id}>
                    <Power size={13} /> {isActive ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(a)} disabled={busyId === a.id}>
                    <Trash2 size={13} /> Excluir
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {creating && (
        <AutomationEditor
          automation={null}
          stages={stages}
          onClose={() => setCreating(false)}
          onSaved={() => load()}
        />
      )}
      {editing && (
        <AutomationEditor
          automation={editing}
          stages={stages}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
        />
      )}
    </AppShell>
  )
}