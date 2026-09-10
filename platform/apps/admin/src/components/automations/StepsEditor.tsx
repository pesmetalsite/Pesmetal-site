/**
 * StepsEditor — Editor visual de steps multimídia + fluxos ramificados.
 *
 * Cada step tem:
 * - type: 'message' | 'image' | 'audio' | 'video' | 'document' | 'menu' | 'end'
 * - content (texto), media_url, caption, delay_seconds
 * - options[] com next_step_id (fluxos ramificados)
 * - option_key '0' = voltar (parent_step_id)
 */
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Image as ImageIcon, Music, Video, FileText, MessageSquare, Type, Plus, Save, Trash2, Upload, CornerDownLeft, X } from 'lucide-react'
import { Button, Input, Loading, Modal, Textarea } from '@/components/ui'
import { api, getToken } from '@/lib/api'

export type StepType = 'message' | 'image' | 'audio' | 'video' | 'document' | 'menu' | 'end'

export interface AutomationStep {
  id: string
  type: StepType
  content?: string
  media_url?: string
  media_mime?: string
  file_name?: string
  caption?: string
  delay_seconds?: number
  delay_unit?: 'seconds' | 'minutes' // UI only; backend converte
  parent_step_id?: string | null
  position?: number
}

export interface StepOption {
  id: string
  step_id: string
  option_key: string
  label: string
  next_step_id: string | null
  transfer_human?: boolean
  stage_id?: string
}

interface StepsEditorProps {
  steps: AutomationStep[]
  stepOptions: StepOption[]
  stages: { id: string; name: string }[]
  onChange: (steps: AutomationStep[], options: StepOption[]) => void
}

const TYPE_LABELS: Record<StepType, { label: string; icon: any }> = {
  message: { label: 'Mensagem', icon: MessageSquare },
  image: { label: 'Foto', icon: ImageIcon },
  audio: { label: 'Áudio', icon: Music },
  video: { label: 'Vídeo', icon: Video },
  document: { label: 'Arquivo', icon: FileText },
  menu: { label: 'Menu', icon: Type },
  end: { label: 'Finalizar', icon: CornerDownLeft },
}

