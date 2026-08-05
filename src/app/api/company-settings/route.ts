import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearCompanySettingsCache } from '@/lib/company-settings'

// GET /api/company-settings — fetch current company settings
export async function GET() {
  try {
    let settings = await db.companySettings.findUnique({
      where: { id: 'default' },
    })

    // Create default if not exists
    if (!settings) {
      settings = await db.companySettings.create({
        data: {
          id: 'default',
          companyName: 'Dhanya Lifestyle LLP',
          location: 'Surat, Gujarat, India',
        },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('GET /api/company-settings error:', error)
    // Return defaults on error
    return NextResponse.json({
      id: 'default',
      companyName: 'Dhanya Lifestyle LLP',
      brandName: null,
      tagline: null,
      location: 'Surat, Gujarat, India',
      phone: null,
      email: null,
      website: null,
      gstNumber: null,
      logoUrl: null,
      primaryColor: null,
    })
  }
}

// PUT /api/company-settings — update company settings
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      companyName,
      brandName,
      tagline,
      location,
      phone,
      email,
      website,
      gstNumber,
      logoUrl,
      primaryColor,
    } = body

    // Upsert — create if doesn't exist, update if it does
    const settings = await db.companySettings.upsert({
      where: { id: 'default' },
      update: {
        ...(companyName !== undefined && { companyName }),
        ...(brandName !== undefined && { brandName: brandName || null }),
        ...(tagline !== undefined && { tagline: tagline || null }),
        ...(location !== undefined && { location }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(website !== undefined && { website: website || null }),
        ...(gstNumber !== undefined && { gstNumber: gstNumber || null }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(primaryColor !== undefined && { primaryColor: primaryColor || null }),
      },
      create: {
        id: 'default',
        companyName: companyName || 'Dhanya Lifestyle LLP',
        brandName: brandName || null,
        tagline: tagline || null,
        location: location || 'Surat, Gujarat, India',
        phone: phone || null,
        email: email || null,
        website: website || null,
        gstNumber: gstNumber || null,
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || null,
      },
    })

    // Clear cache so next PDF generation picks up new values
    clearCompanySettingsCache()

    return NextResponse.json(settings)
  } catch (error) {
    console.error('PUT /api/company-settings error:', error)
    return NextResponse.json({ error: 'Failed to update company settings' }, { status: 500 })
  }
}
