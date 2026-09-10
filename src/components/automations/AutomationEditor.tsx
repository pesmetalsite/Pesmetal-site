'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Plus, Save, Trash2 } from 'lucide-react'
import { Button, Input, Loading, Modal, Textarea } from '@/components/ui'
import { Select } from '@/components/ui/Select'
import { api, getToken } from '@/lib/api'
import { cn } from '@/lib/utils'
import { createBlankOption, parseOptions, serializeOptions } from './options'
import type { AutomationOption, AutomationSummary, Stage, WhatsAppInstance } from './types'

interface AutomationEditorProps {
  automation: AutomationSummary | null
  stages: Stage[]
  onClose: () => void
  onSaved: () => void
}

export function AutomationEditor({ automation, stages, onClose, onSaved }: AutomationEditorProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [initialMessage, setInitialMessage] = useState('')
  const [invalidMessage, setInvalidMessage] = useState('')
  const [closingMessage, setClosingMessage] = useState('')
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [instanceIds, setInstanceIds] = useState<string[]>([])
  const [options, setOptions] = useState<AutomationOption[]>(() => [createBlankOption('opt-1')])
  const [loading, setLoading] = useState(!!automation)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    api('/instances', {}, getToken()!).then((r) => setInstances((r.instances || []).filter((i: WhatsAppInstance) => i.status === 'connected'))).catch(() => setInstances([]))
  }, [])

  useEffect(() => {
    if (!automation) return
    api(`/automations/${automation.id}`, {}, getToken()!)
      .then((r) => {
        const d = r.automation
        setName(d.name ?? '')
        setDescription(d.description ?? '')
        setStatus(d.status === 'active' ? 'active' : 'inactive')
        setInitialMessage(d.initial_message ?? '')
        setInvalidMessage(d.invalid_message ?? '')
        setClosingMessage(d.closing_message ?? '')
        try { setInstanceIds(JSON.parse(d.instance_ids || '[]')) } catch { setInstanceIds([]) }
        const parsed = parseOptions(d.options)
        setOptions(parsed.length ? parsed : [createBlankOption('opt-1')])
      })
      .catch(() => setError('Não foi possível carregar a automação.'))
      .finally(() => setLoading(false))
  }, [automation])

  useEffect(() => {
    if (!focusId) return
    const el = nameRefs.current[focusId]
    if (el) {
      el.focus()
      el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
    setFocusId(null)
  }, [focusId])

  const setNameRef = (id: string) => (el: HTMLInputElement | null) => {
    nameRefs.current[id] = el
  }

  const patchOption = (id: string, patch: Partial<AutomationOption>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const addOption = () => {
    const blank = createBlankOption()
    setOptions((prev) => [...prev, blank])
    setFocusId(blank.id)
  }

  const handleNameEnter = (id: string) => {
    const idx = options.findIndex((o) => o.id === id)
    if (idx === -1) return
    if (!options[idx].label.trim()) return
    const blank = createBlankOption()
    setOptions((prev) => [...prev.slice(0, idx + 1), blank, ...prev.slice(idx + 1)])
    setFocusId(blank.id)
  }

  const moveOption = (id: string, dir: -1 | 1) =>
    setOptions((prev) => {
      const i = prev.findIndex((o) => o.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const removeOption = (id: string) =>
    setOptions((prev) => (prev.length === 1 ? [createBlankOption('opt-1')] : prev.filter((o) => o.id !== id)))

  const buildPayload = (overrideName?: string) => ({
    name: (overrideName ?? name).trim(),
    description,
    status,
    initial_message: initialMessage,
    options: serializeOptions(options),
    invalid_message: invalidMessage,
    closing_message: closingMessage,
    instance_ids: instanceIds,
  })

  const save = async (asCopy: boolean) => {
    if (!name.trim()) {
      setError('Informe o nome da automação.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = buildPayload(asCopy ? `${name.trim()} (cópia)` : undefined)
      if (!asCopy && automation) {
        await api(`/automations/${automation.id}`, { method: 'PUT', body: JSON.stringify(payload) }, getToken()!)
      } else {
        await api('/automations', { method: 'POST', body: JSON.stringify(payload) }, getToken()!)
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar automação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={automation ? 'Editar automação' : 'Nova automação'} size="xl">
      {loading ? (
        <Loading />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save(false) }}>
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Input
                label="Nome da automação"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Atendimento principal"
                autoFocus
              />
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-1.5">Status</span>
                <div className="flex items-center gap-2 h-[42px]">
                  <Toggle checked={status === 'active'} onChange={(v) => setStatus(v ? 'active' : 'inactive')} />
                  <span className={cn('text-sm font-semibold', status === 'active' ? 'text-brand-dark' : 'text-text-dim')}>
                    {status === 'active' ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
            </div>

            <Textarea
              label="Mensagem inicial"
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Mensagem enviada quando um novo contato inicia a conversa…"
              rows={4}
            />

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Opções</span>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus size={13} /> Adicionar opção
                </Button>
              </div>
              {options.length === 0 ? (
                <p className="text-sm text-text-muted">Nenhuma opção. Clique em &quot;Adicionar opção&quot; para criar a primeira.</p>
              ) : (
                <div className="grid gap-3">
                  {options.map((o, i) => (
                    <OptionRow
                      key={o.id}
                      index={i}
                      option={o}
                      stages={stages}
                      canMoveUp={i > 0}
                      canMoveDown={i < options.length - 1}
                      nameRef={setNameRef(o.id)}
                      onNameEnter={() => handleNameEnter(o.id)}
                      onChange={(patch) => patchOption(o.id, patch)}
                      onMoveUp={() => moveOption(o.id, -1)}
                      onMoveDown={() => moveOption(o.id, 1)}
                      onRemove={() => removeOption(o.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <Textarea
              label="Mensagem para resposta inválida (opcional)"
              value={invalidMessage}
              onChange={(e) => setInvalidMessage(e.target.value)}
              placeholder="Quando o contato enviar algo que não é uma das opções…"
              rows={2}
            />

            <div className="rounded-lg border border-border bg-bg-2/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-dim mb-2">WhatsApps desta automação</div>
              <p className="text-xs text-text-muted mb-3">Sem seleção = todos os WhatsApps conectados.</p>
              {instances.length === 0 ? <p className="text-sm text-text-muted">Nenhuma conexão WhatsApp ativa.</p> : (
                <div className="grid gap-2">
                  {instances.map((instance) => {
                    const checked = instanceIds.includes(instance.instance_name)
                    return <label key={instance.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={(e) => setInstanceIds((prev) => e.target.checked ? [...prev, instance.instance_name] : prev.filter((id) => id !== instance.instance_name))} />
                      <span>{instance.name}</span>
                    </label>
                  })}
                </div>
              )}
            </div>

            <Textarea
              label="Mensagem ao finalizar atendimento"
              value={closingMessage}
              onChange={(e) => setClosingMessage(e.target.value)}
              placeholder="Obrigado pelo contato! Se precisar de mais alguma coisa, é só nos chamar novamente."
              rows={2}
            />

            {error && (
              <div className="text-sm text-danger bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{error}</div>
            )}

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="button" variant="outline" onClick={() => save(true)} disabled={saving}>
                <Copy size={14} /> Duplicar
              </Button>
              <Button type="submit" loading={saving}>
                <Save size={14} /> Salvar
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}

interface OptionRowProps {
  index: number
  option: AutomationOption
  stages: Stage[]
  canMoveUp: boolean
  canMoveDown: boolean
  nameRef: (el: HTMLInputElement | null) => void
  onNameEnter: () => void
  onChange: (patch: Partial<AutomationOption>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function OptionRow({
  index,
  option,
  stages,
  canMoveUp,
  canMoveDown,
  nameRef,
  onNameEnter,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: OptionRowProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-2/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-brand-soft text-brand-dark font-bold text-xs flex items-center justify-center">
          {index + 1}
        </span>
        <span className="text-xs font-semibold text-text-dim">Opção {index + 1}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="p-1.5 rounded-md hover:bg-bg-3 text-text-dim disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Subir opção"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="p-1.5 rounded-md hover:bg-bg-3 text-text-dim disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Descer opção"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-danger"
            aria-label="Excluir opção"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="grid gap-3">
        <Input
          label="Nome da opção"
          value={option.label}
          ref={nameRef}
          placeholder="Digite o nome e pressione Enter para criar a próxima"
          onChange={(e) => onChange({ label: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onNameEnter()
            }
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Etapa do Kanban"
            value={option.stage_id}
            onChange={(e) => onChange({ stage_id: e.target.value })}
            disabled={option.transfer_human}
          >
            <option value="">— Sem etapa —</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Toggle checked={option.transfer_human} onChange={(v) => onChange({ transfer_human: v })} />
              <span className="text-sm font-medium">Transferir para atendente</span>
            </label>
          </div>
        </div>
        <Textarea
          label="Mensagem após a escolha"
          value={option.message}
          onChange={(e) => onChange({ message: e.target.value })}
          placeholder="Mensagem enviada depois que o contato escolhe esta opção…"
          rows={2}
        />
      </div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-brand border-brand' : 'bg-bg-3 border-border',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}
