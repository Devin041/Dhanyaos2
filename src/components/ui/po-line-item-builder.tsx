'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Plus, Package, Scissors, Wrench, ShoppingBag, Layers } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Universal PO Line Item Builder ─────────────────────────────────────────
// Each line item has its own `itemType` (FABRIC / GOODS / ACCESSORY / SERVICE /
// OTHER), so a single PO can include fabric rolls + finished products + service
// charges — all in one document. This component is the universal builder.

export interface LineItem {
  id: string                 // client-side only (for React keys)
  itemType: ItemType
  styleNo?: string | null
  styleName?: string | null
  costSheetId?: string | null
  name: string               // fabric name, product name, or service name
  description?: string | null
  color?: string | null
  size?: string | null
  quantity: number
  unit: string
  ratePerUnit: number
}

export type ItemType = 'FABRIC' | 'GOODS' | 'ACCESSORY' | 'SERVICE' | 'OTHER'

export const ITEM_TYPES: Array<{ value: ItemType; label: string; icon: React.ReactNode; color: string }> = [
  { value: 'FABRIC',    label: 'Fabric',    icon: <Layers className="h-3 w-3" />,     color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { value: 'GOODS',     label: 'Finished Goods', icon: <ShoppingBag className="h-3 w-3" />, color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'ACCESSORY', label: 'Accessory', icon: <Package className="h-3 w-3" />,    color: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  { value: 'SERVICE',   label: 'Service',   icon: <Wrench className="h-3 w-3" />,     color: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  { value: 'OTHER',     label: 'Other',     icon: <Scissors className="h-3 w-3" />,    color: 'bg-slate-500/15 text-slate-600 dark:text-slate-400' },
]

export const UNITS = ['meters', 'Pcs', 'Kg', 'Box', 'Roll', 'Set', 'Lot', 'Hour', 'Day']

const uid = () => Math.random().toString(36).slice(2, 11)

export function emptyItem(itemType: ItemType = 'FABRIC'): LineItem {
  return {
    id: uid(),
    itemType,
    name: '',
    quantity: 0,
    unit: itemType === 'GOODS' || itemType === 'SERVICE' || itemType === 'ACCESSORY' ? 'Pcs' : 'meters',
    ratePerUnit: 0,
  }
}

interface Props {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  catalogProducts?: Array<{ id: string; styleNo: string; styleName: string }>  // for GOODS picker
}

export function POLineItemBuilder({ items, onChange, catalogProducts = [] }: Props) {
  const update = (id: string, patch: Partial<LineItem>) => {
    onChange(items.map(it => it.id === id ? { ...it, ...patch } : it))
  }
  const remove = (id: string) => onChange(items.filter(it => it.id !== id))
  const add = (itemType: ItemType = 'FABRIC') => onChange([...items, emptyItem(itemType)])

  // Bulk-add: "Silk × 4 colors" — generates N line items with same name but different color
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkName, setBulkName] = useState('')
  const [bulkColors, setBulkColors] = useState('')
  const [bulkQty, setBulkQty] = useState('')

  const handleBulkAdd = () => {
    if (!bulkName.trim() || !bulkColors.trim()) return
    const colors = bulkColors.split(',').map(c => c.trim()).filter(Boolean)
    const qtyPerColor = parseFloat(bulkQty) || 0
    const newItems: LineItem[] = colors.map(color => ({
      id: uid(),
      itemType: 'FABRIC' as ItemType,
      name: bulkName.trim(),
      color,
      quantity: qtyPerColor,
      unit: 'meters',
      ratePerUnit: 0,
    }))
    onChange([...items, ...newItems])
    setBulkName(''); setBulkColors(''); setBulkQty(''); setBulkOpen(false)
  }

  return (
    <div className="space-y-3">
      {/* Item type quick-add buttons */}
      <div className="flex flex-wrap gap-1.5">
        {ITEM_TYPES.map(t => (
          <Button
            key={t.value}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => add(t.value)}
            className="h-7 text-[10px] gap-1"
          >
            {t.icon}
            + {t.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBulkOpen(!bulkOpen)}
          className="h-7 text-[10px] text-primary"
        >
          {bulkOpen ? '× Cancel bulk' : '+ Bulk colors'}
        </Button>
      </div>

      {/* Bulk add: silk × 4 colors = 4 line items */}
      {bulkOpen && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Bulk add fabric colors — generates one line item per color
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input
              placeholder="Fabric name (e.g. Silk)"
              value={bulkName}
              onChange={(e) => setBulkName(e.target.value)}
              className="h-8 text-xs bg-background/60"
            />
            <Input
              placeholder="Colors: Pink, Maroon, Red"
              value={bulkColors}
              onChange={(e) => setBulkColors(e.target.value)}
              className="h-8 text-xs bg-background/60 sm:col-span-2"
            />
            <Input
              type="number"
              placeholder="Qty/color (m)"
              value={bulkQty}
              onChange={(e) => setBulkQty(e.target.value)}
              className="h-8 text-xs bg-background/60"
            />
          </div>
          <Button type="button" size="sm" onClick={handleBulkAdd} className="h-7 text-[10px]">
            Add {bulkColors.split(',').filter(c => c.trim()).length || 0} items
          </Button>
        </div>
      )}

      {/* List of line items */}
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
          No items yet. Click a type above to add your first line item.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const typeMeta = ITEM_TYPES.find(t => t.value === item.itemType) || ITEM_TYPES[4]
            const lineTotal = (item.quantity || 0) * (item.ratePerUnit || 0)
            return (
              <div key={item.id} className="rounded-md border border-border/40 bg-muted/20 p-2.5 space-y-2">
                {/* Header: index, type badge, remove */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 ${typeMeta.color}`}>
                      {typeMeta.icon}
                      {typeMeta.label}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => remove(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Item-type-specific rendering */}
                {item.itemType === 'GOODS' && catalogProducts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Product (from catalog)</Label>
                      <Select
                        value={item.styleNo || ''}
                        onValueChange={(v) => {
                          const p = catalogProducts.find(p => p.styleNo === v)
                          update(item.id, { styleNo: v, styleName: p?.styleName || '', name: p?.styleName || v })
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background/60">
                          <SelectValue placeholder="Select product..." />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogProducts.map(p => (
                            <SelectItem key={p.id} value={p.styleNo}>
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{p.styleNo}</span>
                                <span className="text-muted-foreground text-[10px]">{p.styleName}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Style Name</Label>
                      <Input
                        placeholder="Style name"
                        value={item.styleName || ''}
                        onChange={(e) => update(item.id, { styleName: e.target.value, name: e.target.value })}
                        className="h-8 text-xs bg-background/60"
                      />
                    </div>
                  </div>
                )}

                {/* Name + variants + qty + rate row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground">
                      {item.itemType === 'FABRIC' ? 'Fabric Name' :
                       item.itemType === 'GOODS' ? 'Product Name' :
                       item.itemType === 'SERVICE' ? 'Service Description' :
                       'Item Name'} *
                    </Label>
                    <Input
                      placeholder={item.itemType === 'SERVICE' ? 'e.g. Stitching work' : 'e.g. Banarasi Silk'}
                      value={item.name}
                      onChange={(e) => update(item.id, { name: e.target.value })}
                      className="h-8 text-xs bg-background/60"
                    />
                  </div>
                  {(item.itemType === 'FABRIC' || item.itemType === 'GOODS') && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Color</Label>
                      <Input
                        placeholder="e.g. Pink"
                        value={item.color || ''}
                        onChange={(e) => update(item.id, { color: e.target.value })}
                        className="h-8 text-xs bg-background/60"
                      />
                    </div>
                  )}
                  {item.itemType === 'GOODS' && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Size</Label>
                      <Input
                        placeholder="S/M/L/XL"
                        value={item.size || ''}
                        onChange={(e) => update(item.id, { size: e.target.value })}
                        className="h-8 text-xs bg-background/60"
                      />
                    </div>
                  )}
                </div>

                {/* Qty + unit + rate + line total */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Qty *</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={item.quantity || ''}
                      onChange={(e) => update(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs bg-background/60"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Unit</Label>
                    <Select value={item.unit} onValueChange={(v) => update(item.id, { unit: v })}>
                      <SelectTrigger className="h-8 text-xs bg-background/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Rate (₹) *</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={item.ratePerUnit || ''}
                      onChange={(e) => update(item.id, { ratePerUnit: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-xs bg-background/60"
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Line Total</Label>
                    <p className="h-8 flex items-center text-sm font-semibold text-primary">
                      ₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
