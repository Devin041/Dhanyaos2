// ─── Agent Role Personas ──────────────────────────────────────────────────────
// Role-based personas that filter available tools and customize agent behavior.

export type AgentRole = 'founder' | 'cfo' | 'coo' | 'sales' | 'purchase'

export interface AgentPersona {
  id: AgentRole
  name: string
  icon: string          // lucide icon name
  tagline: string
  welcomeMessage: string
  suggestedQueries: string[]
  toolWhitelist: string[]
  toolBlacklist: string[]
  systemPromptAddendum: string
}

// ─── Persona Definitions ──────────────────────────────────────────────────────

export const PERSONAS: Record<AgentRole, AgentPersona> = {
  founder: {
    id: 'founder',
    name: 'Business Assistant',
    icon: 'Brain',
    tagline: 'Your all-in-one business command center',
    welcomeMessage:
      'Main aapka business assistant hoon. Orders, production, finance, inventory — sab kuch ek jagah. Kya help chahiye?',
    suggestedQueries: [
      'Aaj ka business summary do',
      'Overdue orders check karo',
      'Monthly revenue report banao',
      'Low stock fabric dikhao',
      'Production efficiency kaisi hai?',
      'Cash balance kitna hai?',
    ],
    toolWhitelist: [],
    toolBlacklist: [],
    systemPromptAddendum:
      'You are a versatile business assistant with access to ALL tools. Provide comprehensive, cross-functional insights. Connect data across orders, production, finance, and inventory to give the founder a complete picture.',
  },

  cfo: {
    id: 'cfo',
    name: 'Finance Assistant',
    icon: 'IndianRupee',
    tagline: 'Payments, receivables & financial insights',
    welcomeMessage: 'Finance desk active. Payments, receivables, cash balance, revenue — bolo!',
    suggestedQueries: [
      'Aaj ki transactions dikhao',
      'Cash balance kitna hai?',
      'Overdue payments ka report',
      'Customer ka ledger banao',
      'Monthly expense breakdown',
      'Revenue vs expense comparison',
    ],
    toolWhitelist: [
      'get_transactions', 'record_payment', 'get_customer_ledger', 'get_revenue_report',
      'get_aged_receivables', 'get_daily_summary', 'get_profit_analysis',
      'create_transaction', 'get_orders', 'get_order_detail', 'search_all',
    ],
    toolBlacklist: [
      'create_production_job', 'update_production_job', 'get_production_jobs',
      'get_quality_checks', 'create_quality_check', 'create_dispatch',
      'update_dispatch_status', 'record_dispatch_from_order',
    ],
    systemPromptAddendum:
      'You are a finance-focused assistant. Always frame answers around monetary impact, cash flow, and financial health. Use currency formatting (₹). Prioritize receivables, payables, and profitability analysis.',
  },

  coo: {
    id: 'coo',
    name: 'Operations Assistant',
    icon: 'Factory',
    tagline: 'Production, inventory & quality',
    welcomeMessage: 'Operations desk ready. Production status, inventory, quality checks — bolo!',
    suggestedQueries: [
      'Production status kya hai?',
      'Delayed jobs kaunse hain?',
      'Fabric stock dikhao',
      'Quality check report',
      'Production efficiency analyze karo',
      'Low stock alerts',
    ],
    toolWhitelist: [
      'get_production_jobs', 'get_inventory', 'get_quality_checks', 'get_grn_notes',
      'get_production_efficiency', 'get_inventory_alerts', 'get_daily_summary',
      'get_overdue_orders', 'get_orders', 'search_all',
    ],
    toolBlacklist: ['get_customer_ledger', 'get_aged_receivables', 'record_payment'],
    systemPromptAddendum:
      'You are an operations-focused assistant. Always frame answers around throughput, timelines, and resource utilization. Track production bottlenecks, inventory levels, and quality metrics.',
  },

  sales: {
    id: 'sales',
    name: 'Sales Assistant',
    icon: 'ShoppingBag',
    tagline: 'Orders, customers & dispatches',
    welcomeMessage: 'Sales assistant ready. Orders, customers, quotations, dispatches — bolo!',
    suggestedQueries: [
      'Naye orders dikhao',
      'Pending orders ka status',
      'Customer ABC ka history',
      'Quotation banao',
      'Dispatch status check karo',
      'Top customers kaunse hain?',
    ],
    toolWhitelist: [
      'get_orders', 'get_order_detail', 'get_customers', 'get_quotations',
      'get_dispatches', 'get_samples', 'get_overdue_orders', 'get_daily_summary',
      'create_sales_order', 'create_quotation_from_cost_sheet', 'create_dispatch',
      'create_sample', 'update_order_status', 'convert_quotation_to_order',
      'record_dispatch_from_order', 'search_all',
    ],
    toolBlacklist: [
      'get_production_efficiency', 'get_inventory_alerts', 'update_inventory',
      'record_grn_and_update_stock',
    ],
    systemPromptAddendum:
      'You are a sales-focused assistant. Always frame answers around customer relationships, order pipeline, revenue opportunities, and delivery timelines. Proactively suggest follow-ups and upsell opportunities.',
  },

  purchase: {
    id: 'purchase',
    name: 'Purchase Assistant',
    icon: 'Package',
    tagline: 'Suppliers, fabric stock & purchase orders',
    welcomeMessage: 'Purchase desk active. Suppliers, fabric stock, purchase orders — bolo!',
    suggestedQueries: [
      'Fabric stock dikhao',
      'Low stock fabric ka list',
      'Purchase order status',
      'Supplier ABC ke pending POs',
      'GRN note banao',
      'Fabric cost trend',
    ],
    toolWhitelist: [
      'get_inventory', 'get_suppliers', 'get_purchase_orders', 'get_grn_notes',
      'get_inventory_alerts', 'get_daily_summary', 'create_purchase_order',
      'create_grn_note', 'update_po_status', 'update_inventory',
      'record_grn_and_update_stock', 'search_all',
    ],
    toolBlacklist: [
      'get_customer_ledger', 'get_aged_receivables', 'get_production_jobs',
      'get_quality_checks', 'create_quality_check',
    ],
    systemPromptAddendum:
      'You are a purchase/procurement-focused assistant. Always frame answers around supplier performance, material availability, lead times, and procurement costs. Track purchase orders and goods received notes carefully.',
  },
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function getPersona(role: AgentRole): AgentPersona {
  return PERSONAS[role]
}

export function getRoleIcon(role: AgentRole): string {
  return PERSONAS[role].icon
}

export function getRoleColor(role: AgentRole): string {
  const colors: Record<AgentRole, string> = {
    founder: 'bg-primary/10 text-primary',
    cfo: 'bg-emerald-500/10 text-emerald-600',
    coo: 'bg-orange-500/10 text-orange-600',
    sales: 'bg-blue-500/10 text-blue-600',
    purchase: 'bg-purple-500/10 text-purple-600',
  }
  return colors[role]
}