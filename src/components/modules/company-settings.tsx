'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, MapPin, Phone, Mail, Globe, Save, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Settings {
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

export function CompanySettingsModule() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/company-settings')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSettings(data)
    } catch {
      toast.error('Failed to load company settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        const updated = await res.json()
        setSettings(updated)
        toast.success('Company settings saved successfully!')
      } else {
        toast.error('Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof Settings, value: string) => {
    setSettings(prev => prev ? { ...prev, [field]: value || null } : null)
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Failed to load settings</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Company Settings</h1>
          <p className="text-xs text-muted-foreground">
            White-label configuration — customize branding for your brand or any other company
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
        <AlertCircle className="h-5 w-5 shrink-0 text-sky-400 mt-0.5" />
        <div className="text-xs">
          <p className="font-semibold text-sky-400">White-Label Ready</p>
          <p className="text-muted-foreground mt-1">
            These settings are used in all PDFs (catalog, negotiation, AI reports), the UI header, and footer.
            Change company name, location, and branding — every PDF will automatically reflect the new values.
            Other brands can use this software by simply updating these fields.
          </p>
        </div>
      </div>

      {/* Company Info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name <span className="text-red-400">*</span></Label>
              <Input
                id="companyName"
                value={settings.companyName || ''}
                onChange={(e) => update('companyName', e.target.value)}
                placeholder="e.g. Dhanya Lifestyle LLP"
              />
              <p className="text-[10px] text-muted-foreground">Legal entity name shown in PDFs</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandName">Brand Name (optional)</Label>
              <Input
                id="brandName"
                value={settings.brandName || ''}
                onChange={(e) => update('brandName', e.target.value)}
                placeholder="e.g. Elysé"
              />
              <p className="text-[10px] text-muted-foreground">If set, replaces company name in PDF headers</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline (optional)</Label>
            <Input
              id="tagline"
              value={settings.tagline || ''}
              onChange={(e) => update('tagline', e.target.value)}
              placeholder="e.g. Premium Ethnic Wear"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Location <span className="text-red-400">*</span>
            </Label>
            <Input
              id="location"
              value={settings.location || ''}
              onChange={(e) => update('location', e.target.value)}
              placeholder="e.g. Surat, Gujarat, India"
            />
            <p className="text-[10px] text-muted-foreground">Shown at the bottom of PDFs</p>
          </div>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </Label>
              <Input
                id="phone"
                value={settings.phone || ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={settings.email || ''}
                onChange={(e) => update('email', e.target.value)}
                placeholder="e.g. info@dhanya.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Website
              </Label>
              <Input
                id="website"
                value={settings.website || ''}
                onChange={(e) => update('website', e.target.value)}
                placeholder="e.g. www.dhanya.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                value={settings.gstNumber || ''}
                onChange={(e) => update('gstNumber', e.target.value)}
                placeholder="e.g. 24ABCDE1234F1Z5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Branding & Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Logo URL (optional)</Label>
            <Input
              id="logoUrl"
              value={settings.logoUrl || ''}
              onChange={(e) => update('logoUrl', e.target.value)}
              placeholder="e.g. https://res.cloudinary.com/..."
            />
            <p className="text-[10px] text-muted-foreground">URL to your company logo (shown in PDFs if set)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primaryColor">Primary Color (optional)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="primaryColor"
                value={settings.primaryColor || ''}
                onChange={(e) => update('primaryColor', e.target.value)}
                placeholder="e.g. #C9A227"
                className="flex-1"
              />
              <div
                className="h-9 w-9 shrink-0 rounded-lg border"
                style={{ backgroundColor: settings.primaryColor || '#C9A227' }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Hex color for headers/accents in PDFs</p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => fetchSettings()}
          disabled={saving}
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {/* Preview */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="text-sm">PDF Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-primary p-6 text-center">
            <p className="text-xl font-bold text-primary-foreground">
              {settings.brandName || settings.companyName}
            </p>
            {settings.tagline && (
              <p className="mt-1 text-sm text-primary-foreground/70">{settings.tagline}</p>
            )}
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/40" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/40" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/40" />
            </div>
            <p className="mt-3 text-sm font-medium text-primary-foreground">PRODUCT LIST</p>
          </div>
          <div className="mt-3 text-center">
            <p className="text-xs text-muted-foreground">{settings.location}</p>
            {(settings.phone || settings.email || settings.website) && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {settings.phone && settings.phone}
                {settings.phone && settings.email && ' · '}
                {settings.email && settings.email}
                {(settings.phone || settings.email) && settings.website && ' · '}
                {settings.website && settings.website}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
