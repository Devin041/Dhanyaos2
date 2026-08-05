import { db } from '@/lib/db'

export interface CompanySettings {
  id: string
  companyName: string
  brandName: string | null
  tagline: string | null
  location: string
  phone: string | null
  email: string | null
  website: string | null
  gstNumber: string | null
  logoUrl: string | null
  primaryColor: string | null
}

// In-memory cache to avoid hitting DB on every PDF generation
let _cache: CompanySettings | null = null
let _cacheTime = 0
const CACHE_TTL = 60 * 1000 // 1 minute

/**
 * Get company settings (with caching).
 * Returns default values if settings table is empty.
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  // Check cache
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache
  }

  try {
    const settings = await db.companySettings.findUnique({
      where: { id: 'default' },
    })

    if (settings) {
      _cache = settings as unknown as CompanySettings
      _cacheTime = Date.now()
      return _cache
    }
  } catch {
    // DB might not be ready — use defaults
  }

  // Fallback defaults
  const defaults: CompanySettings = {
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
  }

  _cache = defaults
  _cacheTime = Date.now()
  return defaults
}

/**
 * Get the display name for PDFs — uses brandName if set, otherwise companyName.
 */
export async function getCompanyName(): Promise<string> {
  const s = await getCompanySettings()
  return s.brandName || s.companyName
}

/**
 * Clear the cache (call after updating settings).
 */
export function clearCompanySettingsCache() {
  _cache = null
  _cacheTime = 0
}
