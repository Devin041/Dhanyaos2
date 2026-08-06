'use client'

import React, { useState, useEffect, useCallback, type ComponentType } from 'react'
import { Loader2, AlertTriangle, RotateCcw, Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDashboardStore, type DashboardView } from '@/store/dashboard-store'

// ─── View labels (moved from page.tsx) ────────────────────────────────────

export const viewLabels: Record<DashboardView, string> = {
  founder: 'Founder Dashboard',
  cfo: 'CFO Dashboard',
  coo: 'COO Dashboard',
  sales: 'Sales Dashboard',
  purchase: 'Purchase Dashboard',
  brand: 'Brand Dashboard',
  investor: 'Investor Dashboard',
  production: 'Production',
  sampling: 'Sampling',
  quality: 'Quality Control',
  vendors: 'Vendors',
  orders: 'Sales Orders',
  customers: 'Customers',
  quotations: 'Quotations',
  pos: 'Purchase Orders',
  fabric: 'Fabric Stock',
  inventory: 'Inventory',
  accounts: 'Accounts',
  cashflow: 'Cash Flow',
  reports: 'Reports',
  'ai-advisor': 'AI Advisor',
  analytics: 'Analytics',
  suppliers: 'Suppliers',
  workers: 'Workers',
  styles: 'Style Master',
  costing: 'Product Costing',
  'client-catalog': 'Client Catalog',
  'sample-catalog': 'Sample Catalog',
  'gst-reports': 'GST Reports',
  grn: 'Goods Received Note (GRN)',
  dispatch: 'Dispatch & Shipping',
  returns: 'Returns Management',
  consumption: 'Fabric Consumption',
  reservations: 'Stock Reservations',
  'ai-agent': 'AI Agent',
  'fg-inventory': 'Finished Goods',
  'company-settings': 'Company Settings',
  'invoices': 'Invoices & Payments',
}

// ─── Module loader registry (import functions only, NOT evaluated at compile time) ──
// Each entry is a function that returns a Promise resolving to the named export.
// These are only CALLED when the view changes, spreading compilation over time.

type ModuleLoaderFn = () => Promise<ComponentType>

const moduleLoaders: Record<DashboardView, ModuleLoaderFn> = {
  founder: () => import('@/components/dashboard/founder-dashboard').then(m => m.FounderDashboard),
  cfo: () => import('@/components/dashboard/cfo-dashboard').then(m => m.CfoDashboard),
  coo: () => import('@/components/dashboard/coo-dashboard').then(m => m.CooDashboard),
  sales: () => import('@/components/dashboard/sales-dashboard').then(m => m.SalesDashboard),
  purchase: () => import('@/components/dashboard/purchase-dashboard').then(m => m.PurchaseDashboard),
  brand: () => import('@/components/dashboard/brand-dashboard').then(m => m.BrandDashboard),
  investor: () => import('@/components/dashboard/investor-dashboard').then(m => m.InvestorDashboard),
  'ai-advisor': () => import('@/components/dashboard/ai-advisor').then(m => m.AIAdvisor),
  orders: () => import('@/components/modules/sales-orders').then(m => m.SalesOrders),
  production: () => import('@/components/modules/production').then(m => m.ProductionModule),
  customers: () => import('@/components/modules/customers').then(m => m.Customers),
  pos: () => import('@/components/modules/purchase-orders').then(m => m.PurchaseOrders),
  fabric: () => import('@/components/modules/fabric-stock').then(m => m.FabricStock),
  inventory: () => import('@/components/modules/inventory').then(m => m.InventoryModule),
  cashflow: () => import('@/components/modules/cashflow').then(m => m.CashFlowModule),
  accounts: () => import('@/components/modules/accounts').then(m => m.AccountsModule),
  quality: () => import('@/components/modules/quality-control').then(m => m.QualityControlModule),
  vendors: () => import('@/components/modules/vendors').then(m => m.VendorsModule),
  reports: () => import('@/components/modules/reports').then(m => m.ReportsModule),
  sampling: () => import('@/components/modules/sampling').then(m => m.SamplingModule),
  analytics: () => import('@/components/modules/analytics').then(m => m.AnalyticsModule),
  quotations: () => import('@/components/modules/quotations').then(m => m.Quotations),
  suppliers: () => import('@/components/modules/suppliers').then(m => m.Suppliers),
  workers: () => import('@/components/modules/workers').then(m => m.Workers),
  styles: () => import('@/components/modules/style-master').then(m => m.StyleMaster),
  costing: () => import('@/components/modules/costing').then(m => m.CostingModule),
  'client-catalog': () => import('@/components/modules/client-catalog').then(m => m.ClientCatalogModule),
  'sample-catalog': () => import('@/components/modules/sample-catalog').then(m => m.SampleCatalogModule),
  grn: () => import('@/components/modules/grn').then(m => m.GrnModule),
  dispatch: () => import('@/components/modules/dispatch').then(m => m.DispatchModule),
  returns: () => import('@/components/modules/returns').then(m => m.ReturnsModule),
  'gst-reports': () => import('@/components/modules/gst-reports').then(m => m.GstReports),
  consumption: () => import('@/components/modules/consumption').then(m => m.ConsumptionModule),
  reservations: () => import('@/components/modules/reservations').then(m => m.ReservationsModule),
  'ai-agent': () => import('@/components/dashboard/ai-agent').then(m => m.AIAgent),
  'fg-inventory': () => import('@/components/modules/fg-inventory').then(m => m.FGInventoryModule),
  'company-settings': () => import('@/components/modules/company-settings').then(m => m.CompanySettingsModule),
  'invoices': () => import('@/components/modules/invoices').then(m => m.InvoiceModule),
}

