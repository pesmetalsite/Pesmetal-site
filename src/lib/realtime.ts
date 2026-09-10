'use client'
import { useEffect, useRef } from 'react'
import { API_URL, getToken } from './api'

export interface RealtimeEvent {
  entity: string
  action: 'created' | 'updated' | 'deleted'
  data: Record<string, any>
  ts: string
}

type Handler = (ev: RealtimeEvent) => void

let sharedController: AbortController | null = null
const handlers = new Set<Handler>()
let retryTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let started = false

function connect() {
  if (sharedController) return
  const token = getToken()
  if (!token) return
  const controller = new AbortController()
  sharedController = controller

  const stream = async () => {
    try {
      const res = await fetch(`${API_URL}/realtime/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`realtime ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as RealtimeEvent
            handlers.forEach(h => { try { h(ev) } catch { /* listener error */ } })
          } catch { /* ignore malformed */ }
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted) return
      // reconexão controlada com backoff (evita loop infinito)
      reconnectDelay = Math.min(reconnectDelay * 2, 15000)
      retryTimer = setTimeout(() => { sharedController = null; connect() }, reconnectDelay)
    }
  }

  stream()
}

function disconnect() {
  if (retryTimer) clearTimeout(retryTimer)
  if (sharedController) { sharedController.abort(); sharedController = null }
}

function ensureConnected() {
  if (!started) {
    started = true
    window.addEventListener('online', () => { reconnectDelay = 1000; connect() })
    window.addEventListener('offline', disconnect)
  }
  connect()
}

/** Assina eventos realtime com cleanup automático e dedupe de subscription. */
export function useRealtime(onEvent: (ev: RealtimeEvent) => void, entities?: string[]) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const h: Handler = (ev) => {
      if (entities && entities.length > 0 && !entities.includes(ev.entity)) return
      handlerRef.current(ev)
    }
    handlers.add(h)
    ensureConnected()
    return () => { handlers.delete(h) }
  }, [entities?.join(',')])
}