import { supabase } from '@/lib/supabase-db'
import { NextResponse } from 'next/server'

const _hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export async function GET() {
  try {
    if (!_hasSupabase) return NextResponse.json({ alerts: [], unreadCount: 0 })
    const { data: alerts } = await supabase
      .from('Alert')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(20)

    const unreadCount = (alerts || []).filter((a) => !a.isRead).length

    return NextResponse.json({ alerts: alerts || [], unreadCount })
  } catch (error) {
    console.error('Notifications API error:', error)
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    if (!_hasSupabase) return NextResponse.json({ success: true })
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Alert id is required' },
        { status: 400 }
      )
    }

    await supabase
      .from('Alert')
      .update({ isRead: true })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    )
  }
}
