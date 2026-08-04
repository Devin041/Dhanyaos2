export interface EvalTestCase {
  id: string
  query: string
  category: 'orders' | 'inventory' | 'cost-sheets' | 'production' | 'finance' | 'gst' | 'predictive' | 'dispatch' | 'customers-suppliers' | 'compound' | 'general' | 'scheduled' | 'quality' | 'samples'
  expectedTools?: string[]
  expectedToolsAnyOf?: string[]
  role?: 'founder' | 'cfo' | 'coo' | 'sales' | 'purchase'
  difficulty: 'easy' | 'medium' | 'hard'
  description: string
}

export const EVAL_TEST_CASES: EvalTestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // ORDERS (7 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'ORD-001',
    query: 'Pending orders dikhao',
    category: 'orders',
    expectedTools: ['get_orders'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Basic order list with status filter - most common query pattern',
  },
  {
    id: 'ORD-002',
    query: 'Aaj ki unpaid orders dikhaiye',
    category: 'orders',
    expectedTools: ['get_orders'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Orders filtered by payment status unpaid',
  },
  {
    id: 'ORD-003',
    query: 'SO-20260704-001 ka detail do',
    category: 'orders',
    expectedTools: ['get_order_detail'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Single order detail lookup by order number',
  },
  {
    id: 'ORD-004',
    query: 'Overdue orders kaunse hai? Kitne din late hai?',
    category: 'orders',
    expectedTools: ['get_overdue_orders'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Overdue/delayed orders with days late information',
  },
  {
    id: 'ORD-005',
    query: 'Dispatched orders dikhao last 10',
    category: 'orders',
    expectedTools: ['get_orders'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Orders with status filter and limit',
  },
  {
    id: 'ORD-006',
    query: 'Meera Fashions ke saare orders dikhao',
    category: 'orders',
    expectedTools: ['get_orders'],
    role: 'sales',
    difficulty: 'medium',
    description: 'Order search by customer name using search parameter',
  },
  {
    id: 'ORD-007',
    query: 'In Production mein kaunse orders hai aur unka status kya hai?',
    category: 'orders',
    expectedTools: ['get_orders'],
    role: 'coo',
    difficulty: 'medium',
    description: 'Orders in production status - COO needs visibility',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // INVENTORY (5 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'INV-001',
    query: 'Sabhi fabric stock dikhao',
    category: 'inventory',
    expectedTools: ['get_inventory'],
    role: 'purchase',
    difficulty: 'easy',
    description: 'Basic inventory listing - all fabrics',
  },
  {
    id: 'INV-002',
    query: 'Low stock fabric batao jahan 100m se kam hai',
    category: 'inventory',
    expectedTools: [],
    expectedToolsAnyOf: ['get_inventory', 'get_inventory_alerts'],
    role: 'purchase',
    difficulty: 'easy',
    description: 'Low stock fabrics - can use get_inventory with lowStockOnly or get_inventory_alerts',
  },
  {
    id: 'INV-003',
    query: 'Rayon fabric kitna hai stock mein?',
    category: 'inventory',
    expectedTools: ['get_inventory'],
    role: 'purchase',
    difficulty: 'easy',
    description: 'Inventory search by fabric name',
  },
  {
    id: 'INV-004',
    query: 'Koi bhi fabric zero stock pe toh nahi hai? Dikhao do',
    category: 'inventory',
    expectedTools: ['get_inventory_alerts'],
    role: 'coo',
    difficulty: 'medium',
    description: 'Zero stock alerts - specifically asks about zero stock fabrics',
  },
  {
    id: 'INV-005',
    query: 'Inventory alerts do aur batao total value kitni hai stock ki',
    category: 'inventory',
    expectedTools: ['get_inventory_alerts'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'Inventory alerts with total value - CFO perspective',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // COST SHEETS (5 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'CST-001',
    query: 'Farsi kurti costing dikhao',
    category: 'cost-sheets',
    expectedTools: ['get_cost_sheets'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Cost sheet search by style name',
  },
  {
    id: 'CST-002',
    query: 'CS-20260711-002 ka full detail do with all items',
    category: 'cost-sheets',
    expectedTools: ['get_cost_sheet_detail'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Detailed cost sheet with all cost items and color breakdown',
  },
  {
    id: 'CST-003',
    query: 'Approved cost sheets dikhao',
    category: 'cost-sheets',
    expectedTools: ['get_cost_sheets'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Cost sheets filtered by approved status',
  },
  {
    id: 'CST-004',
    query: 'Draft costing sheets hai kya?',
    category: 'cost-sheets',
    expectedTools: ['get_cost_sheets'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Cost sheets filtered by draft status',
  },
  {
    id: 'CST-005',
    query: 'Pleating Kurti ki costing mein fabric ka consumption kitna hai per piece?',
    category: 'cost-sheets',
    expectedTools: [],
    expectedToolsAnyOf: ['get_cost_sheet_detail', 'get_cost_sheets'],
    role: 'purchase',
    difficulty: 'medium',
    description: 'Cost sheet search for specific style to check fabric consumption detail',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // PRODUCTION (5 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'PRD-001',
    query: 'Production jobs dikhao',
    category: 'production',
    expectedTools: ['get_production_jobs'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Basic production job listing',
  },
  {
    id: 'PRD-002',
    query: 'Pending production jobs hai kya abhi?',
    category: 'production',
    expectedTools: ['get_production_jobs'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Production jobs filtered by pending status',
  },
  {
    id: 'PRD-003',
    query: 'Jo jobs in progress mein hai unka progress percentage batao',
    category: 'production',
    expectedTools: ['get_production_jobs'],
    role: 'coo',
    difficulty: 'medium',
    description: 'In-progress jobs with progress tracking',
  },
  {
    id: 'PRD-004',
    query: 'Production efficiency kaisi hai? Completion rate aur delayed jobs batao',
    category: 'production',
    expectedTools: ['get_production_efficiency'],
    role: 'coo',
    difficulty: 'medium',
    description: 'Production efficiency analytics - completion rate and delays',
  },
  {
    id: 'PRD-005',
    query: 'Completed jobs dikhao recently',
    category: 'production',
    expectedTools: ['get_production_jobs'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Completed production jobs listing',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // FINANCE (7 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'FIN-001',
    query: 'Aaj ka business summary do',
    category: 'finance',
    expectedTools: ['get_daily_summary'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Daily business briefing - most common founder query',
  },
  {
    id: 'FIN-002',
    query: 'Revenue report banao last 7 days ka',
    category: 'finance',
    expectedTools: ['get_revenue_report'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Revenue report for this_week period',
  },
  {
    id: 'FIN-003',
    query: 'Is mahine ki revenue kitni hai?',
    category: 'finance',
    expectedTools: ['get_revenue_report'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Monthly revenue report - this_month period',
  },
  {
    id: 'FIN-004',
    query: 'Meera Fashions ka ledger dikhao',
    category: 'finance',
    expectedTools: ['get_customer_ledger'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Customer ledger for a specific customer',
  },
  {
    id: 'FIN-005',
    query: 'Profit analysis karo style-wise',
    category: 'finance',
    expectedTools: ['get_profit_analysis'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'Profit analysis grouped by style',
  },
  {
    id: 'FIN-006',
    query: 'Outstanding payments kaunse hai? 90+ din purane bhi batao',
    category: 'finance',
    expectedTools: ['get_aged_receivables'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'Aged receivables with extended aging buckets',
  },
  {
    id: 'FIN-007',
    query: 'Recent transactions dikhao',
    category: 'finance',
    expectedTools: ['get_transactions'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Basic financial transactions listing',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GST (4 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'GST-001',
    query: 'GST liability kitni hai this month?',
    category: 'gst',
    expectedTools: ['get_gst_summary'],
    role: 'cfo',
    difficulty: 'easy',
    description: 'Monthly GST liability summary with CGST/SGST/IGST breakdown',
  },
  {
    id: 'GST-002',
    query: 'GSTR-1 draft banao is quarter ka',
    category: 'gst',
    expectedTools: ['get_gstr1_draft'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'GSTR-1 draft for quarterly filing with outward supply details',
  },
  {
    id: 'GST-003',
    query: 'GSTR-3B return draft dikhao',
    category: 'gst',
    expectedTools: ['get_gstr3b_draft'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'GSTR-3B return draft with net tax liability',
  },
  {
    id: 'GST-004',
    query: 'HSN code wise GST summary do',
    category: 'gst',
    expectedTools: ['get_gst_hsn_summary'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'HSN-code wise GST summary for filing reference',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // PREDICTIVE (3 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'PRC-001',
    query: 'Agle mahine demand kya aane wali hai?',
    category: 'predictive',
    expectedTools: ['get_demand_forecast'],
    role: 'founder',
    difficulty: 'medium',
    description: 'Next month demand forecast based on historical patterns',
  },
  {
    id: 'PRC-002',
    query: 'Kaunse fabrics stock out hone wale hai next 30 days mein?',
    category: 'predictive',
    expectedTools: ['get_stock_prediction'],
    role: 'purchase',
    difficulty: 'medium',
    description: 'Stock-out prediction for next 30 days based on consumption rate',
  },
  {
    id: 'PRC-003',
    query: 'Revenue ka trend analysis karo last 6 months ka',
    category: 'predictive',
    expectedTools: ['get_trend_analysis'],
    role: 'cfo',
    difficulty: 'medium',
    description: 'Revenue trend analysis with growth rates and direction',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // DISPATCH (3 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'DSP-001',
    query: 'Pending dispatches dikhao',
    category: 'dispatch',
    expectedTools: ['get_dispatches'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Pending dispatch records listing',
  },
  {
    id: 'DSP-002',
    query: 'Aaj ki shipped dispatches kaunsi hai?',
    category: 'dispatch',
    expectedTools: ['get_dispatches'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Dispatches filtered by shipped status',
  },
  {
    id: 'DSP-003',
    query: 'Delivered dispatches dikhao last 10',
    category: 'dispatch',
    expectedTools: ['get_dispatches'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Delivered dispatches with limit',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CUSTOMERS / SUPPLIERS (4 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'CSU-001',
    query: 'Saare customers ka list dikhao',
    category: 'customers-suppliers',
    expectedTools: ['get_customers'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Basic customer listing',
  },
  {
    id: 'CSU-002',
    query: 'Suppliers dikhao fabric wale',
    category: 'customers-suppliers',
    expectedTools: ['get_suppliers'],
    role: 'purchase',
    difficulty: 'easy',
    description: 'Supplier listing for fabric procurement',
  },
  {
    id: 'CSU-003',
    query: 'Jaipur wale suppliers kaunse hai?',
    category: 'customers-suppliers',
    expectedTools: ['get_suppliers'],
    role: 'purchase',
    difficulty: 'medium',
    description: 'Supplier search - may need to search by city context',
  },
  {
    id: 'CSU-004',
    query: 'Meera Fashions ka details dikhao phone aur GST number ke saath',
    category: 'customers-suppliers',
    expectedTools: ['get_customers'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Customer detail lookup with contact and GST info',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPOUND / MULTI-DOMAIN (7 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'CMP-001',
    query: 'Aaj ka report do aur pending orders bhi dikhao',
    category: 'compound',
    expectedTools: ['get_daily_summary', 'get_orders'],
    role: 'founder',
    difficulty: 'hard',
    description: 'Multi-tool: daily summary + pending orders in single response',
  },
  {
    id: 'CMP-002',
    query: 'Low stock fabric aur pending production dono dikhao',
    category: 'compound',
    expectedToolsAnyOf: ['get_inventory', 'get_inventory_alerts'],
    expectedTools: ['get_production_jobs'],
    role: 'coo',
    difficulty: 'hard',
    description: 'Multi-tool: inventory alerts/low stock + pending production jobs',
  },
  {
    id: 'CMP-003',
    query: 'Revenue report this month ka aur overdue orders bhi batao',
    category: 'compound',
    expectedTools: ['get_revenue_report', 'get_overdue_orders'],
    role: 'founder',
    difficulty: 'hard',
    description: 'Multi-tool: revenue report + overdue orders for founder overview',
  },
  {
    id: 'CMP-004',
    query: 'GST summary this month ka aur HSN wise bhi do',
    category: 'compound',
    expectedTools: ['get_gst_summary', 'get_gst_hsn_summary'],
    role: 'cfo',
    difficulty: 'hard',
    description: 'Multi-tool: GST liability summary + HSN-wise breakdown for filing',
  },
  {
    id: 'CMP-005',
    query: 'Pending dispatches dikhao aur batao kaunse orders ka payment bhi pending hai',
    category: 'compound',
    expectedTools: ['get_dispatches', 'get_orders'],
    role: 'coo',
    difficulty: 'hard',
    description: 'Multi-tool: pending dispatches + unpaid orders for operations planning',
  },
  {
    id: 'CMP-006',
    query: 'Production efficiency dikhao aur sath mein pending jobs bhi',
    category: 'compound',
    expectedTools: ['get_production_efficiency', 'get_production_jobs'],
    role: 'coo',
    difficulty: 'hard',
    description: 'Multi-tool: production efficiency metrics + pending jobs list',
  },
  {
    id: 'CMP-007',
    query: 'Aaj ka summary do, overdue orders bhi, aur inventory alerts bhi dikhao',
    category: 'compound',
    expectedTools: ['get_daily_summary', 'get_overdue_orders', 'get_inventory_alerts'],
    role: 'founder',
    difficulty: 'hard',
    description: 'Multi-tool: 3-tool morning briefing - summary + overdue + inventory alerts',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // GENERAL / GREETING (2 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'GEN-001',
    query: 'Hi, aaj kya chal raha hai business mein?',
    category: 'general',
    expectedTools: ['get_daily_summary'],
    role: 'founder',
    difficulty: 'easy',
    description: 'Casual greeting that should trigger daily summary for founder',
  },
  {
    id: 'GEN-002',
    query: 'System mein kya tools available hai?',
    category: 'general',
    expectedTools: ['get_system_info'],
    role: 'founder',
    difficulty: 'easy',
    description: 'System information query - should call get_system_info',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCHEDULED REPORTS (2 cases)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'SCH-001',
    query: 'Har roz subah 9 baje daily summary bhejna schedule karo',
    category: 'scheduled',
    expectedTools: ['create_scheduled_report'],
    role: 'founder',
    difficulty: 'medium',
    description: 'Schedule a daily recurring report for morning briefing',
  },
  {
    id: 'SCH-002',
    query: 'Scheduled reports ka list dikhao',
    category: 'scheduled',
    expectedTools: ['list_scheduled_reports'],
    role: 'founder',
    difficulty: 'easy',
    description: 'List all configured scheduled reports',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // QUALITY (1 case)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'QTY-001',
    query: 'Recent quality checks dikhao aur batao kitne pass hain kitne fail',
    category: 'quality',
    expectedTools: ['get_quality_checks'],
    role: 'coo',
    difficulty: 'easy',
    description: 'Quality check records with pass/fail information',
  },

  // ═══════════════════════════════════════════════════════════════════════════════
  // SAMPLES (1 case)
  // ═══════════════════════════════════════════════════════════════════════════════
  {
    id: 'SMP-001',
    query: 'Samples ka status dikhao kaunse pending hai kaunse approved',
    category: 'samples',
    expectedTools: ['get_samples'],
    role: 'sales',
    difficulty: 'easy',
    description: 'Sample/trial records listing with status tracking',
  },
]