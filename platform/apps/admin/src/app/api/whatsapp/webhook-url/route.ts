import { NextResponse } from 'next/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-dc3b5.up.railway.app'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'pesmetal-main'
const WEBHOOK_URL = process.env.EVOLUTION_WEBHOOK_URL || 'https://lucid-contentment-production-17bc.up.railway.app/webhook/evolution'

export async function POST() {
  if (!EVOLUTION_API_KEY) {
    return NextResponse.json({ error: 'EVOLUTION_API_KEY não configurada na Vercel' }, { status: 500 })
  }

  try {
    const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: WEBHOOK_URL,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        },
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Evolution API ${response.status}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, url: WEBHOOK_URL, instance: EVOLUTION_INSTANCE })
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 502 })
  }
}
