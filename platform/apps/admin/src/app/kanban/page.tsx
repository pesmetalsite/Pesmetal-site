'use client'
import { useEffect, useState } from 'react'
import {
  DndContext, DragOverlay, closestCorners, useDroppable,
  PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import AppShell from '@/components/AppShell'
import { Card, Badge, Loading, Modal } from '@/components/ui'
import { api, getToken } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Briefcase, GripVertical, Phone, Building2, Calendar } from 'lucide-react'

interface Lead {
  id: string; name: string; company: string | null; phone: string; email: string | null
  interest: string | null; service_name: string | null; priority: string
  created_at: string; stage_id: string; estimated_value: number; source: string | null
}
interface Stage { id: string; name: string; color: string; position: number; is_won?: number; is_lost?: number }

export default function KanbanPage() {
  const [board, setBoard] = useState<{ stages: Stage[]; leads: Lead[] }>({ stages: [], leads: [] })
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const load = async () => {
    try {
      setBoard(await api('/kanban/board', {}, getToken()!))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const leadId = e.active.id as string
    const stageId = e.over?.id as string | undefined
    if (!stageId) return

    const lead = board.leads.find(l => l.id === leadId)
    if (!lead || lead.stage_id === stageId) return

    // optimistic
    setBoard(prev => ({
      ...prev,
      leads: prev.leads.map(l => l.id === leadId ? { ...l, stage_id: stageId } : l),
    }))
    try {
      await api('/kanban/move', {
        method: 'POST',
        body: JSON.stringify({ lead_id: leadId, stage_id: stageId }),
      }, getToken()!)
    } catch { load() }
  }

  if (loading) return <AppShell title="Kanban"><Loading /></AppShell>

  const activeLead = activeId ? board.leads.find(l => l.id === activeId) : null

  return (
    <AppShell title="Pipeline">
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-6 -mx-1 px-1">
          {board.stages.map(s => (
            <Column key={s.id} stage={s} leads={board.leads.filter(l => l.stage_id === s.id)} onCardClick={setSelectedLead} />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead ? <CardItem lead={activeLead} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {selectedLead && <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </AppShell>
  )
}

function Column({ stage, leads, onCardClick }: { stage: Stage; leads: Lead[]; onCardClick: (l: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const isWon = !!stage.is_won
  const isLost = !!stage.is_lost

  return (
    <div className="flex-shrink-0 w-72 flex flex-col max-h-[calc(100vh-180px)]">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
          <h3 className="font-display font-bold text-sm uppercase tracking-wide">{stage.name}</h3>
        </div>
        <span className="text-xs text-text-dim font-semibold bg-bg-2 px-2 py-0.5 rounded-full">{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl border-2 border-dashed p-2 space-y-2 overflow-y-auto transition-colors ${isOver ? 'border-brand bg-brand-soft/50' : 'border-border bg-bg-1/40'}`}
        style={{ minHeight: 200 }}
      >
        {leads.length === 0 ? (
          <div className="text-center py-10 text-text-muted text-xs">
            {isWon ? '🎉' : isLost ? '⚫' : 'Sem leads'}
          </div>
        ) : leads.map(l => <CardItem key={l.id} lead={l} onClick={() => onCardClick(l)} />)}
      </div>
    </div>
  )
}

function CardItem({ lead, onClick, dragging }: { lead: Lead; onClick?: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id: lead.id })
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {}

  const priorityDots: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-zinc-500',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => { if (!isDragging) onClick?.() }}
      className={`bg-bg-1 hover:bg-bg-2 border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-colors shadow-sm ${isDragging ? 'opacity-30' : ''} ${dragging ? 'shadow-2xl ring-2 ring-brand cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDots[lead.priority] || priorityDots.low}`} />
          <div className="font-semibold text-sm leading-tight truncate">{lead.name}</div>
        </div>
        <GripVertical size={14} className="text-text-muted flex-shrink-0 mt-0.5" />
      </div>
      {lead.company && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-dim mb-1.5">
          <Building2 size={10} /> {lead.company}
        </div>
      )}
      <div className="flex flex-wrap gap-1 mb-2">
        {lead.interest && <Badge variant="accent">{lead.interest}</Badge>}
        {lead.service_name && <Badge variant="info">{lead.service_name}</Badge>}
      </div>
      <div className="flex items-center justify-between text-[10px] text-text-muted">
        <span className="flex items-center gap-1"><Calendar size={10} /> {formatDate(lead.created_at)}</span>
        {lead.estimated_value > 0 && <span className="font-bold text-emerald-400">R$ {lead.estimated_value.toLocaleString('pt-BR')}</span>}
      </div>
    </div>
  )
}

function LeadDetailModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null)
  useEffect(() => {
    api(`/leads/${lead.id}`, {}, getToken()!).then(r => setDetail(r.lead)).catch(() => {})
  }, [lead.id])

  return (
    <Modal open onClose={onClose} title={lead.name} size="lg">
      {!detail ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Empresa" value={detail.company} />
            <Field label="Telefone" value={detail.phone} />
            <Field label="E-mail" value={detail.email} />
            <Field label="Interesse" value={detail.interest} />
            <Field label="Origem" value={detail.source} />
            <Field label="Campanha" value={detail.campaign} />
          </div>
          {detail.description && (
            <div>
              <div className="label">Descrição</div>
              <div className="bg-bg-2 px-3 py-2.5 rounded-md text-sm whitespace-pre-wrap">{detail.description}</div>
            </div>
          )}
          <div>
            <div className="label mb-2">Histórico</div>
            <div className="space-y-2 max-h-64 overflow-y-auto pl-3 border-l-2 border-brand">
              {(detail.events || []).map((e: any) => (
                <div key={e.id} className="py-1.5 border-b border-dashed border-border last:border-0">
                  <div className="text-[10px] text-text-muted">{new Date(e.created_at).toLocaleString('pt-BR')}</div>
                  <div className="text-xs">{e.description || e.type}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Field({ label, value }: any) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm">{value || '—'}</div>
    </div>
  )
}
