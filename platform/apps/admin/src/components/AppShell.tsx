'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, KanbanSquare, MessageSquare, CalendarDays,
  Zap, FileText, Wrench, Building2, TrendingUp, Settings, LogOut,
  Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, getToken, getUser, clearToken } from '@/lib/api'

const NAV = [
  { section: 'Operação', items: [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/leads', label: 'Leads', icon: Users },
    { path: '/kanban', label: 'Kanban', icon: KanbanSquare },
    { path: '/conversas', label: 'Conversas', icon: MessageSquare },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  ]},
  { section: 'Gestão', items: [
    { path: '/conexoes', label: 'Conexões', icon: Link2 },
    { path: '/automacoes', label: 'Automações', icon: Zap },
    { path: '/orcamentos', label: 'Orçamentos', icon: FileText },
    { path: '/servicos', label: 'Serviços', icon: Wrench },
    { path: '/projetos', label: 'Projetos', icon: Building2 },
  ]},
  { section: 'Inteligência', items: [
    { path: '/marketing', label: 'Marketing', icon: TrendingUp },
    { path: '/configuracoes', label: 'Configurações', icon: Settings },
  ]},
]

export default function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const router = useRouter()
  const [user, setU] = useState<any>(null)
  const [pathname, setPathname] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const u = getUser(); const t = getToken()
    if (!t || !u) { router.replace('/login'); return }
    setU(u)
    setPathname(window.location.pathname)
  }, [router])

  if (!user) return null

  const logout = () => { clearToken(); router.replace('/login') }
  const initials = (user.name || '?').split(' ').slice(0, 2).map((s: string) => s[0]).join('').toUpperCase()

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
