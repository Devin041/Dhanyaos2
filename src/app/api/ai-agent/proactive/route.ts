import { NextResponse } from 'next/server'
import { getProactiveAlerts } from '@/lib/agent/proactive-engine'
import { alertCache } from '@/lib/agent/cache'

const CACHE_KEY = 'proactive_alerts'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET() {
  try {
    // Check cache first
    const cached = alertCache.get(CACHE_KEY)
    if (cached) {
      return NextResponse.json(cached)
    }

    const alerts = await getProactiveAlerts()

    // Cache the result
    alertCache.set(CACHE_KEY, alerts, CACHE_TTL)

    return NextResponse.json(alerts)
  } catch (err) {
    console.error('[Proactive API] Error:', err)
    return NextResponse.json([], { status: 200 }) // Return empty on error, not 500
  }
}