// ─── In-memory cache for loaded modules ───────────────────────────────────

const moduleCache = new Map<string, ComponentType>()

// ─── Module Error Boundary ────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ModuleErrorBoundary extends React.Component<
  { children: React.ReactNode; viewName: string; onRetry?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; viewName: string; onRetry?: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            The <strong>{this.props.viewName}</strong> module encountered an unexpected error.
          </p>
          {this.state.error && (
            <p className="max-w-lg text-xs text-muted-foreground/70 font-mono bg-muted/50 rounded-lg p-3 break-all">
              {this.state.error.message}
            </p>
          )}
          <Button
            variant="outline"
            className="gap-2 mt-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={this.handleRetry}
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Coming Soon ─────────────────────────────────────────────────────────

function ComingSoonView({ view }: { view: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Construction className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold">{viewLabels[view as DashboardView] || view}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This module is under development. It will be available in the next Dhanya OS update as part of Project Dhanya 2030.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-xs text-muted-foreground">Coming Soon</span>
      </div>
    </div>
  )
}

// ─── Loading Spinner ─────────────────────────────────────────────────────

function ModuleLoader() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading module…</p>
    </div>
  )
}

// ─── Main Module Resolver ────────────────────────────────────────────────

export function ModuleResolver() {
  const { activeView } = useDashboardStore()
  const [Component, setComponent] = useState<ComponentType | null>(() => {
    // Try to return cached component synchronously for initial render
    return moduleCache.get(activeView) ?? null
  })
  const [loadKey, setLoadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadModule = useCallback((view: DashboardView) => {
    // Check cache first
    const cached = moduleCache.get(view)
    if (cached) {
      setComponent(() => cached)
      setError(null)
      return
    }

    setComponent(null)
    setError(null)

    const loader = moduleLoaders[view]
    if (!loader) {
      setError(`Unknown module: ${view}`)
      return
    }

    loader()
      .then((mod) => {
        moduleCache.set(view, mod)
        setComponent(() => mod)
      })
      .catch((err) => {
        console.error(`[ModuleResolver] Failed to load "${view}":`, err)
        setError(err.message)
      })
  }, [])

  useEffect(() => {
    loadModule(activeView)
  }, [activeView, loadModule])

  // Retry handler: invalidate cache and reload
  const handleRetry = useCallback(() => {
    moduleCache.delete(activeView)
    setLoadKey((k) => k + 1)
  }, [activeView])

  const viewName = viewLabels[activeView] || activeView

  // Unknown view → Coming Soon
  if (!moduleLoaders[activeView]) {
    return <ComingSoonView view={activeView} />
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
          <AlertTriangle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Module Load Error</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Failed to load <strong>{viewName}</strong>.
        </p>
        <p className="max-w-lg text-xs text-muted-foreground/70 font-mono bg-muted/50 rounded-lg p-3 break-all">
          {error}
        </p>
        <Button
          variant="outline"
          className="gap-2 mt-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={handleRetry}
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  // Loading state
  if (!Component) {
    return <ModuleLoader />
  }

  // Render the loaded module inside an error boundary
  return (
    <ModuleErrorBoundary
      viewName={viewName}
      key={`${activeView}-${loadKey}`}
      onRetry={handleRetry}
    >
      <Component />
    </ModuleErrorBoundary>
  )
}