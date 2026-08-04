// ─── Audit Logger for AI Agent Write Operations ────────────────────────────────

import { supabase } from '@/lib/supabase-db'
import type { ToolResult } from './tools'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChangeRecord {
  field: string
  oldValue?: unknown
  newValue?: unknown
}

export interface AuditEntry {
  entityType: string
  entityId: string
  entityNo: string
  action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'WORKFLOW'
  changes: ChangeRecord[]
  toolName: string
  userMessage?: string
  confirmation: 'confirmed' | 'auto'
  conversationId?: string
}

// ─── Tool → Entity Mapping ─────────────────────────────────────────────────────

const TOOL_ENTITY_MAP: Record<string, string> = {
  create_sales_order: 'SalesOrder',
  update_order_status: 'SalesOrder',
  record_payment: 'SalesOrder',
  close_order: 'SalesOrder',
  bulk_order_status_update: 'SalesOrder',
  create_production_job: 'ProductionJob',
  update_production_job: 'ProductionJob',
  create_purchase_order: 'PurchaseOrder',
  update_po_status: 'PurchaseOrder',
  create_transaction: 'Transaction',
  create_dispatch: 'Dispatch',
  update_dispatch_status: 'Dispatch',
  record_dispatch_from_order: 'Dispatch',
  create_grn_note: 'GrnNote',
  record_grn_and_update_stock: 'GrnNote',
  create_sample: 'Sample',
  update_sample_status: 'Sample',
  create_quality_check: 'QualityCheck',
  create_return: 'Return',
  create_customer: 'Customer',
  create_supplier: 'Supplier',
  create_employee: 'Employee',
  create_quotation_from_cost_sheet: 'Quotation',
  update_quotation_status: 'Quotation',
  convert_quotation_to_order: 'Quotation',
  update_cost_sheet_status: 'CostSheet',
  update_inventory: 'FabricStock',
}

/** Fields to look for when extracting entityNo from tool result data */
const ENTITY_NO_FIELDS = ['orderNo', 'jobNo', 'poNumber', 'dispatchNo', 'grnNo', 'sampleNo',
  'checkNo', 'returnNo', 'quotationNo', 'sheetNo', 'styleNo', 'txnNo', 'paymentNo', 'billNo']

// ─── Core Log Function ─────────────────────────────────────────────────────────

/** Write an audit log entry. Fire-and-forget — callers don't need to await. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabase.from('AuditLog').insert({
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityNo: entry.entityNo,
      action: entry.action,
      changes: JSON.stringify(entry.changes),
      toolName: entry.toolName,
      userMessage: entry.userMessage ?? null,
      confirmation: entry.confirmation,
      conversationId: entry.conversationId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    // Fire-and-forget: never throw, just log
    console.error('[audit-logger] Failed to write audit log:', err)
  }
}

// ─── Convenience: Log from Tool Execution ───────────────────────────────────────

/**
 * Extract entity info from a tool result and create an audit log entry.
 * Designed to be called without await after a tool executes.
 */
export function logToolExecution(
  toolName: string,
  toolResult: ToolResult,
  userMessage?: string,
  conversationId?: string,
  wasConfirmed = false,
): void {
  if (!toolResult.success || !toolResult.data) return
  const data = toolResult.data as Record<string, unknown>

  const entityType = TOOL_ENTITY_MAP[toolName] || 'Unknown'
  const entityId = (data.id as string) || ''
  const entityNo = extractEntityNo(data)

  const action = deriveAction(toolName, data)
  const changes = extractChanges(toolName, data)

  // Fire-and-forget
  logAudit({
    entityType, entityId, entityNo, action, changes, toolName,
    userMessage, confirmation: wasConfirmed ? 'confirmed' : 'auto',
    conversationId,
  })
}

// ─── Extraction Helpers ────────────────────────────────────────────────────────

function extractEntityNo(data: Record<string, unknown>): string {
  for (const field of ENTITY_NO_FIELDS) {
    const val = data[field]
    if (typeof val === 'string' && val) return val
  }
  // Fallback: look inside nested objects (e.g. data.order?.orderNo)
  for (const val of Object.values(data)) {
    if (val && typeof val === 'object') {
      for (const field of ENTITY_NO_FIELDS) {
        const nested = (val as Record<string, unknown>)[field]
        if (typeof nested === 'string' && nested) return nested
      }
    }
  }
  return ''
}

function deriveAction(toolName: string, data: Record<string, unknown>): AuditEntry['action'] {
  if (toolName.startsWith('create_')) return 'CREATE'
  if (toolName.startsWith('update_') && (data.oldStatus || data.previousPaid !== undefined || data.newStatus)) {
    return 'STATUS_CHANGE'
  }
  if (toolName.startsWith('update_')) return 'UPDATE'
  if (['convert_quotation_to_order', 'record_dispatch_from_order', 'record_grn_and_update_stock', 'close_order', 'bulk_order_status_update'].includes(toolName)) {
    return 'WORKFLOW'
  }
  return 'UPDATE'
}

function extractChanges(toolName: string, data: Record<string, unknown>): ChangeRecord[] {
  const changes: ChangeRecord[] = []

  if (data.oldStatus && data.newStatus) {
    changes.push({ field: 'status', oldValue: data.oldStatus, newValue: data.newStatus })
  }
  if (data.previousPaid !== undefined && data.newPaid !== undefined) {
    changes.push({ field: 'paidAmount', oldValue: data.previousPaid, newValue: data.newPaid })
    if (data.paymentStatus) changes.push({ field: 'paymentStatus', newValue: data.paymentStatus })
  }
  if ((data as Record<string, unknown>).updatedFields && typeof (data as Record<string, unknown>).updatedFields === 'object') {
    for (const [field, value] of Object.entries((data as Record<string, unknown>).updatedFields as Record<string, unknown>)) {
      changes.push({ field, newValue: value })
    }
  }
  // For creates, capture key fields as changes
  if (toolName.startsWith('create_')) {
    for (const field of ENTITY_NO_FIELDS) {
      if (typeof data[field] === 'string' && data[field]) {
        changes.push({ field, newValue: data[field] })
      }
    }
    if (data.totalAmount !== undefined) changes.push({ field: 'totalAmount', newValue: data.totalAmount })
    if (data.amount !== undefined) changes.push({ field: 'amount', newValue: data.amount })
  }

  return changes
}