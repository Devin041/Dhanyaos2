'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Plus, Pencil, Layers, Package, X, Shirt, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface BomLine {
  id?: string
  materialType: string
  materialName: string
  color?: string | null
  unit: string
  qtyPerPiece: number
  wastagePercent: number
  applicableColorsList: string[]
}

interface Bom {
  id: string
  styleNo: string
  version: number
  isActive: boolean
  notes: string | null
  lines: BomLine[]
  createdAt: string
}

interface StyleOption {
  styleNo: string
  styleName: string
}

const MATERIAL_TYPES = ['FABRIC', 'ACCESSORY', 'TRIM', 'SERVICE', 'OTHER']
const UNITS = ['meters', 'pieces', 'grams', 'kg', 'sets', 'dozens']

const EMPTY_LINE = (): BomLine => ({
  materialType: 'FABRIC',
  materialName: '',
  color: '',
  unit: 'meters',
  qtyPerPiece: 0,
  wastagePercent: 0,
  applicableColorsList: [],
})

/** Clamp wastage into 0-100 (mirrors API-side clamp in lib/bom-utils). */
function clampWastage(v: any): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return n
}

export function BomModule() {
  const [boms, setBoms] = useState<Bom[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBom, setEditingBom] = useState<Bom | null>(null)
  const [saving, setSaving] = useState(false)
  const [styleNo, setStyleNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BomLine[]>([EMPTY_LINE()])
  const [styleOptions, setStyleOptions] = useState<StyleOption[]>([])
  const [styleSearch, setStyleSearch] = useState('')
  // Photos for the style selector rows + preview banner (flat /api/style-images)
  const [optionImages, setOptionImages] = useState<Record<string, string>>({})
  // Material name autocomplete for the line editor (HTML datalist)
  const [materialNames, setMaterialNames] = useState<string[]>([])

  // Detail dialog
  const [detailBom, setDetailBom] = useState<Bom | null>(null)
  const [imageMap, setImageMap] = useState<Record<string, string>>({})

  const fetchBoms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/boms${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setBoms(data.boms || [])

      // FLAT style-image map — plain URL strings (fixes the [object Object] bug)
      const styleNos = [...new Set((data.boms || []).map((b: Bom) => b.styleNo))]
      if (styleNos.length > 0) {
        const imgRes = await fetch(`/api/style-images?styleNos=${encodeURIComponent(styleNos.join(','))}`).catch(() => null)
        if (imgRes && imgRes.ok) {
          const imgData = await imgRes.json()
          setImageMap(imgData.images || {})
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load BOMs')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchBoms()
  }, [fetchBoms])

  // Create/edit dialog: when opened — ONE batch image fetch for ALL style
  // options (→ optionImages) + ONE material-suggest fetch (→ datalist).
  // Skipped while the dialog is closed; cancelled flag on cleanup.
  useEffect(() => {
    if (!dialogOpen) return
    let cancelled = false

    async function loadDialogData() {
      // Style options — samples are the product master (EL-xxx + photos)
      try {
        const res = await fetch('/api/samples')
        const d = await res.json()
        if (cancelled) return
        const opts: StyleOption[] = (d.samples || d || [])
          .filter((s: any) => s.styleNo)
          .map((s: any) => ({ styleNo: s.styleNo, styleName: s.styleName || '' }))
        setStyleOptions(opts)

        const styleNos = opts.map((s) => s.styleNo)
        if (styleNos.length > 0) {
          const imgRes = await fetch(`/api/style-images?styleNos=${encodeURIComponent(styleNos.join(','))}`).catch(() => null)
          if (imgRes && imgRes.ok) {
            const imgData = await imgRes.json()
            if (!cancelled) setOptionImages(imgData.images || {})
          }
        }
      } catch { /* ignore */ }

      // Material name autocomplete (BOMLine ∪ FabricStock names)
      try {
        const res = await fetch('/api/boms/material-suggest')
        if (res.ok && !cancelled) {
          const d = await res.json()
          if (!cancelled) setMaterialNames(d.names || [])
        }
      } catch { /* ignore */ }
    }

    loadDialogData()
    return () => { cancelled = true }
  }, [dialogOpen])

  const openCreate = () => {
    setEditingBom(null)
    setStyleNo('')
    setNotes('')
    setLines([EMPTY_LINE()])
    setStyleSearch('')
    setDialogOpen(true)
  }

  const openEdit = async (bom: Bom) => {
    try {
      const res = await fetch(`/api/boms/${bom.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const full: Bom = data.bom
      setEditingBom(full)
      setStyleNo(full.styleNo)
      setNotes(full.notes || '')
      setLines(
        full.lines.length > 0
          ? full.lines.map((l) => ({ ...l, wastagePercent: clampWastage(l.wastagePercent ?? 0) }))
          : [EMPTY_LINE()],
      )
      setDialogOpen(true)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load BOM')
    }
  }

  const handleSave = async () => {
    if (!styleNo.trim()) {
      toast.error('Select a product (styleNo)')
      return
    }
    const validLines = lines.filter((l) => l.materialName.trim())
    if (validLines.length === 0) {
      toast.error('Add at least one material line')
      return
    }
    setSaving(true)
    try {
      const payload = {
        styleNo: styleNo.trim(),
        notes,
        lines: validLines.map((l) => ({
          materialType: l.materialType,
          materialName: l.materialName.trim(),
          color: l.color?.trim() || null,
          unit: l.unit,
          qtyPerPiece: Number(l.qtyPerPiece) || 0,
          wastagePercent: clampWastage(l.wastagePercent),
          applicableColors: l.applicableColorsList,
        })),
      }
      const res = editingBom
        ? await fetch(`/api/boms/${editingBom.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/boms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast.success(editingBom ? 'BOM updated' : `BOM created for ${styleNo.trim()}`)
      if (data.warning) toast.warning(data.warning)
      setDialogOpen(false)
      fetchBoms()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async (bom: Bom) => {
    try {
      const res = await fetch(`/api/boms/${bom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${bom.styleNo} v${bom.version} is now the active BOM`)
      fetchBoms()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const updateLine = (idx: number, patch: Partial<BomLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const addColorToLine = (idx: number, raw: string) => {
    const parts = raw.split(',').map((c) => c.trim()).filter(Boolean)
    if (parts.length === 0) return
    updateLine(idx, {
      applicableColorsList: [...new Set([...lines[idx].applicableColorsList, ...parts])],
    })
  }

  const filteredStyles = styleOptions.filter(
    (s) =>
      !styleSearch ||
      s.styleNo.toLowerCase().includes(styleSearch.toLowerCase()) ||
      s.styleName.toLowerCase().includes(styleSearch.toLowerCase()),
  )

  // Preview banner image — selector fetch ∪ list fetch, Shirt fallback
  const previewImage = styleNo ? optionImages[styleNo] || imageMap[styleNo] : undefined
  const previewStyleName = styleOptions.find((s) => s.styleNo === styleNo)?.styleName || ''

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Bill of Materials (BOM)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Product + color-level material recipes — the foundation for auto PO generation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search styleNo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-52"
            />
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Create BOM
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : boms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Package className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium">No BOMs yet</p>
            <p className="text-sm text-muted-foreground max-w-md">
              A BOM defines what materials each product needs per piece — fabric meters, buttons,
              zippers — and which colors they apply to. Create one to unlock auto material planning.
            </p>
            <Button onClick={openCreate} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Create first BOM
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {boms.map((bom) => (
            <Card
              key={`${bom.id}-${bom.version}`}
              className={`cursor-pointer hover:border-primary/40 transition-colors ${!bom.isActive ? 'opacity-60' : ''}`}
              onClick={() => setDetailBom(bom)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {imageMap[bom.styleNo] ? (
                    <img
                      src={imageMap[bom.styleNo] || undefined}
                      alt={bom.styleNo}
                      className="h-16 w-16 rounded-lg object-cover border"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border">
                      <Shirt className="h-7 w-7 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold truncate">{bom.styleNo}</span>
                      <Badge variant="outline" className="text-[10px]">v{bom.version}</Badge>
                      {bom.isActive ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {bom.lines.length} material{bom.lines.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {bom.lines.slice(0, 3).map((l, i) => (
                        <span key={i} className="text-[10px] bg-muted rounded px-1.5 py-0.5 truncate max-w-[120px]">
                          {l.materialName}
                        </span>
                      ))}
                      {bom.lines.length > 3 && (
                        <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                          +{bom.lines.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!bom.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-3 h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleActivate(bom)
                    }}
                  >
                    Set as Active
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBom ? `Edit BOM — ${editingBom.styleNo}` : 'Create BOM'}</DialogTitle>
            <DialogDescription>
              Define materials per piece. Leave &quot;Applicable Colors&quot; empty for materials that apply to ALL colors.
            </DialogDescription>
          </DialogHeader>

          {/* Material name autocomplete — one datalist shared by every line editor */}
          <datalist id="material-name-suggestions">
            {materialNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <div className="space-y-4">
            {/* Product preview banner — photo + style identity (grn "Receiving for…" pattern) */}
            {styleNo && (
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-2.5">
                {previewImage ? (
                  <img
                    src={previewImage || undefined}
                    alt={styleNo}
                    className="h-[72px] w-[72px] rounded-md object-cover border shrink-0"
                  />
                ) : (
                  <div className="h-[72px] w-[72px] rounded-md bg-muted flex items-center justify-center border shrink-0">
                    <Shirt className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {editingBom ? 'Editing BOM for' : 'Creating BOM for'}
                  </p>
                  <p className="text-sm font-bold truncate">{styleNo}</p>
                  {previewStyleName && (
                    <p className="text-xs text-muted-foreground truncate">{previewStyleName}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product (styleNo)</Label>
                {editingBom ? (
                  <Input value={styleNo} disabled />
                ) : (
                  <>
                    <Input
                      placeholder="Filter styles…"
                      value={styleSearch}
                      onChange={(e) => setStyleSearch(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                      {filteredStyles.slice(0, 30).map((s) => {
                        const thumb = optionImages[s.styleNo]
                        return (
                          <button
                            key={s.styleNo}
                            type="button"
                            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm hover:bg-primary/10 text-left ${styleNo === s.styleNo ? 'bg-primary/15' : ''}`}
                            onClick={() => setStyleNo(s.styleNo)}
                          >
                            {thumb ? (
                              <img
                                src={thumb || undefined}
                                alt={s.styleNo}
                                className="h-10 w-10 rounded-md object-cover border shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center border shrink-0">
                                <Shirt className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                            <span className="min-w-0">
                              <span className="block font-bold truncate">{s.styleNo}</span>
                              {s.styleName && (
                                <span className="block text-xs text-muted-foreground truncate">
                                  {s.styleName}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                      {filteredStyles.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No matching styles</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Optional notes…" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Material Lines</Label>
                <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => setLines((p) => [...p, EMPTY_LINE()])}>
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </Button>
              </div>
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      <Select value={line.materialType} onValueChange={(v) => updateLine(idx, { materialType: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MATERIAL_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Material name *"
                        list="material-name-suggestions"
                        value={line.materialName}
                        onChange={(e) => updateLine(idx, { materialName: e.target.value })}
                        className="h-9 md:col-span-2"
                      />
                      <Input
                        placeholder="Material color (optional)"
                        value={line.color || ''}
                        onChange={(e) => updateLine(idx, { color: e.target.value })}
                        className="h-9"
                      />
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="Qty/pc"
                          value={line.qtyPerPiece || ''}
                          onChange={(e) => updateLine(idx, { qtyPerPiece: Number(e.target.value) })}
                          className="h-9"
                        />
                        <Select value={line.unit} onValueChange={(v) => updateLine(idx, { unit: v })}>
                          <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        placeholder="Wastage %"
                        value={line.wastagePercent || ''}
                        onChange={(e) => updateLine(idx, { wastagePercent: Number(e.target.value) || 0 })}
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <Input
                        placeholder="Applicable colors — comma separated (empty = all colors)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addColorToLine(idx, (e.target as HTMLInputElement).value)
                            ;(e.target as HTMLInputElement).value = ''
                          }
                        }}
                        className="h-8 text-xs"
                      />
                      {lines.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-red-500"
                          onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {line.applicableColorsList.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {line.applicableColorsList.map((c) => (
                          <Badge key={c} variant="secondary" className="gap-1 text-[10px]">
                            {c}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() =>
                                updateLine(idx, {
                                  applicableColorsList: line.applicableColorsList.filter((x) => x !== c),
                                })
                              }
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingBom ? 'Update BOM' : 'Create BOM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog ── */}
      <Dialog open={!!detailBom} onOpenChange={(open) => !open && setDetailBom(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailBom && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {imageMap[detailBom.styleNo] ? (
                    <img
                      src={imageMap[detailBom.styleNo] || undefined}
                      alt={detailBom.styleNo}
                      className="h-16 w-16 rounded-lg object-cover border shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center border shrink-0">
                      <Shirt className="h-7 w-7 text-muted-foreground/50" />
                    </div>
                  )}
                  <span className="flex items-center gap-2 flex-wrap">
                    BOM — {detailBom.styleNo}
                    <Badge variant="outline">v{detailBom.version}</Badge>
                    {detailBom.isActive && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">Active</Badge>
                    )}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {detailBom.lines.length} material lines · created {new Date(detailBom.createdAt).toLocaleDateString('en-IN')}
                </DialogDescription>
              </DialogHeader>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Qty/Piece</TableHead>
                    <TableHead>Wastage</TableHead>
                    <TableHead>Applies To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailBom.lines.map((l, i) => (
                    <TableRow key={l.id || i}>
                      <TableCell><Badge variant="outline" className="text-[10px]">{l.materialType}</Badge></TableCell>
                      <TableCell className="font-medium">{l.materialName}{l.color ? ` (${l.color})` : ''}</TableCell>
                      <TableCell>{l.unit}</TableCell>
                      <TableCell className="font-mono">{l.qtyPerPiece}</TableCell>
                      <TableCell className="font-mono">{Number(l.wastagePercent) || 0}%</TableCell>
                      <TableCell>
                        {l.applicableColorsList.length === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">ALL Colors</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {l.applicableColorsList.map((c) => (
                              <span key={c} className="text-[10px] bg-muted rounded px-1.5 py-0.5">{c}</span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setDetailBom(null)
                    openEdit(detailBom)
                  }}
                >
                  <Pencil className="h-4 w-4" /> Edit BOM
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
