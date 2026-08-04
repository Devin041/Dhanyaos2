import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId, conversationId, feedback, category, note, userMessage, agentResponse, factCardData, toolName } = body

    if (!feedback || !['positive', 'negative'].includes(feedback)) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 })
    }

    await supabase.from('AgentFeedback').insert({
      messageId: messageId || null,
      conversationId: conversationId || null,
      toolName: toolName || null,
      feedbackType: feedback,
      feedbackCategory: category || null,
      feedbackNote: note || null,
      userMessage: userMessage || null,
      agentResponse: agentResponse || null,
      factCardData: factCardData ? JSON.stringify(factCardData) : null,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Feedback API] Error:', err)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
