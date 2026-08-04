import { NextRequest, NextResponse } from 'next/server'

// ─── POST — Audio transcription via ASR ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { audio } = await request.json()

    if (!audio || typeof audio !== 'string') {
      return NextResponse.json(
        { error: 'Base64 audio data is required' },
        { status: 400 }
      )
    }

    // Decode base64 to check size (max 10MB)
    const buffer = Buffer.from(audio, 'base64')
    const sizeMB = buffer.length / (1024 * 1024)

    if (sizeMB > 10) {
      return NextResponse.json(
        { error: 'Audio file too large (max 10MB)' },
        { status: 400 }
      )
    }

    if (sizeMB < 0.001) {
      return NextResponse.json(
        { error: 'Audio too short, please speak for at least 1 second' },
        { status: 400 }
      )
    }

    // Use z-ai-web-dev-sdk for transcription
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const response = await zai.audio.asr.create({
      file_base64: audio,
    })

    const transcription = (response as { text?: string }).text || ''

    if (!transcription.trim()) {
      return NextResponse.json(
        { error: 'Could not understand audio. Please try again.' },
        { status: 422 }
      )
    }

    // Clean transcription
    const cleaned = transcription
      .replace(/\s+/g, ' ')
      .trim()

    return NextResponse.json({
      success: true,
      transcription: cleaned,
      original: transcription,
      audioSizeMB: Math.round(sizeMB * 100) / 100,
    })
  } catch (error) {
    console.error('[ASR] Transcription error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}