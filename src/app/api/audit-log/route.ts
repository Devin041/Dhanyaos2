import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType')
    const toolName = searchParams.get('toolName')
    const fromDate = searchParams.get('fromDate')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('AuditLog')
      .select('id, entityType, entityNo, action, changes, performedBy, toolName, userMessage, confirmation, createdAt')
      .order('createdAt', { ascending: false })
      .limit(Math.min(limit, 100))

    if (entityType) query = query.eq('entityType', entityType)
    if (toolName) query = query.eq('toolName', toolName)
    if (fromDate) query = query.gte('createdAt', fromDate)

    const { data: logs } = await query

    return NextResponse.json({ logs: logs || [], count: (logs || []).length })
  } catch (err) {
    console.error('[Audit Log API] Error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}