function newId() {
  return `step_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function newOptionId() {
  return `opt_${Math.random().toString(36).slice(2, 10)}`
}

function blankStep(type: StepType, position: number, parentId: string | null = null): AutomationStep {
  return {
    id: newId(),
    type,
    content: '',
    delay_seconds: type === 'message' || type === 'menu' ? 0 : (type === 'image' ? 15 : type === 'audio' ? 30 : type === 'video' ? 60 : type === 'document' ? 10 : 0),
    delay_unit: 'seconds',
    parent_step_id: parentId,
    position,
  }
}

export function StepsEditor({ steps, stepOptions, stages, onChange }: StepsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const update = (newSteps: AutomationStep[], newOptions: StepOption[]) => {
    // Reordenar position
    newSteps.forEach((s, i) => { s.position = i })
    onChange(newSteps, newOptions)
  }

  function addStep(type: StepType) {
    const last = steps[steps.length - 1]
    const parent = last ? last.id : null
    const s = blankStep(type, steps.length, parent)
    update([...steps, s], stepOptions)
    setPickerOpen(false)
  }

  function removeStep(id: string) {
    const newSteps = steps.filter(s => s.id !== id)
    // Remove opções do step + opções que apontavam para este step
    const newOptions = stepOptions.filter(o => o.step_id !== id && o.next_step_id !== id)
    update(newSteps, newOptions)
  }

  function patchStep(id: string, patch: Partial<AutomationStep>) {
    const newSteps = steps.map(s => s.id === id ? { ...s, ...patch } : s)
    update(newSteps, stepOptions)
  }

  function addOption(stepId: string) {
    const existing = stepOptions.filter(o => o.step_id === stepId)
    const nextKey = String(existing.length + 1)
    const newOpt: StepOption = {
      id: newOptionId(),
      step_id: stepId,
      option_key: nextKey,
      label: '',
      next_step_id: null,
    }
    update(steps, [...stepOptions, newOpt])
  }

  function patchOption(optId: string, patch: Partial<StepOption>) {
    const newOptions = stepOptions.map(o => o.id === optId ? { ...o, ...patch } : o)
    update(steps, newOptions)
  }

  function removeOption(optId: string) {
    update(steps, stepOptions.filter(o => o.id !== optId))
  }

  function moveStep(id: string, dir: -1 | 1) {
    const i = steps.findIndex(s => s.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= steps.length) return
    const arr = [...steps]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    update(arr, stepOptions)
  }

  async function handleFileUpload(stepId: string, file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/upload/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no upload')
      const step = steps.find(s => s.id === stepId)!
      const type = step.type === 'image' ? 'image' : step.type === 'audio' ? 'audio' : step.type === 'video' ? 'video' : 'document'
      patchStep(stepId, {
        media_url: data.url,
        media_mime: data.mime,
        file_name: data.filename,
      })
    } catch (e: any) {
      alert(e.message || 'Erro no upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="steps-editor">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && uploadTarget) handleFileUpload(uploadTarget, file)
        }}
      />

      {steps.map((step, idx) => {
        const TypeIcon = TYPE_LABELS[step.type].icon
        const options = stepOptions.filter(o => o.step_id === step.id)
        const hasOptions = step.type === 'menu' || step.type === 'message'
        return (
          <div key={step.id} className="step-card">
            <div className="step-card-head">
              <div className="step-card-title">
                <TypeIcon size={14} />
                <span>Etapa {idx + 1} — {TYPE_LABELS[step.type].label}</span>
              </div>
              <div className="step-card-actions">
                <button type="button" className="btn-icon" onClick={() => moveStep(step.id, -1)} disabled={idx === 0}><ChevronUp size={13} /></button>
                <button type="button" className="btn-icon" onClick={() => moveStep(step.id, 1)} disabled={idx === steps.length - 1}><ChevronDown size={13} /></button>
                <button type="button" className="btn-icon btn-danger" onClick={() => removeStep(step.id)}><Trash2 size={13} /></button>
              </div>
            </div>

            <div className="step-card-body">
              <div className="step-row">
                <label className="label">Tipo</label>
                <select
                  className="input"
                  value={step.type}
                  onChange={(e) => patchStep(step.id, { type: e.target.value as StepType })}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              {step.type !== 'end' && (
                <div className="step-row">
                  <label className="label">Delay</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={600}
                      style={{ width: 80 }}
                      value={step.delay_seconds || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0
                        patchStep(step.id, { delay_seconds: val })
                      }}
                    />
                    <select
                      className="input"
                      style={{ width: 110 }}
                      value={step.delay_unit || 'seconds'}
                      onChange={(e) => {
                        const u = e.target.value as 'seconds' | 'minutes'
                        // Converte para segundos internamente
                        const sec = u === 'minutes' ? (step.delay_seconds || 0) * 60 : (step.delay_seconds || 0)
                        patchStep(step.id, { delay_unit: u, delay_seconds: sec })
                      }}
                    >
                      <option value="seconds">segundos</option>
                      <option value="minutes">minutos</option>
                    </select>
                    <span className="label" style={{ marginLeft: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                      {step.delay_unit === 'minutes' ? `${(step.delay_seconds || 0) * 60}s` : `${step.delay_seconds || 0}s`}
                    </span>
                  </div>
                </div>
              )}

              {step.type === 'message' && (
                <div className="step-row">
                  <label className="label">Mensagem</label>
                  <Textarea
                    rows={3}
                    value={step.content || ''}
                    onChange={(e) => patchStep(step.id, { content: e.target.value })}
                    placeholder="Digite a mensagem..."
                  />
                </div>
              )}

              {step.type === 'menu' && (
                <div className="step-row">
                  <label className="label">Mensagem (pergunta do menu)</label>
                  <Textarea
                    rows={2}
                    value={step.content || ''}
                    onChange={(e) => patchStep(step.id, { content: e.target.value })}
                    placeholder="Ex: Olá! Qual serviço você procura?"
                  />
                </div>
              )}

              {['image', 'video', 'document', 'audio'].includes(step.type) && (
                <>
                  <div className="step-row">
                    <label className="label">Arquivo</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {step.media_url ? (
                        <>
                          {step.type === 'image' && (
                            <img src={step.media_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{step.file_name || step.media_url.split('/').pop()}</span>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                            setUploadTarget(step.id)
                            fileRef.current?.click()
                          }}><Upload size={12} /> Trocar</button>
                          <button type="button" className="btn-icon btn-danger" onClick={() => patchStep(step.id, { media_url: undefined, media_mime: undefined, file_name: undefined })}><X size={12} /></button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={uploading}
                          onClick={() => {
                            setUploadTarget(step.id)
                            fileRef.current?.click()
                          }}
                        >
                          <Upload size={12} /> {uploading && uploadTarget === step.id ? 'Enviando...' : 'Adicionar'}
                        </button>
                      )}
                    </div>
                  </div>
                  {step.type !== 'audio' && (
                    <div className="step-row">
                      <label className="label">Legenda / Nome</label>
                      <Textarea
                        rows={2}
                        value={step.caption || ''}
                        onChange={(e) => patchStep(step.id, { caption: e.target.value })}
                        placeholder="Texto que acompanha a mídia"
                      />
                    </div>
                  )}
                </>
              )}

              {step.type === 'end' && (
                <div className="step-row">
                  <label className="label">Mensagem final (opcional)</label>
                  <Textarea
                    rows={2}
                    value={step.content || ''}
                    onChange={(e) => patchStep(step.id, { content: e.target.value })}
                    placeholder="Ex: Fluxo encerrado. Nossa equipe entrará em contato."
                  />
                </div>
              )}

              {hasOptions && (
                <div className="step-options">
                  <label className="label">Opções</label>
                  {options.map((o) => (
                    <div key={o.id} className="step-option">
                      <input
                        className="input"
                        style={{ width: 50 }}
                        value={o.option_key}
                        onChange={(e) => patchOption(o.id, { option_key: e.target.value })}
                        placeholder="1"
                      />
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={o.label}
                        onChange={(e) => patchOption(o.id, { label: e.target.value })}
                        placeholder="Descrição da opção"
                      />
                      <select
                        className="input"
                        style={{ flex: 1 }}
                        value={o.next_step_id || ''}
                        onChange={(e) => patchOption(o.id, { next_step_id: e.target.value || null })}
                      >
                        <option value="">— Finaliza fluxo —</option>
                        {o.option_key === '0' && (
                          <option value="__back__">↩ Voltar ao step anterior</option>
                        )}
                        {steps.filter(s => s.id !== step.id).map(s => {
                          const lbl = TYPE_LABELS[s.type].label
                          const idx = steps.findIndex(x => x.id === s.id)
                          return (
                            <option key={s.id} value={s.id}>
                              Etapa {idx + 1} — {lbl}
                            </option>
                          )
                        })}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <input
                          type="checkbox"
                          checked={!!o.transfer_human}
                          onChange={(e) => patchOption(o.id, { transfer_human: e.target.checked })}
                        />
                        Humano
                      </label>
                      <button type="button" className="btn-icon btn-danger" onClick={() => removeOption(o.id)}><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => addOption(step.id)}>
                    <Plus size={12} /> Adicionar opção
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      <div className="add-step-area">
        {!pickerOpen ? (
          <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            <Plus size={14} /> Adicionar etapa
          </button>
        ) : (
          <div className="step-picker">
            <span className="label">Tipo de conteúdo:</span>
            <div className="step-picker-grid">
              {Object.entries(TYPE_LABELS).map(([k, v]) => {
                const Icon = v.icon
                return (
                  <button key={k} type="button" className="step-picker-btn" onClick={() => addStep(k as StepType)}>
                    <Icon size={16} />
                    <span>{v.label}</span>
                  </button>
                )
              })}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  )
}
