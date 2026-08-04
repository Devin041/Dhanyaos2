import { NextRequest, NextResponse } from 'next/server'

// ─── TTS text chunking (max 1024 chars per request) ─────────────────────────

function splitTextIntoChunks(text: string, maxLength = 1000): string[] {
  const chunks: string[] = []
  const sentences = text.match(/[^.!?।\n]+[.!?।]*/g) || [text]

  let currentChunk = ''
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence
    } else {
      if (currentChunk) chunks.push(currentChunk.trim())
      // If single sentence exceeds max, split by comma
      if (sentence.length > maxLength) {
        const parts = sentence.split(/[,;،]/)
        let subChunk = ''
        for (const part of parts) {
          if ((subChunk + part).length <= maxLength) {
            subChunk += part + ','
          } else {
            if (subChunk) chunks.push(subChunk.trim())
            subChunk = part + ','
          }
        }
        if (subChunk) currentChunk = subChunk
      } else {
        currentChunk = sentence
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim())

  return chunks
}

// ─── POST — Text to speech via TTS ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { text, voice = 'tongtong', speed = 1.0 } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    // Clean text for speech — remove markdown, URLs, special chars
    let cleanText = text
      .replace(/```[\s\S]*?```/g, '')       // Remove code blocks
      .replace(/`[^`]+`/g, '')              // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
      .replace(/[#*_~>|]/g, '')             // Remove markdown formatting
      .replace(/https?:\/\/\S+/g, '')       // Remove URLs
      .replace(/\n+/g, '. ')               // Newlines to sentences
      .replace(/\s+/g, ' ')
      .trim()

    // Further clean for TTS (remove emojis, special chars)
    cleanText = cleanText
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[^\w\s.,!?;:'"\-₹%/()।\-–—]/g, '')
      .trim()

    if (!cleanText) {
      return NextResponse.json(
        { error: 'No speakable text after cleaning' },
        { status: 400 }
      )
    }

    // Truncate to first ~3000 chars (3 chunks max) to avoid excessive processing
    if (cleanText.length > 3000) {
      const lastPeriod = cleanText.lastIndexOf('.', 3000)
      cleanText = cleanText.substring(0, lastPeriod > 0 ? lastPeriod + 1 : 3000)
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const chunks = splitTextIntoChunks(cleanText, 1000)
    const audioBuffers: Buffer[] = []

    for (const chunk of chunks) {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice: voice as string,
        speed: Math.max(0.5, Math.min(2.0, speed)),
        response_format: 'wav',
        stream: false,
      })

      const arrayBuffer = await (response as Response).arrayBuffer()
      const buffer = Buffer.from(new Uint8Array(arrayBuffer))
      audioBuffers.push(buffer)
    }

    // Concatenate WAV files (skip headers after first)
    let combinedBuffer: Buffer
    if (audioBuffers.length === 1) {
      combinedBuffer = audioBuffers[0]
    } else {
      // Simple concatenation: take first file's header + all data sections
      const WAV_HEADER_SIZE = 44
      const dataParts: Buffer[] = []

      // First file: full header
      dataParts.push(audioBuffers[0].subarray(0, WAV_HEADER_SIZE))

      // All files: data payload (skip 44-byte header)
      let totalDataSize = 0
      for (const buf of audioBuffers) {
        const dataChunk = buf.subarray(WAV_HEADER_SIZE)
        dataParts.push(dataChunk)
        totalDataSize += dataChunk.length
      }

      // Fix the header's file size and data size fields
      const header = Buffer.from(audioBuffers[0].subarray(0, WAV_HEADER_SIZE))
      // RIFF chunk size (file size - 8): offset 4, 4 bytes LE
      header.writeUInt32LE(totalDataSize + WAV_HEADER_SIZE - 8, 4)
      // data chunk size: offset 40, 4 bytes LE
      header.writeUInt32LE(totalDataSize, 40)

      combinedBuffer = Buffer.concat([header, ...dataParts.slice(1)])
    }

    return new NextResponse(combinedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': combinedBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[TTS] Speech generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Speech generation failed' },
      { status: 500 }
    )
  }
}