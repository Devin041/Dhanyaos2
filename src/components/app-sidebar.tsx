'use client'

import {
  Diamond,
  LayoutDashboard,
  Factory,
  Cog,
  Scissors,
  ShieldCheck,
  Handshake,
  ShoppingCart,
  FileText,
  Users,
  FileSpreadsheet,
  Package,
  PackageSearch,
  ShoppingBag,
  Truck,
  Layers,
  Warehouse,
  IndianRupee,
  Receipt,
  TrendingUp,
  BarChart3,
  Brain,
  Bot,
  LineChart,
  Crown,
  Briefcase,
  Palette,
  Shirt,
  Database,
  Calculator,
  ClipboardCheck,
  RotateCcw,
  Scale,
  BookMarked,
  BookOpen,
  Sparkles,
  FlaskConical,
  Camera,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar'
import { useDashboardStore, type DashboardView } from '@/store/dashboard-store'

interface NavItem {
  label: string
  icon: LucideIcon
  view: DashboardView
}

interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Dashboards',
    icon: LayoutDashboard,
    items: [
      { label: 'Founder', icon: Crown, view: 'founder' },
      { label: 'CFO', icon: IndianRupee, view: 'cfo' },
      { label: 'COO', icon: Factory, view: 'coo' },
      { label: 'Sales', icon: ShoppingCart, view: 'sales' },
      { label: 'Purchase', icon: ShoppingBag, view: 'purchase' },
      { label: 'Brand', icon: Palette, view: 'brand' },
      { label: 'Investor', icon: Briefcase, view: 'investor' },
    ],
  },
  {
    label: 'Master Data',
    icon: Database,
    items: [
      { label: 'Style Master', icon: Shirt, view: 'styles' },
      { label: 'Workers', icon: Users, view: 'workers' },
    ],
  },
  {
    label: 'Operations',
    icon: Factory,
    items: [
      { label: 'Costing', icon: Calculator, view: 'costing' },
      { label: 'Client Catalog', icon: BookOpen, view: 'client-catalog' },
      { label: 'Sample Catalog', icon: Camera, view: 'sample-catalog' },
      { label: 'Production', icon: Cog, view: 'production' },
      { label: 'Sampling', icon: Scissors, view: 'sampling' },
      { label: 'Quality Control', icon: ShieldCheck, view: 'quality' },
      { label: 'Vendors', icon: Handshake, view: 'vendors' },
    ],
  },
  {
    label: 'Commerce',
    icon: ShoppingCart,
    items: [
      { label: 'Sales Orders', icon: FileText, view: 'orders' },
      { label: 'Customers', icon: Users, view: 'customers' },
      { label: 'Quotations', icon: FileSpreadsheet, view: 'quotations' },
    ],
  },
  {
    label: 'Supply Chain',
    icon: Package,
    items: [
      { label: 'Suppliers', icon: Truck, view: 'suppliers' },
      { label: 'Purchase Orders', icon: ShoppingBag, view: 'pos' },
      { label: 'Fabric Stock', icon: Layers, view: 'fabric' },
      { label: 'Inventory', icon: Warehouse, view: 'inventory' },
      { label: 'GRN', icon: ClipboardCheck, view: 'grn' },
      { label: 'Dispatch', icon: Truck, view: 'dispatch' },
      { label: 'Returns', icon: RotateCcw, view: 'returns' },
      { label: 'Consumption', icon: Scale, view: 'consumption' },
      { label: 'Reservations', icon: BookMarked, view: 'reservations' },
      { label: 'Finished Goods', icon: PackageSearch, view: 'fg-inventory' },
    ],
  },
  {
    label: 'Finance',
    icon: IndianRupee,
    items: [
      { label: 'Accounts', icon: Receipt, view: 'accounts' },
      { label: 'Cash Flow', icon: TrendingUp, view: 'cashflow' },
      { label: 'Reports', icon: BarChart3, view: 'reports' },
      { label: 'GST Reports', icon: FileSpreadsheet, view: 'gst-reports' },
    ],
  },
  {
    label: 'Intelligence',
    icon: Brain,
    items: [
      { label: 'AI Agent', icon: Sparkles, view: 'ai-agent' },
      { label: 'AI Advisor', icon: Bot, view: 'ai-advisor' },
      { label: 'Analytics', icon: LineChart, view: 'analytics' },
      { label: 'Eval Harness', icon: FlaskConical, view: 'eval' },
      { label: 'Company Settings', icon: Settings, view: 'company-settings' },
    ],
  },
]

export function AppSidebar() {
  const { activeView, setActiveView } = useDashboardStore()

  return (
    <Sidebar>
      {/* Gold accent bar at top */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-sidebar-primary/60 to-transparent" />
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15">
            <Diamond className="size-5 text-sidebar-primary" />
          </div>
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <span className="gold-shimmer text-lg font-bold tracking-tight">
              Dhanya OS
            </span>
            <span className="truncate text-xs text-sidebar-foreground/50">
              Elysé by Dhanya
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, groupIdx) => (
          <SidebarGroup key={group.label}>
            {groupIdx === 1 && (
              <div className="-mx-2 mb-1 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
            )}
            <SidebarGroupLabel>
              <group.icon />
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.view}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeView === item.view}
                      tooltip={item.label}
                      onClick={() => setActiveView(item.view)}
                    >
                      <button type="button" className="w-full text-left">
                        <item.icon />
                        <span>{item.label}</span>
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-sidebar-foreground/40">
            v1.0 Enterprise · Project Dhanya 2030
          </span>
          <span className="text-xs text-sidebar-foreground/30">
            {new Date().toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}