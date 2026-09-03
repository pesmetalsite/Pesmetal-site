import { NextResponse } from 'next/server'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-dc3b5.up.railway.app'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'd024ea7bb4eecab457678225503d1b9cef60373d741c10afaeed4ffc59a5fa75'
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'pesmetal-main'

export async function GET() {
  if (!EVOLUTION_API_KEY || !EVOLUTION_API_URL) {
    return NextResponse.json({ state: 'unconfigured', configured: false })
  }

  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      cache: 'no-store',
    })
    if (!r.ok) {
      return NextResponse.json({ state: 'error', configured: true, error: `Evolution API ${r.status}` })
    }
    const data = await r.json()
    return NextResponse.json({
      state: data?.instance?.state ?? 'unknown',
      configured: true,
      instance: EVOLUTION_INSTANCE,
    })
  } catch (e: any) {
    return NextResponse.json({ state: 'error', configured: true, error: String(e?.message || e) })
  }
}
