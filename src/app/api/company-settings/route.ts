import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-db'
import { clearCompanySettingsCache } from '@/lib/company-settings'

// ============================================================================
// Company Settings API — SINGLE DATABASE (Supabase PostgreSQL)
// Migrated off Prisma/SQLite in the single-DB consolidation: the app now has
// exactly ONE database — the live Supabase project. The Supabase row also
// carries extra finance columns (stateCode, defaultGstPercent, bankName,
// bankAccountNo, bankIfsc, termsConditions) managed by FINANCE-MIGRATION.sql;
// this route only reads/writes the branding columns below.
// ============================================================================

const DEFAULTS = {
  id: 'default',
  companyName: 'Dhanya Lifestyle LLP',
  location: 'Surat, Gujarat, India',
} as const

// GET /api/company-settings — fetch current company settings
export async function GET() {
  try {
    let { data: settings } = await supabase
      .from('CompanySettings')
      .select('id, companyName, brandName, tagline, location, phone, email, website, gstNumber, logoUrl, primaryColor')
      .eq('id', 'default')
      .maybeSingle()

    // Create default if not exists
    if (!settings) {
      const { data: created, error } = await supabase
        .from('CompanySettings')
        .insert({ ...DEFAULTS })
        .select('id, companyName, brandName, tagline, location, phone, email, website, gstNumber, logoUrl, primaryColor')
        .single()
      if (error) throw error
      settings = created
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

    // Upsert on id='default' — update if exists, insert if not
    const record: Record<string, string | null> = {
      id: 'default',
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
    }

    const { data: settings, error } = await supabase
      .from('CompanySettings')
      .upsert(record, { onConflict: 'id' })
      .select('id, companyName, brandName, tagline, location, phone, email, website, gstNumber, logoUrl, primaryColor')
      .single()
    if (error) throw error

    // Clear cache so next PDF generation picks up new values
    clearCompanySettingsCache()

    return NextResponse.json(settings)
  } catch (error) {
    console.error('PUT /api/company-settings error:', error)
    return NextResponse.json({ error: 'Failed to update company settings' }, { status: 500 })
  }
}
