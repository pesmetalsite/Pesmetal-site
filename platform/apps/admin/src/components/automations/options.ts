import type { AutomationOption } from './types'

export interface SerializedOption {
  id: string
  label: string
  message: string
  stage_id: string
  transfer_human: boolean
}

export function createBlankOption(id?: string): AutomationOption {
  const uid =
    id ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `opt_${Math.random().toString(36).slice(2, 10)}`)
  return { id: uid, label: '', message: '', stage_id: '', transfer_human: false }
}

export function parseOptions(raw: string | null | undefined): AutomationOption[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((o: any, i: number) => ({
      id: o && o.id != null ? String(o.id) : String(i + 1),
      label: o?.label ?? '',
      message: o?.message ?? '',
      stage_id: o?.stage_id ?? '',
      transfer_human: !!o?.transfer_human,
    }))
  } catch {
    return []
  }
}

export function serializeOptions(rows: AutomationOption[]): SerializedOption[] {
  return rows
    .filter((r) => r.label.trim() !== '')
    .map((r, i) => ({
      id: String(i + 1),
      label: r.label.trim(),
      message: r.message,
      stage_id: r.stage_id,
      transfer_human: r.transfer_human,
    }))
}