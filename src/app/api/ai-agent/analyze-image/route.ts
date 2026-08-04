import { NextRequest, NextResponse } from 'next/server'

// ─── Garment-specific VLM system prompt ─────────────────────────────────────

const GARMENT_VLM_PROMPT = `You are an expert garment manufacturing analyst for Dhanya Lifestyle LLP, a women's ethnic wear manufacturer in Ahmedabad.

When analyzing images, focus on:
1. **Fabric Analysis**: Type (cotton, silk, chiffon, georgette, etc.), weave pattern, color, print/design
2. **Defect Detection**: If visible — staining, holes, color mismatch, stitching issues, print misalignment, fabric pilling
3. **Style Analysis**: Garment type (kurti, saree, lehenga, suit set, etc.), neckline, sleeve type, embroidery/work
4. **Quality Assessment**: Overall quality rating, specific issues if any
5. **Production Relevance**: How this relates to production — matching styles, fabric comparison, etc.

Respond in Hinglish (Hindi-English mix) unless the user asks in English.
Be specific and practical — factory workers need actionable insights.`

// ─── POST — Image analysis via VLM ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { image, question, format } = await request.json()

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Base64 image data is required' },
        { status: 400 }
      )
    }

    // Check image size (max 20MB)
    const buffer = Buffer.from(image, 'base64')
    const sizeMB = buffer.length / (1024 * 1024)

    if (sizeMB > 20) {
      return NextResponse.json(
        { error: 'Image too large (max 20MB)' },
        { status: 400 }
      )
    }

    // Determine MIME type
    const mimeMap: Record<string, string> = {
      '/9j/': 'image/jpeg',
      'iVBOR': 'image/png',
      'R0lGOD': 'image/gif',
      'UklGR': 'image/webp',
    }
    let mimeType = 'image/jpeg'
    for (const [prefix, mime] of Object.entries(mimeMap)) {
      if (image.startsWith(prefix)) {
        mimeType = mime
        break
      }
    }

    // If it's already a data URI, extract mime and base64
    let base64Data = image
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mimeType = match[1]
        base64Data = match[2]
      }
    }

    const imageUrl = `data:${mimeType};base64,${base64Data}`
    const userQuestion = question || 'Is image ko analyze karo — fabric type, design, quality, aur koi issues dikh rahe hain?'

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${GARMENT_VLM_PROMPT}\n\nUser's question: ${userQuestion}`,
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })

    const analysis = (response as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content || 'Image analysis me dikkat aa gayi. Dobara try karo.'

    return NextResponse.json({
      success: true,
      analysis,
      mimeType,
      imageSizeMB: Math.round(sizeMB * 100) / 100,
    })
  } catch (error) {
    console.error('[VLM] Image analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image analysis failed' },
      { status: 500 }
    )
  }
}