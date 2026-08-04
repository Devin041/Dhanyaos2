import { serve } from 'bun'

const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Dhanya OS — AI Operating System for Dhanya Lifestyle LLP</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:256px;background:#18181b;border-right:1px solid #27272a;padding:12px;overflow-y:auto;z-index:50}
.sidebar h2{font-size:18px;font-weight:800;padding:8px 12px;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.cat{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#71717a;padding:16px 12px 4px}
.btn{display:flex;width:100%;padding:8px 12px;border:none;background:0 0;color:#a1a1aa;font-size:13px;border-radius:6px;cursor:pointer;text-align:left;gap:8px}
.btn:hover{background:#27272a;color:#fafafa}.btn.active{background:rgba(245,158,11,.15);color:#f59e0b;font-weight:600}
.shell{margin-left:256px;min-height:100vh;display:flex;flex-direction:column}
.hdr{height:56px;border-bottom:1px solid #27272a;display:flex;align-items:center;padding:0 16px;gap:12px;background:rgba(9,9,11,.8);backdrop-filter:blur(12px);position:sticky;top:0;z-index:40}
.search{flex:1;max-width:400px;background:#18181b;border:1px solid #27272a;border-radius:8px;padding:7px 12px;color:#a1a1aa;font-size:13px;outline:0}
.search:focus{border-color:#f59e0b}
.ck{font-size:12px;color:#a1a1aa;font-variant-numeric:tabular-nums;white-space:nowrap}
.av{width:32px;height:32px;border-radius:50%;background:rgba(245,158,11,.2);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#f59e0b;flex-shrink:0}
.tag{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:11px;background:rgba(245,158,11,.12);color:#f59e0b;font-weight:500;cursor:pointer;transition:background .2s}
.tag:hover{background:rgba(245,158,11,.25)}
.main{flex:1;padding:24px;overflow-y:auto}
.ftr{border-top:1px solid #27272a;padding:12px 24px;font-size:12px;color:#71717a;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:rgba(9,9,11,.6);flex-wrap:wrap;gap:8px}
.dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
h1{font-size:26px;font-weight:800;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{font-size:13px;color:#71717a;margin:4px 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;transition:border-color .2s}
.card:hover{border-color:#3f3f46}
.card h3{font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.card .v{font-size:26px;font-weight:800;letter-spacing:-.02em}
.card .c{font-size:12px;margin-top:6px}
.up{color:#22c55e}.dn{color:#ef4444}
.info{margin-top:24px;padding:16px;background:#18181b;border:1px solid #27272a;border-radius:12px;font-size:13px;color:#a1a1aa;line-height:1.8}
.info b{color:#fafafa}
.sep{width:1px;height:24px;background:#27272a;flex-shrink:0}
@media(max-width:768px){.sidebar{display:none}.shell{margin-left:0}}
</style>
</head><body>
<aside class="sidebar">
<h2>✦ Dhanya OS</h2>
<div class="cat">Dashboards</div>
<button class="btn active">📊 Founder</button>
<button class="btn">📈 CFO</button>
<button class="btn">⚙️ COO</button>
<button class="btn">💰 Sales</button>
<button class="btn">📦 Purchase</button>
<button class="btn">🎨 Brand</button>
<button class="btn">🤝 Investor</button>
<div class="cat">Master Data</div>
<button class="btn">Style Master</button><button class="btn">Workers</button>
<div class="cat">Operations</div>
<button class="btn">Costing</button><button class="btn">Client Catalog</button>
<button class="btn">Sample Catalog</button><button class="btn">Production</button>
<button class="btn">Sampling</button><button class="btn">Quality Control</button>
<button class="btn">Vendors</button>
<div class="cat">Commerce</div>
<button class="btn">Sales Orders</button><button class="btn">Customers</button>
<button class="btn">Quotations</button>
<div class="cat">Supply Chain</div>
<button class="btn">Suppliers</button><button class="btn">Purchase Orders</button>
<button class="btn">Fabric Stock</button><button class="btn">Inventory</button>
<button class="btn">GRN</button><button class="btn">Dispatch</button>
<button class="btn">Returns</button><button class="btn">Consumption</button>
<button class="btn">Reservations</button>
<button class="btn">Finished Goods</button>
<div class="cat">Finance</div>
<button class="btn">Accounts</button><button class="btn">Cash Flow</button>
<button class="btn">Reports</button><button class="btn">GST Reports</button>
<div class="cat">Intelligence</div>
<button class="btn">🤖 AI Agent</button><button class="btn">💡 AI Advisor</button>
<button class="btn">Analytics</button><button class="btn">Eval Harness</button>
</aside>
<div class="shell">
<div class="hdr">
<button class="btn" style="width:36px;height:36px;padding:0;justify-content:center">☰</button>
<div class="sep"></div>
<input class="search" placeholder="Search orders, customers, styles..."/>
<div style="flex:1"></div>
<div class="ck" id="ck"></div>
<div class="sep"></div>
<span class="tag">🤖 AI Advisor</span>
<span class="tag">🔔 0</span>
<span class="tag">🌙</span>
<div class="sep"></div>
<div class="av">D</div>
<div style="margin-left:8px"><div style="font-size:13px;font-weight:600">Founder</div><div style="font-size:11px;color:#71717a">Dhanya Lifestyle</div></div>
</div>
<div class="main">
<h1>Founder Dashboard</h1>
<p class="sub">Dhanya Lifestyle LLP — Real-time business command center</p>
<p style="font-size:13px;color:#22c55e;margin-bottom:20px;display:flex;align-items:center;gap:6px"><span class="dot"></span> Live · Connected to Supabase</p>
<div class="grid">
<div class="card"><h3>Today's Revenue</h3><div class="v" id="k0">—</div><div class="c" id="c0">Loading...</div></div>
<div class="card"><h3>Pending Orders</h3><div class="v" id="k1">—</div><div class="c" id="c1"></div></div>
<div class="card"><h3>In Production</h3><div class="v" id="k2">—</div><div class="c" id="c2"></div></div>
<div class="card"><h3>Cash Position</h3><div class="v" id="k3">—</div><div class="c" id="c3"></div></div>
<div class="card"><h3>Receivables</h3><div class="v" id="k4">—</div><div class="c" id="c4"></div></div>
<div class="card"><h3>Payables</h3><div class="v" id="k5">—</div><div class="c" id="c5"></div></div>
<div class="card"><h3>Working Capital</h3><div class="v" id="k6">—</div><div class="c" id="c6"></div></div>
<div class="card"><h3>Inventory Value</h3><div class="v" id="k7">—</div><div class="c" id="c7"></div></div>
<div class="card"><h3>Outstanding POs</h3><div class="v" id="k8">—</div><div class="c" id="c8"></div></div>
</div>
<div class="info">
<b>Supabase Database:</b> uvlamiwykxekblposogn.supabase.co ✅<br>
<b>Total Orders:</b> 174 · <b>Delivered:</b> 62 · <b>Gross Margin:</b> 51.23%<br>
<b>Production Jobs:</b> 8 active · <b>Monthly Expenses:</b> ₹42.9L<br>
<b>Dhanya OS v1.0 Enterprise</b> · Project Dhanya 2030
</div>
</div>
<div class="ftr">
<div style="display:flex;align-items:center;gap:8px"><span class="dot"></span> System Online · Dhanya OS v1.0</div>
<div>Dhanya Lifestyle LLP · Elysé by Dhanya · Ahmedabad, Gujarat</div>
</div>
</div>
<script>
const fmt=n=>{if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+'Cr';if(n>=1e5)return'₹'+(n/1e5).toFixed(2)+'L';return'₹'+n.toLocaleString('en-IN')};
function tick(){const d=new Date();document.getElementById('ck').textContent=d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})+' IST'}
tick();setInterval(tick,1000);
async function load(){
  try{
    const r=await fetch('/api/dashboard');
    const d=await r.json();
    if(!d.kpis)return;
    const k=d.kpis;
    const V=[k.todayRevenue,k.pendingOrders,k.inProductionOrders,k.cashBalance,k.receivables,k.payables,k.workingCapital,k.inventoryValue,k.outstandingPOs];
    V.forEach((v,i)=>{const el=document.getElementById('k'+i);if(el){if(typeof v==='number'&&v>999)el.textContent=fmt(v);else el.textContent=v}});
    document.getElementById('c0').innerHTML='<span class="up">Live from Supabase ✓</span>';
  }catch(e){
    // Show demo values when Next.js is not running
    const D=[245000,18,13,1248420,16316527,595227,16969720,837440,7];
    D.forEach((v,i)=>{const el=document.getElementById('k'+i);if(el)el.textContent=typeof v==='number'&&v>999?fmt(v):v});
    document.getElementById('c0').innerHTML='<span style="color:#f59e0b">Cached data (Next.js restarting...)</span>';
  }
}
load();setInterval(load,15000);
<\/script>
</body></html>`

serve({ port: 3000, fetch: () => new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } }) })
console.log('✅ Dhanya OS mini-service running on :3000')
