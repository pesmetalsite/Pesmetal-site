import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PESMETAL Admin — Painel Comercial',
  description: 'Painel administrativo da Pes Metal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}