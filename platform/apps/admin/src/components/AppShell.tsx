'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, MessageSquare, KanbanSquare, CalendarDays,
  Zap, TrendingUp, BarChart3, Link2, Settings, LogOut, Bell, CheckCheck,
  Users, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, getToken, getUser, clearToken } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useRealtime } from '@/lib/realtime'

const NAV = [
  { section: 'Operação', items: [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/conversas', label: 'Conversas', icon: MessageSquare },
    { path: '/kanban', label: 'Kanban', icon: KanbanSquare },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  ]},
  { section: 'Comercial', items: [
    { path: '/clientes', label: 'Clientes', icon: Users },
    { path: '/orcamentos', label: 'Orçamentos', icon: FileText },
  ]},
  { section: 'Gestão', items: [
    { path: '/automacoes', label: 'Automações', icon: Zap },
    { path: '/marketing', label: 'Marketing', icon: TrendingUp },
    { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  ]},
  { section: 'Sistema', items: [
    { path: '/conexoes', label: 'Conexões', icon: Link2 },
    { path: '/configuracoes', label: 'Configurações', icon: Settings },
  ]},
]

interface Notification { id: string; title?: string; body?: string; created_at?: string; read?: boolean }

export default function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const router = useRouter()
  const [user, setU] = useState<any>(null)
  const [pathname, setPathname] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Notificações
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)
  const [bellEnabled, setBellEnabled] = useState(true)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const u = getUser(); const t = getToken()
    if (!t || !u) { router.replace('/login'); return }
    setU(u)
    setPathname(window.location.pathname)
  }, [router])

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await api('/notifications', {}, getToken()!)
      const list: Notification[] = r.notifications || r.data || (Array.isArray(r) ? r : [])
      setNotifications(list)
      setUnread(list.filter((n) => !n.read).length)
      setBellEnabled(true)
    } catch {
      setBellEnabled(false)
      setBellOpen(false)
    }
  }, [])

  useEffect(() => {
    if (!bellEnabled) return
    fetchNotifications()
    const t = setInterval(fetchNotifications, 15000)
    return () => clearInterval(t)
  }, [fetchNotifications, bellEnabled])

  // realtime: notificações novas chegam imediatamente (sem esperar o poll)
  useRealtime((ev) => {
    if (ev.entity !== 'notifications') return
    fetchNotifications()
  })

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!user) return null

  const logout = () => { clearToken(); router.replace('/login') }
  const initials = (user.name || '?').split(' ').slice(0, 2).map((s: string) => s[0]).join('').toUpperCase()

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method: 'POST' }, getToken()!)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnread(0)
    } catch { /* silencioso */ }
  }

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' }, getToken()!)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      setUnread((u) => Math.max(0, u - 1))
    } catch { /* silencioso */ }
  }

  return (
    <div className="app">
      <aside className={cn('sidebar', sidebarOpen && 'open')}>
        <div className="logo">
          <div className="badge">P</div>
          <div>
            <div className="name">PESMETAL</div>
            <div className="sub">PAINEL COMERCIAL</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {NAV.map((s) => (
            <div key={s.section}>
              <div className="nav-section">{s.section}</div>
              {s.items.map((it) => {
                const Icon = it.icon
                return (
                  <Link
                    key={it.path}
                    href={it.path}
                    prefetch={true}
                    className={cn('nav-item', pathname === it.path && 'active')}
                    onClick={() => { setPathname(it.path); setSidebarOpen(false) }}
                  >
                    <Icon className="icon" />
                    {it.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-dim">v2.0</span>
            <span className="badge badge-success text-[10px]">online</span>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-text-dim hover:text-text w-full">
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="header">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden w-9 h-9 rounded-md hover:bg-bg-2 flex items-center justify-center"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <h1>{title}</h1>
          </div>
          <div className="user">
            {bellEnabled && (
              <div className="relative" ref={bellRef}>
                <button
                  onClick={() => setBellOpen((o) => !o)}
                  className="relative w-9 h-9 rounded-md hover:bg-bg-2 flex items-center justify-center text-text-dim hover:text-text"
                  aria-label="Notificações"
                >
                  <Bell size={18} />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-bg-1 border border-border rounded-xl shadow-[0_16px_40px_rgba(16,24,40,0.14)] z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <span className="font-semibold text-sm">Notificações</span>
                      {unread > 0 && (
                        <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand-dark hover:underline">
                          <CheckCheck size={13} /> Marcar todas como lidas
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="text-center py-10 text-text-muted text-sm">Nenhuma notificação</div>
                      ) : notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={cn(
                            'w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-bg-2 transition-colors',
                            !n.read && 'bg-brand-soft/40',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className={cn('mt-1.5 w-2 h-2 rounded-full flex-shrink-0', n.read ? 'bg-bg-3' : 'bg-brand')} />
                            <div className="min-w-0">
                              {n.title && <div className="text-sm font-semibold text-text">{n.title}</div>}
                              {n.body && <div className="text-xs text-text-dim mt-0.5">{n.body}</div>}
                              {n.created_at && (
                                <div className="text-[10px] text-text-muted mt-1">{formatDate(n.created_at, true)}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-right">
              <div className="font-semibold text-sm">{user.name}</div>
              <div className="text-[11px] text-text-dim capitalize">{user.role}</div>
            </div>
            <div className="avatar">{initials}</div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
