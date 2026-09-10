'use client'
import { useEffect, useRef } from 'react'
import { getToken } from './api'

export interface RealtimeEvent {
  entity: string
  action: 'created' | 'updated' | 'deleted'
  data: Record<string, any>
  ts: string
}

type Handler = (ev: RealtimeEvent) => void

const handlers = new Set<Handler>()
let pollTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let started = false
let isVisible = true

function getAPI() {
  return (typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_API_URL)
    || process.env.NEXT_PUBLIC_API_URL
    || 'https://lucid-contentment-production-17bc.up.railway.app'
}

async function poll() {
  const token = getToken()
  if (!token) return

  try {
    const res = await fetch(`${getAPI()}/realtime/events`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!res.ok) throw new Error(`realtime ${res.status}`)

    const events: RealtimeEvent[] = await res.json()

    // Encontrar o mais recente por entidade
    const latestByEntity: Record<string, RealtimeEvent> = {}
    for (const ev of events) {
      if (!latestByEntity[ev.entity] || new Date(ev.ts) > new Date(latestByEntity[ev.entity].ts)) {
        latestByEntity[ev.entity] = ev
      }
    }

    Object.values(latestByEntity).forEach(ev => {
      handlers.forEach(h => { try { h(ev) } catch {} })
    })
  } catch {}
}

function startPolling() {
  if (pollTimer) return

  // Poll inicial
  poll()

  // Poll a cada 5 segundos quando visível
  pollTimer = setInterval(() => {
    if (isVisible) poll()
  }, 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** Hook que notifica handlers quando dados mudam no backend */
export function useRealtime(onEvent: (ev: RealtimeEvent) => void, entities?: string[]) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const h: Handler = (ev) => {
      if (entities && entities.length > 0 && !entities.includes(ev.entity)) return
      handlerRef.current(ev)
    }
    handlers.add(h)

    if (!started) {
      started = true

      // Detectar visibilidade da aba
      const handleVisibility = () => {
        isVisible = !document.hidden
        if (isVisible) poll() // Poll imediato ao voltar
      }
      document.addEventListener('visibilitychange', handleVisibility)
    }

    startPolling()

    return () => {
      handlers.delete(h)
      // Não para o polling - outros handlers podem precisar
    }
  }, [entities?.join(',')])
}
