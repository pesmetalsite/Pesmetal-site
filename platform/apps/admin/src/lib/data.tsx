'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { api, getToken } from './api'

interface CacheEntry<T> {
  data: T
  timestamp: number
  promise?: Promise<T>
}

interface CacheStore {
  [key: string]: CacheEntry<any>
}

interface DataContextValue {
  get: <T>(key: string, fetcher: () => Promise<T>, ttl?: number) => { data: T | null; loading: boolean; refresh: () => void }
  invalidate: (key?: string) => void
}

const DataContext = createContext<DataContextValue | null>(null)
const DEFAULT_TTL = 60_000 // 1 minuto

export function DataProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<CacheStore>({})
  const loadingKeys = useRef<Set<string>>(new Set())

  const invalidate = useCallback((key?: string) => {
    if (key) {
      setCache(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      setCache({})
    }
  }, [])

  // Atualiza cache quando recebe evento realtime
  useEffect(() => {
    let es: EventSource | null = null
    const token = getToken()
    if (!token) return

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://lucid-contentment-production-17bc.up.railway.app'
      es = new EventSource(`${API_URL}/realtime/stream`, {
        // @ts-ignore - headers não suportado nativamente
        headers: { Authorization: `Bearer ${token}` }
      } as EventSourceInit)

      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data)
          // Invalida cache para a entidade que mudou
          const entityKey = ev.entity
          invalidate(entityKey)
        } catch {}
      }

      es.onerror = () => es?.close()
    } catch {}

    return () => es?.close()
  }, [invalidate])

  const get = useCallback(<T,>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DEFAULT_TTL
  ): { data: T | null; loading: boolean; refresh: () => void } => {
    const entry = cache[key]
    const now = Date.now()
    const isFresh = entry && (now - entry.timestamp < ttl)
    const isLoading = loadingKeys.current.has(key)

    if (isFresh && entry) {
      return { data: entry.data as T, loading: false, refresh: () => invalidate(key) }
    }

    if (!isLoading) {
      loadingKeys.current.add(key)
      fetcher().then(data => {
        setCache(prev => ({ ...prev, [key]: { data, timestamp: Date.now() } }))
        loadingKeys.current.delete(key)
      }).catch(() => {
        loadingKeys.current.delete(key)
      })
    }

    return { data: (entry?.data as T) ?? null, loading: true, refresh: () => invalidate(key) }
  }, [cache, invalidate])

  return (
    <DataContext.Provider value={{ get, invalidate }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): { data: T | null; loading: boolean; refresh: () => void } {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx.get(key, fetcher, ttl)
}
