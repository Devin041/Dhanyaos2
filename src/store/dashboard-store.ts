import { create } from 'zustand'

export type DashboardView =
  | 'founder'
  | 'cfo'
  | 'coo'
  | 'sales'
  | 'purchase'
  | 'brand'
  | 'investor'
  | 'production'
  | 'sampling'
  | 'quality'
  | 'vendors'
  | 'orders'
  | 'customers'
  | 'quotations'
  | 'pos'
  | 'fabric'
  | 'inventory'
  | 'accounts'
  | 'cashflow'
  | 'reports'
  | 'ai-advisor'
  | 'analytics'
  | 'suppliers'
  | 'workers'
  | 'styles'
  | 'costing'
  | 'client-catalog'
  | 'gst-reports'
  | 'grn'
  | 'dispatch'
  | 'returns'
  | 'consumption'
  | 'reservations'
  | 'sample-catalog'
  | 'ai-agent'
  | 'eval'
  | 'fg-inventory'
  | 'company-settings'
  | 'invoices'
  | 'product-tracker'
  | 'pnl'
  | 'ar-aging'
  | 'job-costing'
  | 'banking'
  | 'gst-returns'
  | 'bom'
  | 'payments-out'
  | 'chequebook'
  | 'ledger'

// Data passed from Client Catalog → Costing Module (pre-fill)
export interface PendingCostingData {
  styleNo: string
  styleName: string
  image: string | null
}

interface DashboardState {
  activeView: DashboardView
  setActiveView: (view: DashboardView) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  // Pre-fill costing from Client Catalog
  pendingCosting: PendingCostingData | null
  setPendingCosting: (data: PendingCostingData | null) => void
  navigateToCosting: (data: PendingCostingData) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeView: 'founder',
  setActiveView: (view) => set({ activeView: view }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  pendingCosting: null,
  setPendingCosting: (data) => set({ pendingCosting: data }),
  navigateToCosting: (data) => set({ activeView: 'costing', pendingCosting: data }),
}))