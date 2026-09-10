import type { Metadata } from 'next'
import './site.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://pesmetal.com.br'),
  title: 'PesMetal — Caldeiraria & Soldagem Industrial | Sorocaba/SP',
  description: 'Há mais de 30 anos fabricando caldeiraria pesada, soldagem especializada EPS e projetos industriais em Sorocaba/SP. Indústria, mineração e construção civil em todo o Brasil.',
  keywords: 'caldeiraria pesada, caldeiraria sorocaba, soldagem industrial, soldagem EPS, fabricação industrial, projetos industriais, recuperação de caçambas, dentes CASE, PesMetal',
  openGraph: {
    title: 'PesMetal — Caldeiraria & Soldagem Industrial',
    description: 'Soluções em caldeiraria e soldagem EPS com mais de 30 anos de experiência.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'PesMetal',
    images: ['/images/hero-soldagem.jpg'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://pesmetal.com.br' },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Space+Grotesk:wght@400;500;600&display=swap"
        />
      </head>
      {children}
    </>
  )
}