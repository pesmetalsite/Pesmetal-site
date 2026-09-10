'use client'
import { DataProvider } from '@/lib/data'
import NotificationPopup from '@/components/NotificationPopup'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      {children}
      <NotificationPopup />
    </DataProvider>
  )
}
