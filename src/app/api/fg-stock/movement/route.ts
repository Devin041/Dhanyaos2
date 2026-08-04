import { supabase } from '@/lib/supabase-db'
import { NextRequest, NextResponse } from 'next/server'
import { generateMovementNo, generateColorCode, withComputedFields } from '@/lib/fg-color-code'

type MovementPayload = {
  binId?: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  movementType: string
  // For Exchange
  targetColorCode?: string
  targetColor?: string
  targetSize?: string
  // For QCStatusChange
  fromStatus?: string
  toStatus?: string
  // For Exhibition
  fromLocation?: string
  toLocation?: string
  // Source document
  referenceType?: string
  referenceId?: string
  referenceNo?: string
  // Party
  partyId?: string
  partyName?: string
  // Context
  reason?: string
  movedBy?: string
  // Pricing (for new bin creation)
  unitCost?: number
  unitSellPrice?: number
  image?: string
}

const VALID_TYPES = [
  'Inward', 'Outward', 'Return', 'Exchange', 'Reservation', 'Unreservation',
  'PromotionalIssue', 'ExhibitionMove', 'ExhibitionReturn', 'Adjustment',
  'QCStatusChange', 'Scrapping',
]

// Helper: find or create bin for Inward
async function findOrCreateBin(data: MovementPayload) {
  const { data: existing } = await supabase
    .from('FGStockBin')
    .select('*')
    .eq('styleNo', data.styleNo)
    .eq('color', data.color)
    .eq('size', data.size)
    .limit(1)
    .single()

  if (existing) return existing

  const colorCode = data.colorCode || await generateColorCode(data.styleNo, data.color)
  const { data: newBin, error } = await supabase
    .from('FGStockBin')
    .insert({
      styleNo: data.styleNo,
      styleName: data.styleName,
      colorCode,
      color: data.color,
      size: data.size,
      unitCost: data.unitCost || 0,
      unitSellPrice: data.unitSellPrice || 0,
      image: data.image || null,
      firstInDate: new Date().toISOString(),
      lastMovementDate: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return newBin
}

// Helper: find bin by styleNo/color/size
async function findBin(data: MovementPayload) {
  const { data: bin } = await supabase
    .from('FGStockBin')
    .select('*')
    .eq('styleNo', data.styleNo)
    .eq('color', data.color)
    .eq('size', data.size)
    .limit(1)
    .single()
  return bin
}

// Helper: update bin and return updated record
async function updateBin(id: string, updateData: any) {
  const { data, error } = await supabase
    .from('FGStockBin')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Helper: create movement record
async function createMovement(movementData: any) {
  const { data, error } = await supabase
    .from('FGStockMovement')
    .insert(movementData)
    .select()
    .single()
  if (error) throw error
  return data
}

// Helper: fetch bin by id
async function fetchBinById(id: string) {
  const { data } = await supabase
    .from('FGStockBin')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

// Helper: update bin's lastMovementDate
function touchMovementDate(binUpdate: any) {
  return { ...binUpdate, lastMovementDate: new Date().toISOString() }
}

// ─── POST: Single movement entry point ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data: MovementPayload = body

    if (!data.movementType || !VALID_TYPES.includes(data.movementType)) {
      return NextResponse.json({ error: `Invalid movementType. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
    }
    if (!data.styleNo || !data.color || !data.size) {
      return NextResponse.json({ error: 'styleNo, color, size are required' }, { status: 400 })
    }
    if (typeof data.quantity !== 'number' || data.quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
    }

    const now = new Date()
    const mvtNo = generateMovementNo()
    let bin: any
    let targetBin: any = null
    let targetMovement: any = null

    switch (data.movementType) {
      case 'Inward': {
        bin = await findOrCreateBin(data)
        const prevQty = bin.availableQty
        const newQty = prevQty + data.quantity
        bin = await updateBin(bin.id, touchMovementDate({ availableQty: newQty }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Inward', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty,
          unitCost: bin.unitCost,
          referenceType: data.referenceType || null, referenceId: data.referenceId || null,
          referenceNo: data.referenceNo || null, partyId: data.partyId || null,
          partyName: data.partyName || null, reason: data.reason || null,
          movedBy: data.movedBy || 'System',
        })
        // Update firstInDate if not set
        if (!bin.firstInDate) {
          bin = await updateBin(bin.id, { firstInDate: now.toISOString() })
        }
        break
      }

      case 'Outward': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.availableQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient stock. Available: ${bin.availableQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevQty = bin.availableQty
        const newQty = prevQty - data.quantity
        bin = await updateBin(bin.id, touchMovementDate({ availableQty: newQty }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Outward', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty,
          unitCost: bin.unitCost,
          referenceType: data.referenceType || null, referenceId: data.referenceId || null,
          referenceNo: data.referenceNo || null, partyId: data.partyId || null,
          partyName: data.partyName || null, reason: data.reason || null,
          movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Return': {
        bin = await findOrCreateBin(data)
        const prevQty = bin.qcPendingQty
        const newQty = prevQty + data.quantity
        bin = await updateBin(bin.id, touchMovementDate({ qcPendingQty: newQty }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Return', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty,
          unitCost: bin.unitCost,
          fromStatus: null, toStatus: 'QCPending',
          referenceType: data.referenceType || null, referenceId: data.referenceId || null,
          referenceNo: data.referenceNo || null, partyId: data.partyId || null,
          partyName: data.partyName || null, reason: data.reason || null,
          movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Reservation': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.availableQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient available stock. Available: ${bin.availableQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevAvail = bin.availableQty
        const prevReserved = bin.reservedQty
        bin = await updateBin(bin.id, touchMovementDate({
          availableQty: prevAvail - data.quantity,
          reservedQty: prevReserved + data.quantity,
        }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Reservation', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevAvail, newQty: prevAvail - data.quantity,
          unitCost: bin.unitCost,
          fromStatus: 'Available', toStatus: 'Reserved',
          referenceType: data.referenceType || 'FGReservation',
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          partyId: data.partyId || null, partyName: data.partyName || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Unreservation': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.reservedQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient reserved stock. Reserved: ${bin.reservedQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevAvail = bin.availableQty
        const prevReserved = bin.reservedQty
        bin = await updateBin(bin.id, touchMovementDate({
          availableQty: prevAvail + data.quantity,
          reservedQty: prevReserved - data.quantity,
        }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Unreservation', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevAvail, newQty: prevAvail + data.quantity,
          unitCost: bin.unitCost,
          fromStatus: 'Reserved', toStatus: 'Available',
          referenceType: data.referenceType || null,
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'QCStatusChange': {
        if (!data.fromStatus || !data.toStatus) {
          return NextResponse.json({ error: 'fromStatus and toStatus are required for QCStatusChange' }, { status: 400 })
        }
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })

        const statusFieldMap: Record<string, string> = {
          Available: 'availableQty',
          Reserved: 'reservedQty',
          QCPending: 'qcPendingQty',
          UnderRepair: 'underRepairQty',
          Defective: 'defectiveQty',
          Exhibition: 'exhibitionQty',
        }
        const fromField = statusFieldMap[data.fromStatus]
        const toField = statusFieldMap[data.toStatus]
        if (!fromField || !toField) {
          return NextResponse.json({ error: `Invalid status. Valid: ${Object.keys(statusFieldMap).join(', ')}` }, { status: 400 })
        }

        const currentFrom = (bin as any)[fromField] as number
        if (currentFrom < data.quantity) {
          return NextResponse.json({ error: `Insufficient ${data.fromStatus} stock. Have: ${currentFrom}, Requested: ${data.quantity}` }, { status: 400 })
        }

        const updateData: any = touchMovementDate({})
        updateData[fromField] = currentFrom - data.quantity
        updateData[toField] = (bin as any)[toField] + data.quantity
        bin = await updateBin(bin.id, updateData)

        await createMovement({
          movementNo: mvtNo, movementType: 'QCStatusChange', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: currentFrom, newQty: currentFrom - data.quantity,
          unitCost: bin.unitCost,
          fromStatus: data.fromStatus, toStatus: data.toStatus,
          referenceType: data.referenceType || 'QC',
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Scrapping': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.defectiveQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient defective stock. Defective: ${bin.defectiveQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevDef = bin.defectiveQty
        const prevScrap = bin.scrappedQty
        bin = await updateBin(bin.id, touchMovementDate({
          defectiveQty: prevDef - data.quantity,
          scrappedQty: prevScrap + data.quantity,
        }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Scrapping', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevDef, newQty: prevDef - data.quantity,
          unitCost: bin.unitCost,
          fromStatus: 'Defective', toStatus: 'Scrapped',
          referenceType: data.referenceType || 'Adjustment',
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'PromotionalIssue': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.availableQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient stock. Available: ${bin.availableQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevQty = bin.availableQty
        bin = await updateBin(bin.id, touchMovementDate({ availableQty: prevQty - data.quantity }))
        await createMovement({
          movementNo: mvtNo, movementType: 'PromotionalIssue', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty: prevQty - data.quantity,
          unitCost: bin.unitCost,
          referenceType: data.referenceType || 'Promotional',
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          partyId: data.partyId || null, partyName: data.partyName || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'ExhibitionMove': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.availableQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient stock. Available: ${bin.availableQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevQty = bin.availableQty
        const prevExh = bin.exhibitionQty
        const fromLoc = data.fromLocation || bin.location
        const toLoc = data.toLocation || 'Exhibition'
        bin = await updateBin(bin.id, touchMovementDate({
          availableQty: prevQty - data.quantity,
          exhibitionQty: prevExh + data.quantity,
          location: toLoc,
        }))
        await createMovement({
          movementNo: mvtNo, movementType: 'ExhibitionMove', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty: prevQty - data.quantity,
          unitCost: bin.unitCost,
          fromLocation: fromLoc, toLocation: toLoc,
          referenceType: data.referenceType || 'Exhibition',
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'ExhibitionReturn': {
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Stock bin not found' }, { status: 404 })
        if (bin.exhibitionQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient exhibition stock. Exhibition: ${bin.exhibitionQty}, Requested: ${data.quantity}` }, { status: 400 })
        }
        const prevExh = bin.exhibitionQty
        const prevAvail = bin.availableQty
        const fromLoc = data.fromLocation || 'Exhibition'
        const toLoc = data.toLocation || 'Warehouse'
        bin = await updateBin(bin.id, touchMovementDate({
          exhibitionQty: prevExh - data.quantity,
          availableQty: prevAvail + data.quantity,
          location: toLoc,
        }))
        await createMovement({
          movementNo: mvtNo, movementType: 'ExhibitionReturn', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevAvail, newQty: prevAvail + data.quantity,
          unitCost: bin.unitCost,
          fromLocation: fromLoc, toLocation: toLoc,
          referenceType: data.referenceType || 'Exhibition',
          referenceId: data.referenceId || null, referenceNo: data.referenceNo || null,
          reason: data.reason || null, movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Exchange': {
        // Debit from source
        if (!data.targetColor || !data.targetSize) {
          return NextResponse.json({ error: 'targetColor and targetSize are required for Exchange' }, { status: 400 })
        }
        bin = await findBin(data)
        if (!bin) return NextResponse.json({ error: 'Source stock bin not found' }, { status: 404 })
        if (bin.availableQty < data.quantity) {
          return NextResponse.json({ error: `Insufficient source stock. Available: ${bin.availableQty}, Requested: ${data.quantity}` }, { status: 400 })
        }

        const prevQty = bin.availableQty
        bin = await updateBin(bin.id, touchMovementDate({ availableQty: prevQty - data.quantity }))

        await createMovement({
          movementNo: mvtNo, movementType: 'Exchange', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty: prevQty - data.quantity,
          unitCost: bin.unitCost,
          fromStatus: 'Available', toStatus: 'Exchanged Out',
          referenceType: data.referenceType || null, referenceNo: data.referenceNo || null,
          reason: data.reason || `Exchanged to ${data.targetColor}/${data.targetSize}`,
          movedBy: data.movedBy || 'System',
        })

        // Credit to target
        targetBin = await findOrCreateBin({
          ...data,
          color: data.targetColor,
          size: data.targetSize,
          colorCode: data.targetColorCode || '',
        })
        const targetMvtNo = generateMovementNo()
        const prevTargetQty = targetBin.availableQty
        targetBin = await updateBin(targetBin.id, touchMovementDate({ availableQty: prevTargetQty + data.quantity }))
        targetMovement = await createMovement({
          movementNo: targetMvtNo, movementType: 'Exchange', fgStockBinId: targetBin.id,
          styleNo: targetBin.styleNo, styleName: targetBin.styleName,
          colorCode: targetBin.colorCode, color: targetBin.color, size: targetBin.size,
          quantity: data.quantity, previousQty: prevTargetQty, newQty: prevTargetQty + data.quantity,
          unitCost: targetBin.unitCost,
          fromStatus: 'Exchanged In', toStatus: 'Available',
          referenceType: data.referenceType || null, referenceNo: data.referenceNo || null,
          reason: data.reason || `Exchanged from ${data.color}/${data.size}`,
          movedBy: data.movedBy || 'System',
        })
        break
      }

      case 'Adjustment': {
        bin = await findBin(data)
        if (!bin) {
          // Create if not exists (positive adjustment)
          bin = await findOrCreateBin(data)
        }
        const prevQty = bin.availableQty
        const newQty = prevQty + data.quantity
        bin = await updateBin(bin.id, touchMovementDate({ availableQty: newQty }))
        await createMovement({
          movementNo: mvtNo, movementType: 'Adjustment', fgStockBinId: bin.id,
          styleNo: bin.styleNo, styleName: bin.styleName,
          colorCode: bin.colorCode, color: bin.color, size: bin.size,
          quantity: data.quantity, previousQty: prevQty, newQty,
          unitCost: bin.unitCost,
          referenceType: data.referenceType || 'Adjustment',
          reason: data.reason || 'Manual adjustment', movedBy: data.movedBy || 'System',
        })
        break
      }

      default:
        return NextResponse.json({ error: `Unhandled movement type: ${data.movementType}` }, { status: 400 })
    }

    // Re-fetch to get latest state
    const finalBin = await fetchBinById(bin.id)
    const response: any = {
      movement: { movementNo: mvtNo, movementType: data.movementType },
      bin: finalBin ? withComputedFields(finalBin) : null,
    }
    if (targetBin) {
      const finalTarget = await fetchBinById(targetBin.id)
      response.targetMovement = { movementNo: (targetMovement as any)?.movementNo, movementType: 'Exchange' }
      response.targetBin = finalTarget ? withComputedFields(finalTarget) : null
    }
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[FG-Stock Movement POST]', error)
    return NextResponse.json({ error: error.message || 'Movement failed' }, { status: 500 })
  }
}
