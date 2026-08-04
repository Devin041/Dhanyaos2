'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Camera, Plus, Trash2, Search, X, Download, Send,
  ImagePlus, ChevronRight, Eye, Loader2, Package,
  Filter, Calendar, Building2, Grid3x3, List,
  CheckCircle2, ArrowLeft, FileSpreadsheet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useDashboardStore } from '@/store/dashboard-store'
import { useQuotationDraftStore } from '@/store/quotation-draft-store'
import { SampleCatalogNegotiation, type NegotiationSample } from './sample-catalog-negotiation'

// ─── Types ─────────────────────────────────────────────────────────

interface SamplePhoto {
  id: string
  imageUrl: string
  caption: string
  sortOrder: number
}

interface Sample {
  id: string
  sampleNo: string
  styleNo: string
  styleName: string
  customerId: string | null
  customer: { id: string; companyName: string } | null
  stage: string
  status: string
  notes: string
  photoCount: number
  createdAt: string
  photos?: SamplePhoto[]
}

interface Customer {
  id: string
  companyName: string
}

interface CatalogItem {
  id: string
  sample: { id: string; sampleNo: string; styleNo: string; styleName: string }
}

interface SampleCatalog {
  id: string
  catalogNo: string
  customerId: string
  customer: { id: string; companyName: string }
  sentDate: string
  status: string
  notes: string
  items: CatalogItem[]
}

// ─── Main Module ──────────────────────────────────────────────────

