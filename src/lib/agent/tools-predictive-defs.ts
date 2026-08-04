import type { ToolDef } from './tools'

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS ONLY — 3 PREDICTIVE INTELLIGENCE (lightweight, no db import)
// ═══════════════════════════════════════════════════════════════════════════════

export const TOOLS_PREDICTIVE: ToolDef[] = [
  {
    name: 'get_demand_forecast',
    description: 'Predict future demand based on historical order patterns. Shows expected order count, quantity, and revenue with trend direction.',
    parameters: {
      period: { type: 'string', description: 'Forecast period', enum: ['next_week', 'next_month', 'next_quarter'], required: true },
      customerName: { type: 'string', description: 'Filter forecast for a specific customer' },
      category: { type: 'string', description: 'Filter forecast for a specific style category' },
    },
  },
  {
    name: 'get_stock_prediction',
    description: 'Predict stock-out dates for fabrics based on current stock levels and historical consumption rate.',
    parameters: {
      days: { type: 'number', description: 'Forecast horizon in days (default 30)' },
    },
  },
  {
    name: 'get_trend_analysis',
    description: 'Analyze business trends over multiple periods. Shows growth rates, best/worst periods, and trend direction.',
    parameters: {
      metric: { type: 'string', description: 'Business metric to analyze', enum: ['orders', 'revenue', 'production', 'customers'], required: true },
      periods: { type: 'number', description: 'Number of periods to analyze (default 6)' },
    },
  },
]