import { PrismaClient } from '@prisma/client'
import { subDays, format, startOfMonth, eachDayOfInterval } from 'date-fns'

const db = new PrismaClient()

function randomBetween(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function main() {
  console.log('🌱 Seeding Dhanya Lifestyle ERP...')

  // ─── SAFETY CHECK: Don't wipe existing user data ────────────────────
  const forceSeed = process.env.FORCE_SEED === '1'
  const existingSamples = await db.sample.count()
  const existingCostSheets = await db.costSheet.count()
  const existingCustomers = await db.customer.count()
  const existingOrders = await db.salesOrder.count()

  if (!forceSeed && (existingSamples > 0 || existingCostSheets > 0 || existingOrders > 0)) {
    console.error('')
    console.error('⚠️  DATA SAFETY CHECK — ABORTING SEED')
    console.error(`   Found existing data: ${existingSamples} samples, ${existingCostSheets} cost sheets, ${existingOrders} orders`)
    console.error('   Running seed would DELETE all existing data including user-added records.')
    console.error('')
    console.error('   If you REALLY want to wipe and re-seed, run:')
    console.error('   > FORCE_SEED=1 bun run db:seed')
    console.error('')
    process.exit(1)
  }

  // If only customers/suppliers exist (no user data), allow seed
  if (existingCustomers > 0) {
    console.log(`ℹ️  Found ${existingCustomers} existing customers — keeping them, adding missing seed data`)
  }

  // Clean existing data (only runs when no user data exists)
  await db.costItem.deleteMany()
  await db.costSheetColor.deleteMany()
  await db.costSheet.deleteMany()
  await db.qualityCheck.deleteMany()
  await db.sample.deleteMany()
  await db.quotationItem.deleteMany()
  await db.quotation.deleteMany()
  await db.alert.deleteMany()
  await db.dailySnapshot.deleteMany()
  await db.transaction.deleteMany()
  await db.productionJob.deleteMany()
  // FGStockBin uses separate FK tables, skip cascade delete
  await db.fabricStock.deleteMany()
  await db.purchaseOrder.deleteMany()
  await db.orderItem.deleteMany()
  await db.salesOrder.deleteMany()
  await db.style.deleteMany()
  await db.employee.deleteMany()
  await db.supplier.deleteMany()
  await db.customer.deleteMany()
  await db.broker.deleteMany()

  // ============ CUSTOMERS ============
  const customers = [
    { companyName: "Rajeshwari Textiles", buyerName: "Rajeshwari Patel", gstNumber: "24AABCR1234F1Z5", paymentTerms: 30, creditLimit: 500000, phone: "9876543210", email: "rajeshwari@rajeshwaritextiles.in", billingAddress: "Surat, Gujarat", shippingAddress: "Surat, Gujarat" },
    { companyName: "Meera Fashions", buyerName: "Meera Shah", gstNumber: "24AABCM5678G2H6", paymentTerms: 15, creditLimit: 300000, phone: "9876543211", email: "meera@meerafashions.in", billingAddress: "Mumbai, Maharashtra", shippingAddress: "Mumbai, Maharashtra" },
    { companyName: "Pooja Collections", buyerName: "Pooja Jain", gstNumber: "24AABCP9012H3I7", paymentTerms: 30, creditLimit: 400000, phone: "9876543212", email: "pooja@poojacollections.in", billingAddress: "Jaipur, Rajasthan", shippingAddress: "Jaipur, Rajasthan" },
    { companyName: "Trendy ethnic", buyerName: "Amit Kumar", gstNumber: "24AABCT3456I4J8", paymentTerms: 45, creditLimit: 600000, phone: "9876543213", email: "amit@trendyethnic.in", billingAddress: "Delhi", shippingAddress: "Delhi" },
    { companyName: "Shree Krishna Traders", buyerName: "Krishna Agarwal", gstNumber: "24AABCS7890J5K9", paymentTerms: 30, creditLimit: 350000, phone: "9876543214", email: "krishna@sktraders.in", billingAddress: "Ahmedabad, Gujarat", shippingAddress: "Ahmedabad, Gujarat" },
    { companyName: "Vastra Lifestyle", buyerName: "Neha Verma", gstNumber: "24AABCV2345K6L0", paymentTerms: 15, creditLimit: 250000, phone: "9876543215", email: "neha@vastralifestyle.in", billingAddress: "Bangalore, Karnataka", shippingAddress: "Bangalore, Karnataka" },
    { companyName: "Anaya Wholesale", buyerName: "Anaya Reddy", gstNumber: "24AABCA6789L7M1", paymentTerms: 30, creditLimit: 450000, phone: "9876543216", email: "anaya@anayawholesale.in", billingAddress: "Hyderabad, Telangana", shippingAddress: "Hyderabad, Telangana" },
    { companyName: "Rangoli Creations", buyerName: "Rangoli Desai", gstNumber: "24AABCR0123M8N2", paymentTerms: 60, creditLimit: 200000, phone: "9876543217", email: "rangoli@rangolicreations.in", billingAddress: "Pune, Maharashtra", shippingAddress: "Pune, Maharashtra" },
    { companyName: "Suhani Exports", buyerName: "Suhani Malhotra", gstNumber: "24AABCS4567N9O3", paymentTerms: 30, creditLimit: 700000, phone: "9876543218", email: "suhani@suhanexports.in", billingAddress: "Ahmedabad, Gujarat", shippingAddress: "Ahmedabad, Gujarat" },
    { companyName: "Kashish Fashion Hub", buyerName: "Kashish Gupta", gstNumber: "24AABCK8901O0P4", paymentTerms: 15, creditLimit: 300000, phone: "9876543219", email: "kashish@kashishfashion.in", billingAddress: "Lucknow, UP", shippingAddress: "Lucknow, UP" },
  ]

  const createdCustomers = []
  for (const c of customers) {
    const customer = await db.customer.create({ data: c })
    createdCustomers.push(customer)
  }
  console.log(`✅ Created ${createdCustomers.length} customers`)

  // ============ SUPPLIERS ============
  const suppliers = [
    { name: "Surat Fabric House", supplierType: "Fabric", contactPerson: "Dinesh Patel", phone: "9988776601", email: "dinesh@suratfabric.in", paymentTerms: 15, rating: 4 },
    { name: "Ahmedabad Textile Mills", supplierType: "Fabric", contactPerson: "Hitesh Shah", phone: "9988776602", email: "hitesh@atmills.in", paymentTerms: 15, rating: 5 },
    { name: "Kolkata Silk Traders", supplierType: "Fabric", contactPerson: "Arun Das", phone: "9988776603", email: "arun@kolkatasilk.in", paymentTerms: 30, rating: 4 },
    { name: "Rajasthan Print Works", supplierType: "Print", contactPerson: "Gopal Singh", phone: "9988776604", email: "gopal@rajprint.in", paymentTerms: 15, rating: 3 },
    { name: "Delhi Embroidery House", supplierType: "Embroidery", contactPerson: "Suresh Yadav", phone: "9988776605", email: "suresh@delhiemb.in", paymentTerms: 7, rating: 4 },
    { name: "Mumbai Accessories Ltd", supplierType: "Accessories", contactPerson: "Farhan Khan", phone: "9988776606", email: "farhan@mumbaiacc.in", paymentTerms: 15, rating: 5 },
  ]

  const createdSuppliers = []
  for (const s of suppliers) {
    const supplier = await db.supplier.create({ data: s })
    createdSuppliers.push(supplier)
  }
  console.log(`✅ Created ${createdSuppliers.length} suppliers`)

  // ============ EMPLOYEES ============
  const employees = [
    { name: "Production Head", department: "Production", designation: "Production Manager", salary: 35000, dailyWage: 1500, phone: "9898111101", skills: "Planning, Supervision, Quality Control, Fabric Knowledge" },
    { name: "Master Cutter", department: "Production", designation: "Cutter", salary: 18000, dailyWage: 800, phone: "9898111102", skills: "Fabric Cutting, Pattern Making, Marker Efficiency" },
    { name: "Stitching Lead", department: "Production", designation: "Tailor", salary: 16000, dailyWage: 700, phone: "9898111103", skills: "Stitching, Seaming, Finishing, Industrial Machine" },
    { name: "QC Inspector", department: "Quality", designation: "QC Manager", salary: 22000, dailyWage: 1000, phone: "9898111104", skills: "Quality Inspection, Defect Analysis, Measurement" },
    { name: "Accounts Head", department: "Finance", designation: "Accountant", salary: 25000, dailyWage: 1100, phone: "9898111105", skills: "Tally, GST Filing, Bookkeeping, Excel" },
    { name: "Sales Coordinator", department: "Sales", designation: "Sales Executive", salary: 20000, dailyWage: 900, phone: "9898111106", skills: "B2B Sales, Client Relations, Order Management" },
    { name: "Merchandiser", department: "Merchandising", designation: "Senior Merchandiser", salary: 28000, dailyWage: 1200, phone: "9898111107", skills: "Trend Forecasting, Fabric Sourcing, Costing, Negotiation" },
    { name: "Factory Helper 1", department: "Production", designation: "Helper", salary: 12000, dailyWage: 550, phone: "9898111108", skills: "Fabric Handling, Packing, Material Movement" },
    { name: "Factory Helper 2", department: "Production", designation: "Helper", salary: 12000, dailyWage: 550, phone: "9898111109", skills: "Fabric Handling, Trimming, Ironing" },
    { name: "Embroidery Worker", department: "Production", designation: "Karigar", salary: 15000, dailyWage: 650, phone: "9898111110", skills: "Chikankari, Zardozi, Thread Work, Machine Embroidery" },
  ]

  for (const e of employees) {
    await db.employee.create({ data: e })
  }
  console.log(`✅ Created ${employees.length} employees`)

  // ============ STYLES ============
  const styles = [
    { styleNo: "ELY-AKW-001", collectionName: "Awadh Collection", season: "Winter 2024", category: "Anarkali Kurti", fit: "Regular", fabricType: "Rayon", embroideryType: "Chikankari", neckDesign: "Round", sleeveType: "3/4", costPrice: 320, sellPrice: 650 },
    { styleNo: "ELY-STR-002", collectionName: "Awadh Collection", season: "Winter 2024", category: "Straight Kurti", fit: "Slim", fabricType: "Cotton Silk", embroideryType: "Thread Work", neckDesign: "Mandarin", sleeveType: "Full", costPrice: 280, sellPrice: 580 },
    { styleNo: "ELY-FLR-003", collectionName: "Royal Heritage", season: "Festive 2024", category: "Floor Length Kurti", fit: "A-Line", fabricType: "Georgette", embroideryType: "Zardozi", neckDesign: "Boat", sleeveType: "Bell", costPrice: 520, sellPrice: 1100 },
    { styleNo: "ELY-SHR-004", collectionName: "Daily Elegance", season: "All Season", category: "Shirt Kurti", fit: "Regular", fabricType: "Cotton", embroideryType: "None", neckDesign: "Mandarin", sleeveType: "Full", costPrice: 180, sellPrice: 390 },
    { styleNo: "ELY-MAX-005", collectionName: "Awadh Collection", season: "Winter 2024", category: "Maxi Dress", fit: "A-Line", fabricType: "Rayon", embroideryType: "Block Print", neckDesign: "V-Neck", sleeveType: "Flared", costPrice: 380, sellPrice: 750 },
    { styleNo: "ELY-ASH-006", collectionName: "Royal Heritage", season: "Festive 2024", category: "A-Line Kurti", fit: "A-Line", fabricType: "Silk Blend", embroideryType: "Mirror Work", neckDesign: "Round", sleeveType: "3/4", costPrice: 420, sellPrice: 890 },
    { styleNo: "ELY-JQK-007", collectionName: "Daily Elegance", season: "All Season", category: " Jacket Kurti", fit: "Regular", fabricType: "Cotton Linen", embroideryType: "Kantha", neckDesign: "Stand Up", sleeveType: "Full", costPrice: 350, sellPrice: 720 },
    { styleNo: "ELY-TNK-008", collectionName: "Summer Breeze", season: "Summer 2025", category: "Tunic Kurti", fit: "Relaxed", fabricType: "Linen", embroideryType: "None", neckDesign: "Round", sleeveType: "Short", costPrice: 220, sellPrice: 480 },
    { styleNo: "ELY-PLZ-009", collectionName: "Summer Breeze", season: "Summer 2025", category: "Palazzo Set", fit: "Regular", fabricType: "Viscose", embroideryType: "Thread Work", neckDesign: "Keyhole", sleeveType: "3/4", costPrice: 410, sellPrice: 850 },
    { styleNo: "ELY-SHR-010", collectionName: "Royal Heritage", season: "Festive 2024", category: "Shruga Set", fit: "Flowy", fabricType: "Chiffon", embroideryType: "Sequin Work", neckDesign: "Sweetheart", sleeveType: "Cap", costPrice: 580, sellPrice: 1250 },
  ]

  const createdStyles = []
  for (const s of styles) {
    const style = await db.style.create({ data: s })
    createdStyles.push(style)
  }
  console.log(`✅ Created ${createdStyles.length} styles`)

  // ============ COST SHEETS ============
  function calcItemCost(consumption: number, unitRate: number, wastagePercent: number) {
    return Math.round(consumption * unitRate * (1 + wastagePercent / 100) * 100) / 100
  }

  function calcLegacyBuckets(items: { category: string; itemCost: number }[]) {
    const fabric = items.filter(i => /fabric|lining/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const trim = items.filter(i => /trim|accessory|label|tag|button|zip/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const labor = items.filter(i => /embroid|stitch|cutting|labor|finishing|iron|print/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const wash = items.filter(i => /dye|wash/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const pack = items.filter(i => /pack/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const overhead = items.filter(i => /overhead|transport|logistic/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    const other = items.filter(i => !/fabric|lining|trim|accessory|label|tag|button|zip|embroid|stitch|cutting|labor|finishing|iron|print|dye|wash|pack|overhead|transport|logistic/i.test(i.category)).reduce((s, i) => s + i.itemCost, 0)
    return { fabric, trim, labor, wash, pack, overhead, other, total: Math.round((fabric + trim + labor + wash + pack + overhead + other) * 100) / 100 }
  }

  const costSheetDefs = [
    {
      sheetNo: 'CS-20250615-001', styleNo: 'ELY-AKW-001', styleName: 'Anarkali Kurti - Rayon',
      customerId: createdCustomers[0]?.id, description: 'Awadh Collection — Classic Chikankari Anarkali',
      sizeRange: 'S, M, L, XL, XXL', targetQty: 500, profitPercent: 30, brokerCommissionPercent: 2, status: 'Approved',
      colors: [{ color: 'Rani Pink', quantity: 200 }, { color: 'Peach', quantity: 180 }, { color: 'White', quantity: 120 }],
      items: [
        { category: 'Fabric', itemName: 'Rayon Printed 60 GSM', consumption: 2.8, unit: 'meters', unitRate: 85, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Cotton Lining (Inner)', consumption: 1.6, unit: 'meters', unitRate: 55, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Woven Brand Label', consumption: 1, unit: 'pcs', unitRate: 4, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Care Label', consumption: 1, unit: 'pcs', unitRate: 1.5, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Wooden Buttons', consumption: 6, unit: 'pcs', unitRate: 2, wastagePercent: 3 },
        { category: 'Embroidery', itemName: 'Chikankari Hand Work', consumption: 1, unit: 'pcs', unitRate: 120, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 15, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 45, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing & Iron', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag + Carton', consumption: 1, unit: 'pcs', unitRate: 8, wastagePercent: 2 },
        { category: 'Overhead', itemName: 'Transport & Logistics', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
      ]
    },
    {
      sheetNo: 'CS-20250620-001', styleNo: 'ELY-STR-002', styleName: 'Straight Kurti - Cotton Silk',
      customerId: createdCustomers[1]?.id, description: 'Awadh Collection — Thread Work Straight Kurti',
      sizeRange: 'S, M, L, XL', targetQty: 300, profitPercent: 35, brokerCommissionPercent: 0, status: 'Approved',
      colors: [{ color: 'Indigo', quantity: 100 }, { color: 'Mustard', quantity: 100 }, { color: 'Teal', quantity: 100 }],
      items: [
        { category: 'Fabric', itemName: 'Cotton Silk Plain', consumption: 2.2, unit: 'meters', unitRate: 95, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Thread (Matching)', consumption: 1, unit: 'pcs', unitRate: 3, wastagePercent: 5 },
        { category: 'Embroidery', itemName: 'Thread Work — Neck & Sleeve', consumption: 1, unit: 'pcs', unitRate: 65, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 38, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 6, wastagePercent: 2 },
      ]
    },
    {
      sheetNo: 'CS-20250701-001', styleNo: 'ELY-FLR-003', styleName: 'Floor Length Kurti - Georgette',
      customerId: createdCustomers[3]?.id, description: 'Royal Heritage — Zardozi Floor Length Kurti',
      sizeRange: 'S, M, L, XL', targetQty: 200, profitPercent: 40, brokerCommissionPercent: 5, status: 'Active',
      colors: [{ color: 'Wine', quantity: 80 }, { color: 'Royal Blue', quantity: 70 }, { color: 'Emerald Green', quantity: 50 }],
      items: [
        { category: 'Fabric', itemName: 'Georgette Plain', consumption: 3.5, unit: 'meters', unitRate: 120, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Silk Lining (Inner)', consumption: 2.8, unit: 'meters', unitRate: 80, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Zardozi Dori & Stones', consumption: 1, unit: 'set', unitRate: 150, wastagePercent: 3 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Embroidery', itemName: 'Zardozi Hand Work', consumption: 1, unit: 'pcs', unitRate: 280, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 20, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 65, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing & Iron', consumption: 1, unit: 'pcs', unitRate: 18, wastagePercent: 0 },
        { category: 'Wash', itemName: 'Dry Clean Finishing Wash', consumption: 1, unit: 'pcs', unitRate: 15, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Premium Box + Tissue + Tag', consumption: 1, unit: 'pcs', unitRate: 25, wastagePercent: 2 },
        { category: 'Overhead', itemName: 'Transport & Handling', consumption: 1, unit: 'pcs', unitRate: 15, wastagePercent: 0 },
      ]
    },
    {
      sheetNo: 'CS-20250705-001', styleNo: 'ELY-SHR-004', styleName: 'Shirt Kurti - Cotton',
      customerId: null, description: 'Daily Elegance — Basic Cotton Shirt Kurti',
      sizeRange: 'S, M, L, XL, XXL, 3XL', targetQty: 1000, profitPercent: 25, brokerCommissionPercent: 0, status: 'Approved',
      colors: [{ color: 'White', quantity: 300 }, { color: 'Sky Blue', quantity: 250 }, { color: 'Pink', quantity: 200 }, { color: 'Yellow', quantity: 150 }, { color: 'Mint', quantity: 100 }],
      items: [
        { category: 'Fabric', itemName: 'Cotton Cambric', consumption: 2.0, unit: 'meters', unitRate: 65, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Buttons (Matching)', consumption: 5, unit: 'pcs', unitRate: 1.5, wastagePercent: 3 },
        { category: 'Trims', itemName: 'Label + Tag', consumption: 1, unit: 'set', unitRate: 4, wastagePercent: 2 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 30, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing', consumption: 1, unit: 'pcs', unitRate: 8, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 5, wastagePercent: 2 },
      ]
    },
    {
      sheetNo: 'CS-20250708-001', styleNo: 'ELY-MAX-005', styleName: 'Maxi Dress - Rayon',
      customerId: createdCustomers[4]?.id, description: 'Awadh Collection — Block Print Maxi Dress',
      sizeRange: 'S, M, L, XL', targetQty: 400, profitPercent: 30, brokerCommissionPercent: 3, status: 'Active',
      colors: [{ color: 'Black Print', quantity: 150 }, { color: 'Maroon Print', quantity: 130 }, { color: 'Green Print', quantity: 120 }],
      items: [
        { category: 'Fabric', itemName: 'Rayon Block Printed', consumption: 3.2, unit: 'meters', unitRate: 90, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Elastic (Waist)', consumption: 0.5, unit: 'meters', unitRate: 8, wastagePercent: 5 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 14, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 50, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing & Iron', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 0 },
        { category: 'Wash', itemName: 'Fabric Pre-Wash', consumption: 1, unit: 'pcs', unitRate: 8, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag + Hanger', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 2 },
        { category: 'Overhead', itemName: 'Transport', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
      ]
    },
    {
      sheetNo: 'CS-20250710-001', styleNo: 'ELY-ASH-006', styleName: 'A-Line Kurti - Silk Blend',
      customerId: createdCustomers[2]?.id, description: 'Royal Heritage — Mirror Work A-Line Kurti',
      sizeRange: 'S, M, L, XL', targetQty: 350, profitPercent: 35, brokerCommissionPercent: 2.5, status: 'Draft',
      colors: [{ color: 'Rust', quantity: 120 }, { color: 'Navy', quantity: 120 }, { color: 'Olive', quantity: 110 }],
      items: [
        { category: 'Fabric', itemName: 'Silk Blend Fabric', consumption: 2.5, unit: 'meters', unitRate: 110, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Mirror Work Set', consumption: 1, unit: 'set', unitRate: 45, wastagePercent: 3 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Embroidery', itemName: 'Mirror Work Stitching', consumption: 1, unit: 'pcs', unitRate: 80, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 14, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 48, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 7, wastagePercent: 2 },
        { category: 'Overhead', itemName: 'Transport', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
      ]
    },
    {
      sheetNo: 'CS-20250712-001', styleNo: 'ELY-JQK-007', styleName: 'Jacket Kurti - Cotton Linen',
      customerId: createdCustomers[6]?.id, description: 'Daily Elegance — Kantha Work Jacket Kurti',
      sizeRange: 'S, M, L, XL', targetQty: 250, profitPercent: 30, brokerCommissionPercent: 0, status: 'Draft',
      colors: [{ color: 'Beige', quantity: 100 }, { color: 'Dusty Rose', quantity: 80 }, { color: 'Sage Green', quantity: 70 }],
      items: [
        { category: 'Fabric', itemName: 'Cotton Linen', consumption: 2.8, unit: 'meters', unitRate: 95, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Cotton Lining', consumption: 1.8, unit: 'meters', unitRate: 50, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Buttons (Wooden)', consumption: 4, unit: 'pcs', unitRate: 3, wastagePercent: 3 },
        { category: 'Trims', itemName: 'Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Embroidery', itemName: 'Kantha Hand Work', consumption: 1, unit: 'pcs', unitRate: 100, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 16, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching (2-layer)', consumption: 1, unit: 'pcs', unitRate: 60, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing & Iron', consumption: 1, unit: 'pcs', unitRate: 14, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 7, wastagePercent: 2 },
      ]
    },
    {
      sheetNo: 'CS-20250714-001', styleNo: 'ELY-TNK-008', styleName: 'Tunic Kurti - Linen',
      customerId: null, description: 'Summer Breeze — Basic Linen Tunic',
      sizeRange: 'S, M, L, XL, XXL', targetQty: 600, profitPercent: 25, brokerCommissionPercent: 0, status: 'Approved',
      colors: [{ color: 'Natural', quantity: 200 }, { color: 'Sky Blue', quantity: 200 }, { color: 'Lavender', quantity: 200 }],
      items: [
        { category: 'Fabric', itemName: 'Linen Plain Dyed', consumption: 2.0, unit: 'meters', unitRate: 85, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Label + Tag', consumption: 1, unit: 'set', unitRate: 4, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Buttons (Shell)', consumption: 3, unit: 'pcs', unitRate: 2.5, wastagePercent: 3 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching', consumption: 1, unit: 'pcs', unitRate: 35, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing', consumption: 1, unit: 'pcs', unitRate: 8, wastagePercent: 0 },
        { category: 'Wash', itemName: 'Fabric Soft Wash', consumption: 1, unit: 'pcs', unitRate: 6, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 5, wastagePercent: 2 },
      ]
    },
    {
      sheetNo: 'CS-20250715-001', styleNo: 'ELY-PLZ-009', styleName: 'Palazzo Set - Viscose',
      customerId: createdCustomers[5]?.id, description: 'Summer Breeze — Thread Work Palazzo Set (Kurta + Palazzo)',
      sizeRange: 'S, M, L, XL', targetQty: 300, profitPercent: 30, brokerCommissionPercent: 2, status: 'Active',
      colors: [{ color: 'Coral', quantity: 100 }, { color: 'Turquoise', quantity: 100 }, { color: 'Peach', quantity: 100 }],
      items: [
        { category: 'Fabric', itemName: 'Viscose Printed (Kurta)', consumption: 2.5, unit: 'meters', unitRate: 75, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Viscose Plain (Palazzo)', consumption: 1.8, unit: 'meters', unitRate: 70, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 5, wastagePercent: 2 },
        { category: 'Trims', itemName: 'Drawstring Elastic', consumption: 0.4, unit: 'meters', unitRate: 10, wastagePercent: 5 },
        { category: 'Embroidery', itemName: 'Thread Work Neck', consumption: 1, unit: 'pcs', unitRate: 55, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 14, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching (2 pcs)', consumption: 1, unit: 'pcs', unitRate: 55, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing', consumption: 1, unit: 'pcs', unitRate: 12, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Polybag + Tag', consumption: 1, unit: 'pcs', unitRate: 7, wastagePercent: 2 },
      ]
    },
    {
      sheetNo: 'CS-20250716-001', styleNo: 'ELY-SHR-010', styleName: 'Shruga Set - Chiffon',
      customerId: createdCustomers[8]?.id, description: 'Royal Heritage — Sequin Work Shruga Set',
      sizeRange: 'S, M, L', targetQty: 150, profitPercent: 45, brokerCommissionPercent: 5, status: 'Draft',
      colors: [{ color: 'Champagne Gold', quantity: 60 }, { color: 'Rose Gold', quantity: 50 }, { color: 'Silver', quantity: 40 }],
      items: [
        { category: 'Fabric', itemName: 'Chiffon (Shruga)', consumption: 2.8, unit: 'meters', unitRate: 140, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Satin (Inner)', consumption: 2.2, unit: 'meters', unitRate: 90, wastagePercent: 5 },
        { category: 'Fabric', itemName: 'Crepe (Pant)', consumption: 1.5, unit: 'meters', unitRate: 85, wastagePercent: 5 },
        { category: 'Trims', itemName: 'Sequin Work Material', consumption: 1, unit: 'set', unitRate: 120, wastagePercent: 3 },
        { category: 'Trims', itemName: 'Woven Label + Tag', consumption: 1, unit: 'set', unitRate: 6, wastagePercent: 2 },
        { category: 'Embroidery', itemName: 'Sequin Hand Work', consumption: 1, unit: 'pcs', unitRate: 200, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Cutting', consumption: 1, unit: 'pcs', unitRate: 22, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Stitching (3 pcs)', consumption: 1, unit: 'pcs', unitRate: 80, wastagePercent: 0 },
        { category: 'Labor', itemName: 'Finishing & Iron', consumption: 1, unit: 'pcs', unitRate: 20, wastagePercent: 0 },
        { category: 'Wash', itemName: 'Fabric Pre-Wash', consumption: 1, unit: 'pcs', unitRate: 10, wastagePercent: 0 },
        { category: 'Packaging', itemName: 'Premium Box + Tissue + Tag', consumption: 1, unit: 'pcs', unitRate: 30, wastagePercent: 2 },
        { category: 'Overhead', itemName: 'Transport & Handling', consumption: 1, unit: 'pcs', unitRate: 15, wastagePercent: 0 },
      ]
    },
  ]

  for (const csDef of costSheetDefs) {
    const itemsWithCost = csDef.items.map(item => ({
      ...item,
      itemCost: calcItemCost(item.consumption, item.unitRate, item.wastagePercent),
    }))
    const buckets = calcLegacyBuckets(itemsWithCost)
    const sellingPrice = Math.round(buckets.total * (1 + csDef.profitPercent / 100) * 100) / 100
    const brokerAmt = Math.round(sellingPrice * csDef.brokerCommissionPercent / 100 * 100) / 100

    await db.costSheet.create({
      data: {
        sheetNo: csDef.sheetNo,
        styleNo: csDef.styleNo,
        styleName: csDef.styleName,
        customerId: csDef.customerId,
        description: csDef.description,
        sizeRange: csDef.sizeRange,
        targetQty: csDef.targetQty,
        fabricCost: Math.round(buckets.fabric * 100) / 100,
        trimCost: Math.round(buckets.trim * 100) / 100,
        laborCost: Math.round(buckets.labor * 100) / 100,
        washCost: Math.round(buckets.wash * 100) / 100,
        packagingCost: Math.round(buckets.pack * 100) / 100,
        overheadCost: Math.round(buckets.overhead * 100) / 100,
        otherCost: Math.round(buckets.other * 100) / 100,
        totalCost: buckets.total,
        profitPercent: csDef.profitPercent,
        sellingPrice,
        brokerCommissionPercent: csDef.brokerCommissionPercent,
        brokerCommissionAmount: brokerAmt,
        status: csDef.status,
        notes: null,
        costItems: { create: itemsWithCost.map(item => ({
          category: item.category,
          itemName: item.itemName,
          consumption: item.consumption,
          unit: item.unit,
          unitRate: item.unitRate,
          wastagePercent: item.wastagePercent,
          itemCost: item.itemCost,
        })) },
        colorBreakdown: { create: csDef.colors.map(c => ({
          color: c.color,
          quantity: c.quantity,
        })) },
      },
    })
  }
  console.log(`✅ Created ${costSheetDefs.length} cost sheets`)

  // ============ SALES ORDERS (last 90 days) ============
  const orderStatuses = ["Pending", "Confirmed", "In Production", "Dispatched", "Delivered", "Cancelled"]
  const paymentStatuses = ["Unpaid", "Partial", "Paid"]

  const allOrders = []
  const allOrderItems = []

  for (let dayOffset = 89; dayOffset >= 0; dayOffset--) {
    const orderCount = dayOffset < 7 ? randomInt(0, 2) : randomInt(1, 3)
    const orderDate = subDays(new Date(), dayOffset)

    for (let i = 0; i < orderCount; i++) {
      const customer = createdCustomers[randomInt(0, createdCustomers.length - 1)]
      const statusIdx = dayOffset < 7 ? randomInt(0, 2) : (dayOffset < 30 ? randomInt(1, 4) : randomInt(3, 5))
      const status = orderStatuses[statusIdx]
      const payStatus = status === "Delivered" ? paymentStatuses[randomInt(0, 2)] : (status === "Dispatched" ? paymentStatuses[randomInt(0, 1)] : "Unpaid")

      const itemCount = randomInt(1, 3)
      let totalAmount = 0
      let totalCost = 0
      const items: { styleId: string; styleName: string; quantity: number; unitPrice: number; unitCost: number; totalAmount: number; totalCost: number; profit: number }[] = []

      for (let j = 0; j < itemCount; j++) {
        const style = createdStyles[randomInt(0, createdStyles.length - 1)]
        const qty = randomInt(20, 150)
        const marginVariation = randomBetween(0.92, 1.08)
        const unitPrice = Math.round(style.sellPrice * marginVariation)
        const unitCost = Math.round(style.costPrice * randomBetween(0.95, 1.05))
        const amt = qty * unitPrice
        const cost = qty * unitCost
        totalAmount += amt
        totalCost += cost
        items.push({
          styleId: style.id,
          styleName: style.styleNo,
          quantity: qty,
          unitPrice,
          unitCost,
          totalAmount: amt,
          totalCost: cost,
          profit: amt - cost,
        })
      }

      const discount = randomInt(0, 5)
      totalAmount = Math.round(totalAmount * (1 - discount / 100))
      const grossProfit = totalAmount - totalCost
      const grossMargin = totalAmount > 0 ? Math.round((grossProfit / totalAmount) * 10000) / 100 : 0
      const paidPct = payStatus === "Paid" ? 100 : (payStatus === "Partial" ? randomInt(30, 70) : 0)

      allOrders.push({
        orderNo: `SO-${format(orderDate, 'yyyyMMdd')}-${String(i + 1).padStart(3, '0')}`,
        customerId: customer.id,
        orderDate,
        deliveryDate: status === "Dispatched" || status === "Delivered" ? subDays(new Date(), dayOffset - randomInt(7, 21)) : null,
        status,
        totalAmount,
        totalCost,
        grossProfit,
        grossMargin,
        paymentStatus: payStatus,
        paidAmount: Math.round(totalAmount * paidPct / 100),
        discountPercent: discount,
      })

      // Store items separately
      for (const item of items) {
        allOrderItems.push({ ...item, orderIndex: allOrders.length - 1 })
      }
    }
  }

  // Create orders
  for (let i = 0; i < allOrders.length; i++) {
    const order = allOrders[i]
    const orderItems = allOrderItems.filter(oi => oi.orderIndex === i).map(oi => ({
      styleId: oi.styleId,
      styleName: oi.styleName,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice,
      unitCost: oi.unitCost,
      totalAmount: oi.totalAmount,
      totalCost: oi.totalCost,
      profit: oi.profit,
    }))

    await db.salesOrder.create({
      data: {
        ...order,
        items: { create: orderItems },
      },
    })
  }
  console.log(`✅ Created ${allOrders.length} sales orders`)

  // ============ PURCHASE ORDERS ============
  const fabricNames = ["Rayon Printed", "Cotton Silk Plain", "Georgette Solid", "Cotton Lawn", "Silk Blend", "Linen Natural", "Viscose Printed", "Chiffon Solid", "Cotton Linen", "Muslin"]
  const poStatuses = ["Pending", "Received", "Partial"]
  const poData = []

  for (let dayOffset = 60; dayOffset >= 0; dayOffset -= randomInt(3, 7)) {
    const supplier = createdSuppliers[randomInt(0, 2)] // Fabric suppliers
    const fabric = fabricNames[randomInt(0, fabricNames.length - 1)]
    const qty = randomBetween(100, 500)
    const rate = randomBetween(60, 250)
    const status = dayOffset < 10 ? poStatuses[randomInt(1, 2)] : poStatuses[0]

    poData.push({
      poNumber: `PO-${format(subDays(new Date(), dayOffset), 'yyyyMMdd')}-${String(poData.length + 1).padStart(3, '0')}`,
      supplierId: supplier.id,
      fabricName: fabric,
      quantity: qty,
      ratePerUnit: rate,
      totalAmount: Math.round(qty * rate),
      expectedDelivery: subDays(new Date(), dayOffset - randomInt(7, 14)),
      status,
      paymentStatus: status === "Received" ? "Paid" : "Unpaid",
      paidAmount: status === "Received" ? Math.round(qty * rate) : 0,
      receivedQty: status === "Received" ? qty : (status === "Partial" ? Math.round(qty * 0.5) : 0),
    })
  }

  for (const po of poData) {
    await db.purchaseOrder.create({ data: po })
  }
  console.log(`✅ Created ${poData.length} purchase orders`)

  // ============ FABRIC STOCK ============
  for (const fabric of fabricNames) {
    const available = randomBetween(50, 800)
    const reserved = Math.round(available * randomBetween(0.1, 0.4))
    const avgCost = randomBetween(60, 250)
    await db.fabricStock.create({
      data: {
        fabricName: fabric,
        supplierId: createdSuppliers[randomInt(0, 2)].id,
        gsm: randomInt(80, 250),
        width: randomBetween(44, 60),
        availableMeters: available,
        reservedMeters: reserved,
        averageCost: avgCost,
        totalValue: Math.round(available * avgCost),
      },
    })
  }
  console.log(`✅ Created fabric stock`)

  // ============ PRODUCTION JOBS ============
  const stages = ["Cutting", "Embroidery", "Stitching", "Finishing", "Quality Check", "Packing", "Dispatch"]
  const prodJobs = []

  for (let i = 0; i < 12; i++) {
    const style = createdStyles[randomInt(0, createdStyles.length - 1)]
    const stageIdx = i < 3 ? randomInt(0, 1) : (i < 8 ? randomInt(2, 4) : randomInt(5, 6))
    const targetQty = randomInt(50, 200)
    const completedPct = stageIdx <= 1 ? randomBetween(0.3, 0.7) : randomBetween(0.5, 1.0)

    prodJobs.push({
      jobNo: `JOB-${String(i + 1).padStart(4, '0')}`,
      styleNo: style.styleNo,
      styleName: `${style.category} - ${style.fabricType}`,
      targetQty,
      completedQty: Math.round(targetQty * completedPct),
      stage: stages[stageIdx],
      status: stageIdx >= 6 ? "Completed" : "In Progress",
      endDate: subDays(new Date(), -randomInt(1, 14)),
    })
  }

  for (const job of prodJobs) {
    await db.productionJob.create({ data: job })
  }
  console.log(`✅ Created ${prodJobs.length} production jobs`)

  // ============ TRANSACTIONS (last 60 days) ============
  const txTypes = ["Credit", "Debit"]
  const inflowCategories = ["Customer Payment", "Investor Capital", "Other Income"]
  const outflowCategories = ["Fabric Purchase", "Embroidery Cost", "Stitching Cost", "Salary", "Factory Rent", "Transport", "Marketing", "Admin", "Utilities", "Accessories"]

  for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
    const date = subDays(new Date(), dayOffset)
    const dayStr = format(date, 'yyyy-MM-dd')

    // 1-3 inflows per day
    for (let i = 0; i < randomInt(1, 3); i++) {
      const amount = randomBetween(15000, 150000)
      await db.transaction.create({
        data: {
          type: "Credit",
          category: inflowCategories[randomInt(0, 2)],
          amount,
          description: `${inflowCategories[randomInt(0, 1)]} - ${dayStr}`,
          date,
        },
      })
    }

    // 2-5 outflows per day
    for (let i = 0; i < randomInt(2, 5); i++) {
      const cat = outflowCategories[randomInt(0, outflowCategories.length - 1)]
      const amount = cat === "Salary" ? randomBetween(100000, 250000) : (cat === "Factory Rent" ? 35000 : randomBetween(5000, 80000))
      await db.transaction.create({
        data: {
          type: "Debit",
          category: cat,
          amount,
          description: `${cat} - ${dayStr}`,
          date,
        },
      })
    }
  }
  console.log(`✅ Created transactions`)

  // ============ DAILY SNAPSHOTS (last 30 days) ============
  let runningCash = 850000 // Starting cash balance

  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const date = subDays(new Date(), dayOffset)
    const dayStr = format(date, 'yyyy-MM-dd')

    const dayTxns = await db.transaction.findMany({
      where: { date: { gte: new Date(dayStr + 'T00:00:00.000Z'), lt: new Date(dayStr + 'T23:59:59.999Z') } },
    })

    const cashIn = dayTxns.filter(t => t.type === "Credit").reduce((s, t) => s + t.amount, 0)
    const cashOut = dayTxns.filter(t => t.type === "Debit").reduce((s, t) => s + t.amount, 0)
    const revenue = cashIn
    const expenses = cashOut
    const grossProfit = Math.round(revenue * randomBetween(0.3, 0.45))
    const netProfit = Math.round(grossProfit - expenses * randomBetween(0.3, 0.5))

    runningCash = runningCash + cashIn - cashOut

    await db.dailySnapshot.create({
      data: {
        date,
        revenue: Math.round(revenue),
        expenses: Math.round(expenses),
        grossProfit,
        netProfit: Math.max(netProfit, 0),
        cashIn: Math.round(cashIn),
        cashOut: Math.round(cashOut),
        receivables: randomBetween(200000, 800000),
        payables: randomBetween(100000, 400000),
        cashBalance: Math.round(runningCash),
        inventoryValue: randomBetween(400000, 1200000),
        ordersCount: randomInt(1, 4),
        productionQty: randomInt(40, 200),
      },
    })
  }
  console.log(`✅ Created daily snapshots`)

  // ============ FINISHED GOODS (FGStockBin) ============
  const fgColors = ['Rani Pink', 'Peach', 'White', 'Indigo', 'Mustard', 'Teal', 'Wine', 'Royal Blue', 'Sky Blue', 'Black Print', 'Coral', 'Navy', 'Natural', 'Beige']
  const fgSizes = ['S', 'M', 'L', 'XL', 'XXL', 'Free']
  let fgCount = 0
  for (const style of createdStyles) {
    const numColors = randomInt(1, 3)
    const selectedColors = fgColors.sort(() => Math.random() - 0.5).slice(0, numColors)
    for (const color of selectedColors) {
      const numSizes = randomInt(2, 4)
      const selectedSizes = fgSizes.sort(() => Math.random() - 0.5).slice(0, numSizes)
      for (const size of selectedSizes) {
        const qty = randomInt(2, 30)
        if (qty > 0) {
          const colorIdx = fgColors.indexOf(color)
          const colorCode = `${style.styleNo}-${String(colorIdx + 1).padStart(2, '0')}`
          await db.fGStockBin.create({
            data: {
              styleNo: style.styleNo,
              styleName: `${style.category} - ${style.collectionName}`,
              colorCode,
              color,
              size,
              availableQty: qty,
              reservedQty: 0,
              qcPendingQty: randomInt(0, 3),
              underRepairQty: 0,
              defectiveQty: 0,
              scrappedQty: 0,
              exhibitionQty: randomInt(0, 2),
              unitCost: style.costPrice,
              unitSellPrice: style.sellPrice,
              location: 'Warehouse',
            },
          })
          fgCount++
        }
      }
    }
  }
  console.log(`✅ Created ${fgCount} FG stock bins`)

  // ============ ALERTS ============
  const alerts = [
    { type: "payment_overdue", severity: "critical", title: "Overdue Payment", message: "Rangoli Creations - ₹1,85,000 overdue by 15 days" },
    { type: "low_fabric", severity: "warning", title: "Low Fabric Stock", message: "Cotton Lawn stock below minimum level (52 meters remaining)" },
    { type: "production_delay", severity: "warning", title: "Production Delay", message: "JOB-0003 is 3 days behind schedule - Embroidery stage" },
    { type: "order_received", severity: "info", title: "New Order Received", message: "Suhani Exports - 120 pcs order for Awadh Collection kurtis" },
    { type: "cash_low", severity: "critical", title: "Cash Position Alert", message: "Cash balance projected to fall below ₹3L in 12 days" },
    { type: "fabric_received", severity: "info", title: "Fabric Received", message: "PO-20250401-001 - 300 meters Rayon Printed received from Surat Fabric House" },
    { type: "quality_issue", severity: "warning", title: "Quality Issue Detected", message: "JOB-0007 - 8 pieces rejected during QC (stitching defects)" },
    { type: "customer_followup", severity: "info", title: "Follow-up Required", message: "Trendy Ethnic - Quotation sent 5 days ago, no response yet" },
  ]

  for (const a of alerts) {
    await db.alert.create({
      data: {
        ...a,
        isRead: a.severity === "info",
      },
    })
  }
  console.log(`✅ Created ${alerts.length} alerts`)

  // ============ QUOTATIONS ============
  const quotationStatuses = ["Draft", "Sent", "Accepted", "Rejected", "Converted"]
  const quotationData = []

  for (let i = 0; i < 15; i++) {
    const customer = createdCustomers[randomInt(0, createdCustomers.length - 1)]
    const style = createdStyles[randomInt(0, createdStyles.length - 1)]
    const qty = randomInt(20, 100)
    const unitPrice = Math.round(style.sellPrice * randomBetween(0.95, 1.1))
    const unitCost = Math.round(style.costPrice * randomBetween(0.95, 1.05))
    const totalAmt = qty * unitPrice
    const totalCst = qty * unitCost
    const discount = randomInt(0, 5)
    const finalAmt = Math.round(totalAmt * (1 - discount / 100))
    const daysAgo = randomInt(5, 45)
    const status = quotationStatuses[i < 2 ? 0 : (i < 5 ? 1 : (i < 8 ? 2 : (i < 11 ? 3 : 4)))]

    quotationData.push({
      quotationNo: `QT-${format(subDays(new Date(), daysAgo), 'yyyyMMdd')}-${String(i + 1).padStart(3, '0')}`,
      customerId: customer.id,
      quotationDate: subDays(new Date(), daysAgo),
      validUntil: subDays(new Date(), daysAgo - 15),
      status,
      totalAmount: finalAmt,
      totalCost: totalCst,
      discountPercent: discount,
      items: {
        create: [{
          styleName: `${style.category} - ${style.fabricType}`,
          quantity: qty,
          unitPrice,
          unitCost,
          totalAmount: totalAmt,
          totalCost: totalCst,
          profit: totalAmt - totalCst,
        }],
      },
    })
  }

  for (const q of quotationData) {
    await db.quotation.create({ data: q })
  }
  console.log(`✅ Created ${quotationData.length} quotations`)

  // ============ QUALITY CHECKS ============
  const inspectionPoints = ["Fabric Check", "Cutting Check", "In-Process Check", "Finishing Check", "Final Inspection"]
  const defectTypes = ["Stitching Defect", "Color Variation", "Size Deviation", "Fabric Flaw", "Embroidery Error", "Print Misalignment", "Seam Puckering"]
  const qcData = []

  const jobs = await db.productionJob.findMany()
  for (const job of jobs) {
    const numChecks = randomInt(1, 3)
    for (let c = 0; c < numChecks; c++) {
      const point = inspectionPoints[randomInt(0, inspectionPoints.length - 1)]
      const checked = randomInt(10, 50)
      const passRate = randomBetween(0.8, 1.0)
      const passed = Math.round(checked * passRate)
      const failed = checked - passed
      const hasDefect = failed > 0
      const qcNo = `QC-${job.jobNo}-${String(c + 1).padStart(2, '0')}`

      qcData.push({
        checkNo: qcNo,
        productionJobId: job.id,
        inspectionPoint: point,
        checkedQty: checked,
        passedQty: passed,
        failedQty: failed,
        defectType: hasDefect ? defectTypes[randomInt(0, defectTypes.length - 1)] : null,
        defectCount: failed,
        severity: failed > 5 ? "Critical" : (failed > 2 ? "Major" : "Minor"),
        status: failed === 0 ? "Pass" : (failed > 5 ? "Fail" : "Conditional"),
        inspectorName: "QC Inspector",
        checkedAt: subDays(new Date(), randomInt(0, 14)),
      })
    }
  }

  for (const qc of qcData) {
    await db.qualityCheck.create({ data: qc })
  }
  console.log(`✅ Created ${qcData.length} quality checks`)

  // ============ SAMPLES ============
  const sampleStages = ["Design", "Fabric Sourcing", "Pattern Making", "Cutting", "Stitching", "Finishing", "Ready"]
  const sampleStatuses = ["In Progress", "Submitted", "Approved", "Rejected", "Revised"]
  const sampleData = []

  for (let i = 0; i < 12; i++) {
    const style = createdStyles[randomInt(0, createdStyles.length - 1)]
    const customer = i < 8 ? createdCustomers[randomInt(0, createdCustomers.length - 1)] : null
    const stageIdx = i < 4 ? randomInt(5, 6) : randomInt(0, 4)
    const status = i < 3 ? "Approved" : (i < 5 ? "Rejected" : (i < 8 ? "Submitted" : "In Progress"))

    sampleData.push({
      sampleNo: `SMP-${String(i + 1).padStart(4, '0')}`,
      customerId: customer?.id,
      styleNo: style.styleNo,
      styleName: `${style.category} - ${style.collectionName}`,
      stage: sampleStages[stageIdx],
      status,
      assignedTo: ["Production Head", "Merchandiser", "Master Cutter"][randomInt(0, 2)],
      submissionDate: status !== "In Progress" ? subDays(new Date(), randomInt(1, 10)) : null,
      approvedDate: status === "Approved" ? subDays(new Date(), randomInt(0, 5)) : null,
      cost: randomBetween(500, 5000),
    })
  }

  for (const s of sampleData) {
    await db.sample.create({ data: s })
  }
  console.log(`✅ Created ${sampleData.length} samples`)

  // ============ BROKERS ============
  const brokers = [
    { name: 'Raju Sharma', phone: '9876543210', commissionPercent: 5, address: 'Surat', status: 'Active' },
    { name: 'Sunil Patel', phone: '9876543211', commissionPercent: 7, address: 'Ahmedabad', status: 'Active' },
    { name: 'Amit Desai', phone: '9876543212', commissionPercent: 3, address: 'Mumbai', status: 'Active' },
    { name: 'Vikram Singh', phone: '9876543213', commissionPercent: 6, address: 'Delhi', status: 'Active' },
    { name: 'Pradeep Jain', phone: '9876543214', commissionPercent: 4, address: 'Jaipur', status: 'Active' },
  ]

  for (const broker of brokers) {
    await db.broker.create({ data: broker })
  }
  console.log(`✅ Created ${brokers.length} brokers`)

  console.log('\n🎉 Dhanya OS database seeded successfully!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())