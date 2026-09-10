import type { Metadata } from 'next'
import './globals.css'
import { DataProvider } from '@/lib/data'

export const metadata: Metadata = {
  title: 'PESMETAL Admin — Painel Comercial',
  description: 'Painel administrativo da PesMetal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  )
}