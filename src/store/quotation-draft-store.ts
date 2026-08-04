import { create } from 'zustand'

export interface DraftLineItem {
  styleName: string
  styleNo: string
  sampleId: string
  quantity: number
  unitPrice: number
  unitCost: number
  itemDiscountPercent: number
}

interface QuotationDraftState {
  // Pre-filled items from sample catalog selection
  draftItems: DraftLineItem[]
  // Customer ID (optional - pre-set from catalog context)
  draftCustomerId: string | null
  // Flag to signal that create dialog should open
  shouldOpenCreate: boolean
  // Action: set draft items (called from Sample Catalog)
  setDraft: (items: DraftLineItem[], customerId?: string | null) => void
  // Action: clear draft (called after quotation created or dialog closed)
  clearDraft: () => void
  // Action: mark create dialog as opened
  consumeOpenSignal: () => void
}

export const useQuotationDraftStore = create<QuotationDraftState>((set) => ({
  draftItems: [],
  draftCustomerId: null,
  shouldOpenCreate: false,
  setDraft: (items, customerId = null) =>
    set({ draftItems: items, draftCustomerId: customerId, shouldOpenCreate: true }),
  clearDraft: () =>
    set({ draftItems: [], draftCustomerId: null, shouldOpenCreate: false }),
  consumeOpenSignal: () =>
    set({ shouldOpenCreate: false }),
}))
