'use client'
import { useState, useEffect } from 'react'
import { X, MessageSquare, Star, Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface NotificationPopup {
  id: string
  type: string
  title: string
  body: string
  data?: any
  created_at: string
}

interface NotificationPopupProps {
  notification: NotificationPopup
  onClose: () => void
}

function NotificationPopup({ notification, onClose }: NotificationPopupProps) {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const handleClick = () => {
    if (notification.data?.conversation_id) {
      router.push(`/whatsapp?chat=${notification.data.conversation_id}`)
    }
    onClose()
  }

  const getIcon = () => {
    if (notification.type === 'new_message_popup') {
      return <MessageSquare size={20} className="text-brand" />
    }
    if (notification.type === 'new_lead') {
      return <Star size={20} className="text-yellow-500" />
    }
    return <Bell size={20} className="text-text-muted" />
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 bg-bg-1 border border-border rounded-xl shadow-2xl overflow-hidden animate-slide-up cursor-pointer hover:border-brand transition-colors"
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-2 border-b border-border">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-xs font-semibold text-text-dim uppercase tracking-wide">Nova Mensagem</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-1 rounded-lg hover:bg-bg-1 transition-colors"
        >
          <X size={14} className="text-text-muted" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        <p className="text-sm font-semibold text-text truncate">{notification.title}</p>
        <p className="text-xs text-text-dim mt-1 line-clamp-2">{notification.body}</p>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 bg-brand/5 border-t border-border">
        <p className="text-[10px] text-brand font-medium">Clique para abrir a conversa</p>
      </div>
    </div>
  )
}

interface NotificationPopupContainerProps {
  className?: string
}

export default function NotificationPopupContainer({ className = '' }: NotificationPopupContainerProps) {
  const [notifications, setNotifications] = useState<NotificationPopup[]>([])
  const router = typeof window !== 'undefined' ? useRouter() : null

  useEffect(() => {
    // Polling para notificações não lidas
    const fetchNotifications = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await fetch('/api/notifications?unread=true&limit=5', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const newNotifs = (data.notifications || []).filter(
            (n: any) => n.type === 'new_message_popup' || n.type === 'new_lead'
          )

          // Adicionar novos popups (evitar duplicatas)
          setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id))
            const toAdd = newNotifs.filter((n: any) => !existingIds.has(n.id))
            return [...prev, ...toAdd.slice(0, 3)] // Máximo 3 popups simultâneos
          })
        }
      } catch {}
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 10000) // Poll a cada 10s
    return () => clearInterval(interval)
  }, [])

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (notifications.length === 0) return null

  return (
    <div className={className}>
      {notifications.map((notification) => (
        <NotificationPopup
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  )
}