export function SampleCatalogModule() {
  const { setActiveView } = useDashboardStore()
  const { setDraft } = useQuotationDraftStore()

  // State
  const [samples, setSamples] = useState<Sample[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [catalogs, setCatalogs] = useState<SampleCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Dialogs
  const [showNewSample, setShowNewSample] = useState(false)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)
  const [showPhotoViewer, setShowPhotoViewer] = useState(false)
  const [showSendCatalog, setShowSendCatalog] = useState(false)

  // Active items
  const [activeSample, setActiveSample] = useState<Sample | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [viewingPhotos, setViewingPhotos] = useState<SamplePhoto[]>([])
  const [viewingIndex, setViewingIndex] = useState(0)

  // New sample form
  const [newStyleNo, setNewStyleNo] = useState('')
  const [newStyleName, setNewStyleName] = useState('')
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [autoStyleId, setAutoStyleId] = useState('')

  // Send catalog form
  const [sendCustomerId, setSendCustomerId] = useState('')
  const [sendNotes, setSendNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Negotiation mode
  const [negotiationMode, setNegotiationMode] = useState(false)
  const [costSheetMap, setCostSheetMap] = useState<Record<string, { id: string; sheetNo: string; totalCost: number; sellingPrice: number; profitPercent: number; image: string | null; status: string }>>({})

  // ─── Data Fetching ───────────────────────────────────────────────

  const fetchSamples = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/samples?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSamples(data)
      }
    } catch (err) {
      console.error('Fetch samples error:', err)
    }
  }, [searchQuery, statusFilter])

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) {
        const data = await res.json()
        // API returns { customers: [...], total: N }
        const list = Array.isArray(data) ? data : (data.customers || [])
        setCustomers(list)
      }
    } catch (err) {
      console.error('Fetch customers error:', err)
    }
  }, [])

  const fetchCatalogs = useCallback(async () => {
    try {
      const res = await fetch('/api/sample-catalogs')
      if (res.ok) {
        const data = await res.json()
        setCatalogs(data)
      }
    } catch (err) {
      console.error('Fetch catalogs error:', err)
    }
  }, [])

  const fetchCostSheets = useCallback(async () => {
    try {
      const res = await fetch('/api/cost-sheets')
      if (res.ok) {
        const data = await res.json()
        const sheets = data.costSheets || []
        const map: Record<string, { id: string; sheetNo: string; totalCost: number; sellingPrice: number; profitPercent: number; image: string | null; status: string }> = {}
        for (const s of sheets) {
          map[s.styleNo] = {
            id: s.id,
            sheetNo: s.sheetNo,
            totalCost: s.totalCost,
            sellingPrice: s.sellingPrice,
            profitPercent: s.profitPercent ?? 0,
            image: s.image,
            status: s.status,
          }
        }
        setCostSheetMap(map)
      }
    } catch { /* ignore */ }
  }, [])

  // Auto-generate unique Style ID when New Sample dialog opens
  const openNewSampleDialog = async () => {
    setShowNewSample(true)
    setNewStyleNo('')
    setNewStyleName('')
    setNewCustomerId('')
    setNewNotes('')
    try {
      const res = await fetch('/api/samples?nextStyleNo=1')
      if (res.ok) {
        const data = await res.json()
        setNewStyleNo(data.nextStyleNo)
        setAutoStyleId(data.nextStyleNo)
      }
    } catch { /* fallback: user types manually */ }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchSamples(), fetchCustomers(), fetchCatalogs(), fetchCostSheets()])
      setLoading(false)
    }
    load()
  }, [fetchSamples, fetchCustomers, fetchCatalogs, fetchCostSheets])

  // ─── Handlers ───────────────────────────────────────────────────

  const handleCreateSample = async () => {
    if (!newStyleNo.trim() || !newStyleName.trim()) {
      toast.error('Style No and Style Name are required')
      return
    }
    try {
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleNo: newStyleNo,
          styleName: newStyleName,
          customerId: newCustomerId || undefined,
          notes: newNotes,
        }),
      })
      if (res.ok) {
        toast.success('Sample created!')
        setShowNewSample(false)
        setNewStyleNo('')
        setNewStyleName('')
        setNewCustomerId('')
        setNewNotes('')
        fetchSamples()
      }
    } catch {
      toast.error('Failed to create sample')
    }
  }

  const processAndUploadFiles = async (files: File[]) => {
    if (!activeSample || files.length === 0) return
    setUploading(true)
    try {
      const photos: { imageUrl: string; caption: string }[] = []
      for (const file of files) {
        const compressed = await compressImage(file, 1200, 0.85)
        photos.push({ imageUrl: compressed, caption: '' })
      }

      const res = await fetch(`/api/samples/${activeSample.id}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos }),
      })
      if (res.ok) {
        toast.success(`${photos.length} photo${photos.length > 1 ? 's' : ''} uploaded!`)
        fetchSamples()
        const detailRes = await fetch(`/api/samples/${activeSample.id}`)
        if (detailRes.ok) {
          setActiveSample(await detailRes.json())
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        toast.error(err.error || 'Failed to upload photos')
      }
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload photos')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processAndUploadFiles(Array.from(e.target.files))
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) processAndUploadFiles(files)
  }

  const handleDeletePhoto = async (photoId: string) => {
    if (!activeSample) return
    try {
      const res = await fetch(`/api/samples/${activeSample.id}/photos/${photoId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Photo deleted')
        const detailRes = await fetch(`/api/samples/${activeSample.id}`)
        if (detailRes.ok) setActiveSample(await detailRes.json())
        fetchSamples()
      }
    } catch {
      toast.error('Failed to delete photo')
    }
  }

  const handleDeleteSample = async (sampleId: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Sample deleted')
        if (activeSample?.id === sampleId) setActiveSample(null)
        fetchSamples()
      }
    } catch {
      toast.error('Failed to delete sample')
    }
  }

  const handleSendCatalog = async () => {
    if (!sendCustomerId || selectedPhotos.length === 0) {
      toast.error('Select a client and at least one sample')
      return
    }
    setSending(true)
    try {
      // Get sample IDs from selected photos
      const sampleIds = [...new Set(selectedPhotos)]
      const res = await fetch('/api/sample-catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: sendCustomerId,
          sampleIds,
          notes: sendNotes,
        }),
      })
      if (res.ok) {
        const catalog = await res.json()
        toast.success(`Catalog ${catalog.catalogNo} sent!`)
        setShowSendCatalog(false)
        setSelectedPhotos([])
        setSendCustomerId('')
        setSendNotes('')
        fetchCatalogs()
      }
    } catch {
      toast.error('Failed to send catalog')
    }
    setSending(false)
  }

  const toggleSampleSelection = (sampleId: string) => {
    setSelectedPhotos(prev =>
      prev.includes(sampleId) ? prev.filter(id => id !== sampleId) : [...prev, sampleId]
    )
  }

  // ─── Create Quotation from Selected Samples ────────────────────────
  const handleCreateQuotation = () => {
    if (selectedPhotos.length === 0) return

    const selectedSamples = samples.filter(s => selectedPhotos.includes(s.id))
    if (selectedSamples.length === 0) {
      toast.error('No valid samples selected')
      return
    }

    const draftItems = selectedSamples.map(s => ({
      styleName: s.styleName || s.styleNo,
      styleNo: s.styleNo || '',
      sampleId: s.id,
      quantity: 1,
      unitPrice: 0,
      unitCost: 0,
      itemDiscountPercent: 0,
    }))

    // Find common customer if all selected samples share one
    const customerIds = new Set(selectedSamples.map(s => s.customerId).filter(Boolean))
    const customerId = customerIds.size === 1 ? (customerIds.values().next().value as string) : null

    setDraft(draftItems, customerId)
    setSelectedPhotos([])
    setActiveView('quotations')
    toast.success(`${selectedSamples.length} pieces sent to Quotation`)
  }

  const openPhotoViewer = async (sampleId: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`)
      if (res.ok) {
        const sample = await res.json()
        if (sample.photos && sample.photos.length > 0) {
          setViewingPhotos(sample.photos)
          setViewingIndex(0)
          setShowPhotoViewer(true)
        }
      }
    } catch {
      toast.error('Failed to load photos')
    }
  }

  // ─── Status Badge ────────────────────────────────────────────────

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'Submitted': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'Approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'Rejected': return 'bg-red-100 text-red-700 border-red-200'
      case 'Ready': return 'bg-purple-100 text-purple-700 border-purple-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  // Negotiation mode — show negotiation view
  if (negotiationMode) {
    const selectedNegSamples: NegotiationSample[] = samples
      .filter(s => selectedPhotos.includes(s.id))
      .map(s => ({
        id: s.id,
        sampleNo: s.sampleNo,
        styleNo: s.styleNo,
        styleName: s.styleName,
        customerId: s.customerId,
        customer: s.customer,
        photoCount: s.photoCount,
        status: s.status,
        costSheet: costSheetMap[s.styleNo] || null,
      }))

    return (
      <SampleCatalogNegotiation
        selectedSamples={selectedNegSamples}
        onBack={() => setNegotiationMode(false)}
        onComplete={() => {
          setNegotiationMode(false)
          setSelectedPhotos([])
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Sample Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Upload sample photos, create catalogs, and send to clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPhotos.length > 0 && (
            <>
              <Button
                onClick={() => {
                  if (selectedPhotos.length === 0) return
                  setNegotiationMode(true)
                }}
                className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              >
                <ChevronRight className="h-4 w-4" />
                Proceed ({selectedPhotos.length})
              </Button>
              <Button
                onClick={() => setShowSendCatalog(true)}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <Send className="h-4 w-4" />
                Send to Client ({selectedPhotos.length})
              </Button>
            </>
          )}
          <Button onClick={openNewSampleDialog} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Sample
          </Button>
        </div>
      </div>

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <Tabs defaultValue="gallery">
        <TabsList>
          <TabsTrigger value="gallery" className="gap-1.5">
            <Grid3x3 className="h-3.5 w-3.5" />
            Sample Gallery
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Send History
          </TabsTrigger>
        </TabsList>

        {/* ─── GALLERY TAB ─────────────────────────────────── */}
        <TabsContent value="gallery" className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by style no, style name, or sample no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="mr-2 h-3.5 w-3.5" />
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : samples.length === 0 ? (
            /* Empty State */
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No Samples Yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Start by creating a new sample entry, then upload photos to build your catalog.
              </p>
              <Button onClick={openNewSampleDialog} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create First Sample
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            /* ─── GRID VIEW ─────────────────────────────────── */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {samples.map(sample => {
                const isSelected = selectedPhotos.includes(sample.id)
                return (
                  <Card
                    key={sample.id}
                    className={`group relative cursor-pointer overflow-hidden transition-all hover:shadow-md ${
                      isSelected ? 'ring-2 ring-emerald-500 shadow-md' : ''
                    }`}
                    onClick={() => toggleSampleSelection(sample.id)}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-10">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    {/* Photo area */}
                    <div
                      className="relative aspect-[4/3] bg-muted/50"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (sample.photoCount > 0) openPhotoViewer(sample.id)
                      }}
                    >
                      {sample.photoCount > 0 ? (
                        <SamplePhotoGrid
                          sampleId={sample.id}
                          count={sample.photoCount}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                          <ImagePlus className="h-8 w-8" />
                          <span className="text-xs">No Photos</span>
                        </div>
                      )}
                      <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {sample.photoCount} photo{sample.photoCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {/* Info */}
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{sample.styleName}</p>
                          <p className="text-xs text-muted-foreground">{sample.styleNo}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${getStatusColor(sample.status)}`}>
                          {sample.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{sample.sampleNo}</span>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setActiveSample(sample)
                              setShowPhotoUpload(true)
                            }}
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600"
                            onClick={() => handleDeleteSample(sample.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* ─── LIST VIEW ─────────────────────────────────── */
            <div className="rounded-lg border">
              <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span className="w-8"></span>
                <span>Style</span>
                <span>Customer</span>
                <span>Status</span>
                <span>Photos</span>
                <span className="w-20 text-right">Actions</span>
              </div>
              {samples.map(sample => {
                const isSelected = selectedPhotos.includes(sample.id)
                return (
                  <div
                    key={sample.id}
                    className={`grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-3 transition-colors hover:bg-muted/30 ${
                      isSelected ? 'bg-emerald-50' : ''
                    }`}
                    onClick={() => toggleSampleSelection(sample.id)}
                  >
                    <div className="w-8 flex justify-center">
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{sample.styleName}</p>
                      <p className="text-xs text-muted-foreground">{sample.styleNo} · {sample.sampleNo}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sample.customer?.companyName || '—'}
                    </div>
                    <Badge variant="outline" className={`text-[10px] w-fit ${getStatusColor(sample.status)}`}>
                      {sample.status}
                    </Badge>
                    <span className="text-sm">{sample.photoCount}</span>
                    <div className="flex w-20 justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPhotoViewer(sample.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setActiveSample(sample); setShowPhotoUpload(true) }}>
                        <ImagePlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── HISTORY TAB ─────────────────────────────────── */}
        <TabsContent value="history" className="space-y-4">
          {catalogs.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
              <Package className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">No Catalogs Sent Yet</h3>
              <p className="text-sm text-muted-foreground">
                Select samples and send them to clients to see history here.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Catalog</span>
                <span>Client</span>
                <span>Date Sent</span>
                <span className="w-20 text-right">Action</span>
              </div>
              {catalogs.map(cat => (
                <div key={cat.id} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-4 border-b px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{cat.catalogNo}</p>
                    <p className="text-xs text-muted-foreground">{cat.items.length} sample{cat.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {cat.customer.companyName}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(cat.sentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <div className="flex w-20 justify-end">
                    <a
                      href={`/api/sample-catalogs/${cat.id}/pdf`}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => toast.success('Downloading PDF...')}
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── New Sample Dialog ─────────────────────────────── */}
      <Dialog open={showNewSample} onOpenChange={setShowNewSample}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Create New Sample
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Style ID *</label>
                <div className="relative">
                  <Input
                    value={newStyleNo}
                    onChange={e => setNewStyleNo(e.target.value)}
                    placeholder="EL-001"
                    className="pr-16"
                  />
                  {newStyleNo === autoStyleId && autoStyleId && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      AUTO
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Style Name *</label>
                <Input value={newStyleName} onChange={e => setNewStyleName(e.target.value)} placeholder="Kurti Set" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer (optional)</label>
              <Select value={newCustomerId} onValueChange={setNewCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSample(false)}>Cancel</Button>
            <Button onClick={handleCreateSample}>Create Sample</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Photo Upload Dialog ───────────────────────────── */}
      <Dialog open={showPhotoUpload} onOpenChange={setShowPhotoUpload}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Upload Photos — {activeSample?.styleName || ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Existing photos */}
            {activeSample?.photos && activeSample.photos.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Existing Photos ({activeSample.photos.length})
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {activeSample.photos.map(photo => (
                    <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                      <img src={photo.imageUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {photo.caption && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white truncate">
                          {photo.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Upload area - uses label htmlFor to avoid programmatic click() blocked in sandboxed iframes */}
            <label
              htmlFor="sample-photo-input"
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
              } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-primary">Uploading...</p>
                  <p className="text-xs text-muted-foreground">Compressing & uploading your photos</p>
                </>
              ) : (
                <>
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload photos</p>
                  <p className="text-xs text-muted-foreground">or drag & drop images here • Multiple allowed</p>
                </>
              )}
              <input
                id="sample-photo-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={handlePhotoUpload}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhotoUpload(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Send Catalog Dialog ───────────────────────────── */}
      <Dialog open={showSendCatalog} onOpenChange={setShowSendCatalog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Catalog to Client
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Client *</label>
              <Select value={sendCustomerId} onValueChange={setSendCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Selected Samples ({selectedPhotos.length})
              </label>
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border p-2">
                {selectedPhotos.map(id => {
                  const s = samples.find(s => s.id === id)
                  return s ? (
                    <div key={id} className="flex items-center gap-2 text-sm py-1">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{s.styleName}</span>
                      <span className="text-xs text-muted-foreground">{s.styleNo}</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea value={sendNotes} onChange={e => setSendNotes(e.target.value)} placeholder="Any message..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendCatalog(false)}>Cancel</Button>
            <Button
              onClick={handleSendCatalog}
              disabled={sending || !sendCustomerId}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send & Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Photo Viewer Dialog ──────────────────────────── */}
      <Dialog open={showPhotoViewer} onOpenChange={setShowPhotoViewer}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
          <div className="relative bg-black">
            {/* Nav */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between bg-black/60 px-4 py-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setViewingIndex(i => Math.max(0, i - 1))}
                disabled={viewingIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-white">
                {viewingIndex + 1} / {viewingPhotos.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setViewingIndex(i => Math.min(viewingPhotos.length - 1, i + 1))}
                disabled={viewingIndex === viewingPhotos.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {/* Photo */}
            <div className="flex min-h-[60vh] items-center justify-center p-8 pt-14">
              <img
                src={viewingPhotos[viewingIndex]?.imageUrl}
                alt={viewingPhotos[viewingIndex]?.caption || ''}
                className="max-h-[70vh] max-w-full rounded object-contain"
              />
            </div>
            {/* Caption */}
            {viewingPhotos[viewingIndex]?.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-2 text-center">
                <p className="text-sm text-white italic">{viewingPhotos[viewingIndex].caption}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Photo Grid Component ──────────────────────────────────────────

function SamplePhotoGrid({ sampleId, count }: { sampleId: string; count: number }) {
  const [photos, setPhotos] = useState<{ id: string; imageUrl: string }[]>([])

  useEffect(() => {
    const fetchFirstPhotos = async () => {
      try {
        const res = await fetch(`/api/samples/${sampleId}`)
        if (res.ok) {
          const sample = await res.json()
          setPhotos((sample.photos || []).slice(0, 4).map((p: { id: string; imageUrl: string }) => ({ id: p.id, imageUrl: p.imageUrl })))
        }
      } catch { /* ignore */ }
    }
    fetchFirstPhotos()
  }, [sampleId])

  if (photos.length === 0) return null

  if (photos.length === 1) {
    return <img src={photos[0].imageUrl} alt="" className="h-full w-full object-cover" />
  }

  if (photos.length === 2) {
    return (
      <div className="grid h-full w-full grid-cols-2">
        {photos.map(p => <img key={p.id} src={p.imageUrl} alt="" className="h-full w-full object-cover" />)}
      </div>
    )
  }

  // 3-4 photos: 2x2 grid
  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {photos.map(p => <img key={p.id} src={p.imageUrl} alt="" className="h-full w-full object-cover" />)}
    </div>
  )
}

// ─── Utilities ──────────────────────────────────────────────────────

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Compress image by resizing to max dimension & reducing quality */
function compressImage(file: File, maxDim = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height / width) * maxDim)
          width = maxDim
        } else {
          width = Math.round((width / height) * maxDim)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
