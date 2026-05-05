// AlPro V10.6 - ORİJİNAL KORUNDU + Canlı Investing Proxy
// Çalıştır: node server.js  -> http://localhost:8833
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PORT = Number(process.env.PORT) || 8833;

function loadEnvFile(){
  const envPath = path.join(__dirname,'.env');
  if(!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath,'utf8').split(/\r?\n/).forEach(line=>{
    const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if(!m) return;
    let v=m[2].trim();
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    if(!process.env[m[1]]) process.env[m[1]]=v;
  });
}
loadEnvFile();
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const SUPABASE_SERVICE_KEY=process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_ANON_KEY||'';
const SUPABASE_ENABLED=!!(SUPABASE_URL&&SUPABASE_SERVICE_KEY);
async function sbFetch(pathname, opts={}){
  if(!SUPABASE_ENABLED) throw new Error('Supabase ayarlı değil');
  const url=SUPABASE_URL+'/rest/v1/'+pathname.replace(/^\/+/,'');
  const headers=Object.assign({
    apikey:SUPABASE_SERVICE_KEY,
    Authorization:'Bearer '+SUPABASE_SERVICE_KEY,
    'Content-Type':'application/json'
  }, opts.headers||{});
  const r=await fetch(url,Object.assign({},opts,{headers}));
  const txt=await r.text();
  let data=null; try{data=txt?JSON.parse(txt):null}catch(e){data=txt}
  if(!r.ok) throw new Error('Supabase HTTP '+r.status+': '+txt.slice(0,300));
  return data;
}
async function sbGetTable(table){
  const rows=await sbFetch('alpro_records?select=record_id,data&table_name=eq.'+encodeURIComponent(table));
  return (rows||[]).map(r=>r.data).filter(Boolean);
}
async function sbSetTable(table, arr, actor){
  arr=Array.isArray(arr)?arr:[];
  await sbFetch('alpro_records?table_name=eq.'+encodeURIComponent(table),{method:'DELETE'});
  if(arr.length){
    const rows=arr.map((item,idx)=>({table_name:table,record_id:String(item&&item.id?item.id:idx),data:item,updated_by:actor||'unknown',updated_at:new Date().toISOString()}));
    await sbFetch('alpro_records',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows)});
  }
  try{await sbFetch('alpro_audit',{method:'POST',body:JSON.stringify([{action:'set',table_name:table,actor:actor||'unknown',meta:{count:arr.length}}])})}catch(e){}
  return arr;
}
async function sbDeleteRecord(table,id,actor){
  await sbFetch('alpro_records?table_name=eq.'+encodeURIComponent(table)+'&record_id=eq.'+encodeURIComponent(id),{method:'DELETE'});
  try{await sbFetch('alpro_audit',{method:'POST',body:JSON.stringify([{action:'delete',table_name:table,record_id:id,actor:actor||'unknown',meta:{}}])})}catch(e){}
  return await sbGetTable(table);
}
async function sbSummary(){
  const rows=await sbFetch('alpro_records?select=table_name');
  const map={}; (rows||[]).forEach(r=>{map[r.table_name]=(map[r.table_name]||0)+1});
  const tables=Object.keys(map).sort().map(k=>({table:k,count:map[k]}));
  return {mode:'supabase',total:tables.reduce((a,x)=>a+x.count,0),tables};
}
async function sbAuditList(limit=20){
  return await sbFetch('alpro_audit?select=*&order=created_at.desc&limit='+Number(limit||20));
}

const LB_PER_METRIC_TON = 2204.62262185;
const INVESTING_URLS = [
  'https://www.investing.com/commodities/metals',
  'https://www.investing.com/commodities/real-time-futures'
];
// V10.5 - Bakir icin OZEL sayfa (LME 3M Copper / MCU3)
const MCU3_COPPER_URL = "https://tr.investing.com/commodities/copper?cid=959211";
let mcu3Cache = { data: null, at: 0 };

function parseTRNumber(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function getMCU3CopperPrice() {
  if (mcu3Cache.data && Date.now() - mcu3Cache.at < 60_000) {
    console.log('[MCU3] cache donduruldu:', mcu3Cache.data.price);
    return { ...mcu3Cache.data, cached: true };
  }
  const html = await requestText(MCU3_COPPER_URL);
  const text = clean(html);
  const patterns = [
    /Bakır Vadeli İşlemleri[\s\S]{0,300}?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]+)/i,
    /Bu sayfadan\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]+)/i,
    /Portföye Ekle\s+([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]+)/i,
    /\b([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/
  ];
  let price = null;
  let matchedPattern = -1;
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (m && m[1]) {
      const n = parseTRNumber(m[1]);
      if (n !== null && n >= 5000 && n <= 20000) {
        price = n;
        matchedPattern = i;
        console.log('[MCU3] Pattern', i, 'eslesti:', m[1], '->', n);
        break;
      }
    }
  }
  if (!price) {
    console.log('[MCU3] FAIL - hicbir pattern uymadi, HTML uzunlugu:', text.length);
    throw new Error("MCU3 Copper fiyati Investing sayfasindan ayristirilamadi.");
  }
  const data = {
    symbol: "MCU3",
    name: "Bakir Vadeli Islemleri",
    exchange: "London / Investing",
    currency: "USD",
    unit: "USD/t",
    price,
    rawPrice: price,
    rawUnit: "USD/t",
    note: "MCU3 LME 3M Copper - investing.com/copper?cid=959211 (pattern " + matchedPattern + ")",
    source: "Investing.com",
    url: MCU3_COPPER_URL,
    cells: ["MCU3 Copper", price.toFixed(2)],
    fetchedAt: new Date().toISOString()
  };
  mcu3Cache = { data, at: Date.now() };
  return data;
}
let cache = { data:null, at:0 };
function requestText(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language':'en-US,en;q=0.9,tr;q=0.8','Cache-Control':'no-cache','Pragma':'no-cache','Referer':'https://www.investing.com/'
    },timeout:15000},res=>{
      let data=''; res.on('data',c=>data+=c); res.on('end',()=>{
        if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){requestText(new URL(res.headers.location,url).toString()).then(resolve).catch(reject);return;}
        if(res.statusCode!==200){reject(new Error('Investing HTTP status: '+res.statusCode));return;} resolve(data);
      })
    }); req.on('timeout',()=>req.destroy(new Error('Timeout'))); req.on('error',reject);
  })
}
function clean(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function toNumber(s){const m=String(s||'').match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);return m?Number(m[0].replace(/,/g,'')):null}
function numberCandidates(cells){return cells.map((cell,idx)=>({cell,idx,n:toNumber(cell)})).filter(x=>x.n!==null&&Number.isFinite(x.n))}
function pickPlausible(cells, metal){
  const nums=numberCandidates(cells).filter(x=>{const c=x.cell.toLowerCase(); if(/\d{1,2}\/\d{1,2}/.test(c))return false; if(/%/.test(c))return false; return true;});
  if(metal==='aluminium'||metal==='zinc'){const ton=nums.find(x=>x.n>=1000&&x.n<=8000); if(ton)return {price:ton.n,rawPrice:ton.n,rawUnit:'USD/t',note:'Investing metals table'};}
  if(metal==='copper'){const ton=nums.find(x=>x.n>=1000&&x.n<=30000); if(ton)return {price:ton.n,rawPrice:ton.n,rawUnit:'USD/t',note:'Investing metals table'}; const lb=nums.find(x=>x.n>=1&&x.n<=20); if(lb)return {price:lb.n*LB_PER_METRIC_TON,rawPrice:lb.n,rawUnit:'USD/lb',note:'Copper MCU3 direct only'};}
  const first=nums[0]; return first?{price:first.n,rawPrice:first.n,rawUnit:'unknown',note:'Fallback parse - kontrol et'}:{price:null,rawPrice:null,rawUnit:'unknown',note:'Not parsed'};
}
function parseCommodity(html,names,metal){
  const rows=html.match(/<tr[\s\S]*?<\/tr>/gi)||[];
  for(const row of rows){const txt=clean(row).toLowerCase(); if(!names.some(n=>txt.includes(n.toLowerCase())))continue; const cells=[...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1])).filter(Boolean); if(cells.length){return {...pickPlausible(cells,metal),cells};}}
  for(const name of names){const idx=html.toLowerCase().indexOf(name.toLowerCase()); if(idx>=0){const part=html.slice(Math.max(0,idx-1000),idx+2500); const text=clean(part); return {...pickPlausible([text],metal),cells:[text.slice(0,500)]};}}
  return {price:null,rawPrice:null,rawUnit:'unknown',note:'Not found',cells:[]};
}
async function getHtml(){const errors=[]; for(const url of INVESTING_URLS){try{return {html:await requestText(url),url};}catch(e){errors.push(url+' -> '+e.message)}} throw new Error('Investing sayfaları alınamadı: '+errors.join(' | '));}
async function getMetals(){
  if(cache.data && Date.now()-cache.at<60_000) return {...cache.data, cached:true};
  const {html,url}=await getHtml();
  const aluminium=parseCommodity(html,['Aluminum','Aluminium','Aluminum c3'],'aluminium');
  // V10.5 - Bakir oncelikle MCU3 sayfasindan (cid=959211)
  let copper;
  try {
    copper = await getMCU3CopperPrice();
    console.log('[V10.5] Bakir MCU3 sayfasindan alindi:', copper.price);
  } catch(e) {
    console.log('[V10.5] MCU3 fail:', e.message, '- metals tablosuna duser');
    copper = parseCommodity(html,['Copper','Copper c3'],'copper');
  }
  const zinc=parseCommodity(html,['Zinc','Zinc c3'],'zinc');
  const data={source:'Investing.com proxy - AlPro V10.5',url,fetchedAt:new Date().toISOString(),conversion:'Copper from MCU3 dedicated page.',metals:{
    aluminium:{symbol:'ALUMINIUM',name:'Aluminium',unit:'USD/t',...aluminium},
    copper:{symbol:'COPPER',name:'Copper',unit:'USD/t',...copper},
    zinc:{symbol:'ZINC',name:'Zinc',unit:'USD/t',...zinc}
  }};
  const missing=Object.values(data.metals).filter(x=>x.price===null).map(x=>x.name); if(missing.length)data.warning='Ayrıştırılamadı: '+missing.join(', ');
  cache={data,at:Date.now()}; 
  // son6_v106_mcu3_override: Copper ana kaynak MCU3
  try{
    const mcu3 = await getMCU3CopperPrice();
    if(mcu3 && mcu3.price){
      if(data.metals){
        data.metals.copper = {
          symbol:'MCU3',
          name:'London Copper / Bakır Vadeli İşlemleri',
          unit:'USD/t',
          price:mcu3.price,
          rawPrice:mcu3.price,
          rawUnit:'USD/t',
          note:'Primary copper source: Investing.com MCU3 direct',
          source:mcu3.source,
          url:mcu3.url,
          fetchedAt:mcu3.fetchedAt
        };
      }else{
        data.copper = {
          symbol:'MCU3',
          name:'London Copper / Bakır Vadeli İşlemleri',
          unit:'USD/t',
          price:mcu3.price,
          source:mcu3.source,
          url:mcu3.url,
          fetchedAt:mcu3.fetchedAt
        };
      }
      data.copperPrimarySource='MCU3';
    }
  }catch(e){
    data.copperPrimarySource='MCU3 failed, fallback used';
    data.copperPrimaryError=e.message;
  }


  // son6_v107_copper_no_lb_sanitize: USD/lb conversion tamamen kapalı. Copper sadece MCU3 olsun.
  try{
    const c = data.metals && data.metals.copper ? data.metals.copper : data.copper;
    const isMCU3 = c && String(c.symbol || '').toUpperCase() === 'MCU3';
    const badLb = c && (
      String(c.rawUnit || '').toLowerCase().includes('lb') ||
      String(c.note || '').toLowerCase().includes('converted from usd/lb') ||
      String(c.note || '').toLowerCase().includes('usd/lb')
    );
    if(c && !isMCU3 && badLb){
      const cleanCopper = {
        symbol:'MCU3',
        name:'London Copper / Bakır Vadeli İşlemleri',
        unit:'USD/t',
        price:null,
        rawPrice:null,
        rawUnit:'MCU3 only',
        note:'Copper USD/lb dönüşümü kapalı. MCU3 fiyatı alınamadı.',
        source:'MCU3 failed',
        url: typeof MCU3_COPPER_URL !== 'undefined' ? MCU3_COPPER_URL : ''
      };
      if(data.metals) data.metals.copper = cleanCopper;
      else data.copper = cleanCopper;
      data.copperPrimarySource='MCU3 only - no USD/lb conversion';
    }
  }catch(e){}

return data;
}

let fxCache = { data:null, at:0 };
async function getFx(){
  if(fxCache.data && Date.now()-fxCache.at<10*60_000) return {...fxCache.data, cached:true};
  const txt = await requestText('https://open.er-api.com/v6/latest/USD');
  let j;
  try{ j=JSON.parse(txt); }catch(e){ throw new Error('FX JSON parse error'); }
  const rates = j && j.rates ? j.rates : {};
  const usdtry = Number(rates.TRY);
  const eurPerUsd = Number(rates.EUR);
  const gbpPerUsd = Number(rates.GBP);
  const eurtry = usdtry && eurPerUsd ? usdtry / eurPerUsd : null;
  const gbptry = usdtry && gbpPerUsd ? usdtry / gbpPerUsd : null;
  const eurusd = eurPerUsd ? 1 / eurPerUsd : null;
  const gbpusd = gbpPerUsd ? 1 / gbpPerUsd : null;
  if(!usdtry || !Number.isFinite(usdtry)) throw new Error('USD/TRY bulunamadı');
  const data = {
    source:'open.er-api.com',
    base:'USD',
    quote:'TRY',
    usdtry,
    eurtry: Number.isFinite(eurtry) ? eurtry : null,
    gbptry: Number.isFinite(gbptry) ? gbptry : null,
    eurusd: Number.isFinite(eurusd) ? eurusd : null,
    gbpusd: Number.isFinite(gbpusd) ? gbpusd : null,
    rates:{ USDTRY: usdtry, EURTRY: Number.isFinite(eurtry) ? eurtry : null, GBPTRY: Number.isFinite(gbptry) ? gbptry : null },
    fetchedAt:new Date().toISOString()
  };
  fxCache={data, at:Date.now()};
  return data;
}

const DB_FILE = path.join(__dirname,'alpro-shared-db.json');
const AUDIT_FILE = path.join(__dirname,'alpro-audit-log.json');
function readJsonFile(file, fallback){
  try{ if(!fs.existsSync(file)) return fallback; return JSON.parse(fs.readFileSync(file,'utf8')||'null') || fallback; }catch(e){ return fallback; }
}
function writeJsonFile(file, data){
  fs.writeFileSync(file, JSON.stringify(data,null,2), 'utf8');
}
function readSharedDb(){ return readJsonFile(DB_FILE, {}); }
function writeSharedDb(db){ writeJsonFile(DB_FILE, db); }
function addAudit(action, table, actor, meta){
  const a = readJsonFile(AUDIT_FILE, []);
  a.unshift({at:new Date().toISOString(), action, table, actor:actor||'unknown', meta:meta||{}});
  writeJsonFile(AUDIT_FILE, a.slice(0,500));
}
function actorFrom(req){ return req.headers['x-alpro-user'] || 'unknown'; }
function readBody(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',c=>{b+=c; if(b.length>10_000_000){req.destroy();reject(new Error('Body too large'));}});
    req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(new Error('Invalid JSON'))}});
    req.on('error',reject);
  });
}
function lanUrl(){
  const nets=os.networkInterfaces();
  for(const name of Object.keys(nets)){
    for(const ni of nets[name]||[]){
      if(ni.family==='IPv4' && !ni.internal && /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(ni.address)){
        return 'http://'+ni.address+':'+PORT;
      }
    }
  }
  return 'http://localhost:'+PORT;
}
function dbSummary(){
  const db=readSharedDb();
  const tables=Object.keys(db).map(k=>({table:k,count:Array.isArray(db[k])?db[k].length:0}));
  return {total:tables.reduce((a,x)=>a+x.count,0),tables};
}


// ===== V11.0 SERVER-SIDE PRICE HISTORY START =====
const V110_DATA_DIR = (typeof DATA_DIR !== 'undefined' && DATA_DIR) ? DATA_DIR : __dirname;
const PRICE_HISTORY_FILE = path.join(V110_DATA_DIR, 'metal_price_history.json');


function v110ServiceKey(){
  return (typeof SUPABASE_SERVICE_ROLE_KEY !== 'undefined' && SUPABASE_SERVICE_ROLE_KEY) ||
         (typeof SUPABASE_SERVICE_KEY !== 'undefined' && SUPABASE_SERVICE_KEY) ||
         (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) ||
         process.env.SUPABASE_SERVICE_ROLE_KEY ||
         process.env.SUPABASE_SERVICE_KEY ||
         process.env.SUPABASE_ANON_KEY ||
         '';
}

async function v110SbRest(pathname, opts){
  if(!(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL)) throw new Error('SUPABASE_URL missing');
  const key = v110ServiceKey();
  if(!key) throw new Error('Supabase key missing');
  const url = SUPABASE_URL.replace(/\/$/,'') + pathname;
  const headers = Object.assign({
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }, (opts && opts.headers) || {});
  const r = await fetch(url, Object.assign({}, opts || {}, {headers}));
  const txt = await r.text();
  if(!r.ok) throw new Error('Supabase history HTTP ' + r.status + ': ' + txt.slice(0,200));
  try{return txt ? JSON.parse(txt) : null}catch(e){return txt}
}

function v110ReadHistoryFile(){
  try{
    if(!fs.existsSync(PRICE_HISTORY_FILE)) return [];
    const raw = fs.readFileSync(PRICE_HISTORY_FILE,'utf8');
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}

function v110WriteHistoryFile(arr){
  try{
    fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify((arr||[]).slice(0, 10000), null, 2));
  }catch(e){}
}

function v110ExtractPrice(metals, key){
  try{
    const m = metals && metals[key];
    const p = m && (m.price ?? m.value ?? m.last ?? m.rawPrice);
    const n = Number(p);
    return Number.isFinite(n) && n > 0 ? n : null;
  }catch(e){ return null; }
}

async function v110SnapshotPriceHistory(metalsPayload, fxPayload){
  try{
    const metals = metalsPayload && metalsPayload.metals ? metalsPayload.metals : (metalsPayload || {});
    const rows = [];
    const at = new Date().toISOString();

    const alu = v110ExtractPrice(metals, 'aluminium');
    const cop = v110ExtractPrice(metals, 'copper');
    const zin = v110ExtractPrice(metals, 'zinc');

    if(alu) rows.push({ created_at: at, symbol: 'ALU', price: alu, unit: 'USD/t', source: (metals.aluminium && (metals.aluminium.source || metals.aluminium.note)) || metalsPayload.source || 'api/metals' });
    if(cop) rows.push({ created_at: at, symbol: 'MCU3', price: cop, unit: 'USD/t', source: (metals.copper && (metals.copper.source || metals.copper.note)) || metalsPayload.source || 'api/metals' });
    if(zin) rows.push({ created_at: at, symbol: 'ZIN', price: zin, unit: 'USD/t', source: (metals.zinc && (metals.zinc.source || metals.zinc.note)) || metalsPayload.source || 'api/metals' });

    if(fxPayload){
      const fxItems = [
        ['USDTRY', fxPayload.usdtry || fxPayload.USDTRY],
        ['EURTRY', fxPayload.eurtry || fxPayload.EURTRY],
        ['GBPTRY', fxPayload.gbptry || fxPayload.GBPTRY]
      ];
      fxItems.forEach(([symbol, val])=>{
        const n = Number(val);
        if(Number.isFinite(n) && n > 0) rows.push({ created_at: at, symbol, price: n, unit: 'TRY', source: fxPayload.source || 'api/fx' });
      });
    }

    if(!rows.length) return { saved: 0 };

    // Avoid saving near-duplicate snapshots too often: same symbol under 25s skipped.
    if((typeof SUPABASE_ENABLED !== 'undefined' && SUPABASE_ENABLED) && (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) && v110ServiceKey()){
      let saved = 0;
      for(const row of rows){
        try{
          const recent = await v110SbRest('/rest/v1/metal_price_history?symbol=eq.' + encodeURIComponent(row.symbol) + '&select=created_at,price&order=created_at.desc&limit=1');
          const last = Array.isArray(recent) && recent[0] ? recent[0] : null;
          if(last && Math.abs(Date.now() - new Date(last.created_at).getTime()) < 25000) continue;
          await v110SbRest('/rest/v1/metal_price_history', {
            method:'POST',
            headers:{'Prefer':'return=minimal'},
            body: JSON.stringify(row)
          });
          saved++;
        }catch(e){}
      }
      return { saved, mode:'supabase' };
    }

    const arr = v110ReadHistoryFile();
    for(const row of rows){
      const last = arr.find(x => x.symbol === row.symbol);
      if(last && Math.abs(Date.now() - new Date(last.created_at).getTime()) < 25000) continue;
      arr.unshift(row);
    }
    v110WriteHistoryFile(arr);
    return { saved: rows.length, mode:'local-file' };
  }catch(e){
    return { saved:0, error:e.message };
  }
}

async function v110GetPriceHistory(params){
  const symbol = (params.get('symbol') || '').toUpperCase();
  const limit = Math.min(Number(params.get('limit') || 1000), 5000);
  const days = Number(params.get('days') || 0);
  const since = days > 0 ? new Date(Date.now() - days*24*3600*1000).toISOString() : null;

  if((typeof SUPABASE_ENABLED !== 'undefined' && SUPABASE_ENABLED) && (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) && v110ServiceKey()){
    let query = '/rest/v1/metal_price_history?select=created_at,symbol,price,unit,source&order=created_at.asc&limit=' + limit;
    if(symbol) query += '&symbol=eq.' + encodeURIComponent(symbol);
    if(since) query += '&created_at=gte.' + encodeURIComponent(since);
    try{
      const rows = await v110SbRest(query);
      return { mode:'supabase', source:'metal_price_history', items: Array.isArray(rows) ? rows : [] };
    }catch(e){
      // fallback below
    }
  }

  let rows = v110ReadHistoryFile();
  if(symbol) rows = rows.filter(x => String(x.symbol||'').toUpperCase() === symbol);
  if(since) rows = rows.filter(x => String(x.created_at||'') >= since);
  rows = rows.slice(0, limit).reverse();
  return { mode:'local-file', source:'metal_price_history.json', items: rows };
}
// ===== V11.0 SERVER-SIDE PRICE HISTORY END =====

function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(JSON.stringify(obj,null,2));}
function serve(res,file){const full=path.join(__dirname,file); if(!fs.existsSync(full)){res.writeHead(404);res.end('Not found');return} const ext=path.extname(full).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','Expires':'0'});fs.createReadStream(full).pipe(res)}

// ===== V11.0.2 INVESTING 403 SAFE FALLBACK START =====
async function v1102GetLastHistoryBySymbol(symbol){
  try{
    const res = await v110GetPriceHistory(new URLSearchParams({symbol:String(symbol||'').toUpperCase(),limit:'1'}));
    const items = res && res.items ? res.items : [];
    return items && items.length ? items[items.length-1] : null;
  }catch(e){ return null; }
}

async function v1102BuildSafeMetalsPayload(errorMessage){
  const out = {
    source: 'safe-fallback',
    fetchedAt: new Date().toISOString(),
    warning: errorMessage || 'Primary Investing metals source failed',
    metals: {
      aluminium: { symbol:'ALU', name:'Aluminium', unit:'USD/t', price:null, source:'unavailable' },
      copper: { symbol:'MCU3', name:'London Copper / Bakır Vadeli İşlemleri', unit:'USD/t', price:null, source:'MCU3 unavailable' },
      zinc: { symbol:'ZIN', name:'Zinc', unit:'USD/t', price:null, source:'unavailable' }
    }
  };

  // Copper must try direct MCU3 first.
  try{
    if(typeof getMCU3CopperPrice === 'function'){
      const c = await getMCU3CopperPrice();
      if(c && c.price){
        out.metals.copper = {
          symbol:'MCU3',
          name:'London Copper / Bakır Vadeli İşlemleri',
          unit:'USD/t',
          price:Number(c.price),
          rawPrice:Number(c.price),
          rawUnit:'USD/t',
          source:c.source || 'Investing.com MCU3 direct',
          url:c.url || (typeof MCU3_COPPER_URL !== 'undefined' ? MCU3_COPPER_URL : ''),
          fetchedAt:c.fetchedAt || new Date().toISOString(),
          note:'Primary copper source: MCU3 direct'
        };
      }
    }
  }catch(e){
    out.copperError = e.message;
  }

  // If any metal unavailable, use last server history as fallback, not fake generated data.
  for(const [symbol,key] of [['ALU','aluminium'],['MCU3','copper'],['ZIN','zinc']]){
    if(out.metals[key] && out.metals[key].price) continue;
    const last = await v1102GetLastHistoryBySymbol(symbol);
    if(last && Number(last.price)>0){
      out.metals[key] = {
        symbol,
        name:key === 'copper' ? 'London Copper / Bakır Vadeli İşlemleri' : key,
        unit:last.unit || 'USD/t',
        price:Number(last.price),
        rawPrice:Number(last.price),
        rawUnit:last.unit || 'USD/t',
        source:'last server history',
        fetchedAt:last.created_at,
        note:'Live source failed, last successful server-side price used'
      };
    }
  }

  return out;
}
// ===== V11.0.2 INVESTING 403 SAFE FALLBACK END =====


// ===== V13.2 AUTO HISTORY SNAPSHOT START =====
let V132_HISTORY_TIMER = null;
let V132_LAST_AUTO_SNAPSHOT_AT = null;
let V132_LAST_AUTO_SNAPSHOT_RESULT = null;
let V132_AUTO_SNAPSHOT_RUNNING = false;

async function v132RunAutoHistorySnapshot(){
  if(V132_AUTO_SNAPSHOT_RUNNING) return {ok:false, skipped:'already_running'};
  V132_AUTO_SNAPSHOT_RUNNING = true;

  try{
    if(typeof getMetals !== 'function' || typeof v110SnapshotPriceHistory !== 'function'){
      return {ok:false, error:'history functions missing'};
    }

    let metalsData;
    try{
      metalsData = await getMetals();
    }catch(e){
      if(typeof v1102BuildSafeMetalsPayload === 'function'){
        metalsData = await v1102BuildSafeMetalsPayload(e.message);
      }else{
        throw e;
      }
    }

    let fxData = null;
    try{
      if(typeof getFx === 'function') fxData = await getFx();
    }catch(e){}

    const saved = await v110SnapshotPriceHistory(metalsData, fxData);
    V132_LAST_AUTO_SNAPSHOT_AT = new Date().toISOString();
    V132_LAST_AUTO_SNAPSHOT_RESULT = {
      ok:true,
      at:V132_LAST_AUTO_SNAPSHOT_AT,
      saved,
      source: metalsData && metalsData.source ? metalsData.source : null,
      metals: metalsData && metalsData.metals ? Object.keys(metalsData.metals) : []
    };
    return V132_LAST_AUTO_SNAPSHOT_RESULT;
  }catch(e){
    V132_LAST_AUTO_SNAPSHOT_AT = new Date().toISOString();
    V132_LAST_AUTO_SNAPSHOT_RESULT = {
      ok:false,
      at:V132_LAST_AUTO_SNAPSHOT_AT,
      error:e.message
    };
    return V132_LAST_AUTO_SNAPSHOT_RESULT;
  }finally{
    V132_AUTO_SNAPSHOT_RUNNING = false;
  }
}

function v132StartAutoHistorySnapshot(){
  const enabled = String(process.env.AUTO_HISTORY_SNAPSHOT || 'true').toLowerCase() !== 'false';
  if(!enabled) return;

  const intervalMs = Number(process.env.HISTORY_SNAPSHOT_INTERVAL_MS || 60000);
  const safeInterval = Number.isFinite(intervalMs) && intervalMs >= 30000 ? intervalMs : 60000;

  if(V132_HISTORY_TIMER) return;

  setTimeout(()=>{ v132RunAutoHistorySnapshot().catch(()=>{}); }, 8000);
  V132_HISTORY_TIMER = setInterval(()=>{ v132RunAutoHistorySnapshot().catch(()=>{}); }, safeInterval);

  if(V132_HISTORY_TIMER && typeof V132_HISTORY_TIMER.unref === 'function'){
    V132_HISTORY_TIMER.unref();
  }
}

setTimeout(v132StartAutoHistorySnapshot, 1500);
// ===== V13.2 AUTO HISTORY SNAPSHOT END =====






// ===== V13.3C SUPABASE ENV CLIENT START =====
let V133C_SUPABASE_CLIENT = null;

function v133cGetSupabaseClient(){
  if(V133C_SUPABASE_CLIENT && typeof V133C_SUPABASE_CLIENT.from === 'function') return V133C_SUPABASE_CLIENT;

  try{
    if(typeof supabase !== 'undefined' && supabase && typeof supabase.from === 'function') return supabase;
  }catch(e){}
  try{
    if(typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function') return supabaseClient;
  }catch(e){}
  try{
    if(typeof sb !== 'undefined' && sb && typeof sb.from === 'function') return sb;
  }catch(e){}
  try{
    if(typeof supabaseAdmin !== 'undefined' && supabaseAdmin && typeof supabaseAdmin.from === 'function') return supabaseAdmin;
  }catch(e){}

  try{
    const url =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if(!url || !key) return null;

    // Try already imported createClient first
    if(typeof createClient === 'function'){
      V133C_SUPABASE_CLIENT = createClient(url, key);
      return V133C_SUPABASE_CLIENT;
    }

    // Fallback require
    const mod = require('@supabase/supabase-js');
    if(mod && typeof mod.createClient === 'function'){
      V133C_SUPABASE_CLIENT = mod.createClient(url, key);
      return V133C_SUPABASE_CLIENT;
    }
  }catch(e){
    return null;
  }

  return null;
}

function v133cSupabaseEnvStatus(){
  return {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}
// ===== V13.3C SUPABASE ENV CLIENT END =====

// ===== V13.3 HISTORY READ ORDER FIX START =====
async function v133FetchHistoryRows(opts={}){
  const limit = Math.max(1, Math.min(Number(opts.limit || 500), 5000));
  const symbol = opts.symbol ? String(opts.symbol).toUpperCase() : null;
  const client = v133cGetSupabaseClient();

  if(!client){
    return {
      ok:false,
      mode:'no_supabase',
      order:'created_at_desc',
      count:0,
      latest:null,
      items:[],
      env:v133cSupabaseEnvStatus()
    };
  }

  let query = client
    .from('metal_price_history')
    .select('created_at,symbol,price,unit,source')
    .order('created_at', {ascending:false})
    .limit(limit);

  if(symbol) query = query.eq('symbol', symbol);

  const {data, error} = await query;
  if(error) throw error;

  const items = Array.isArray(data) ? data : [];
  return {
    ok:true,
    mode:'supabase',
    order:'created_at_desc',
    count:items.length,
    latest:items[0] || null,
    items
  };
}

async function v133FetchLatestBySymbol(){
  const client = v133cGetSupabaseClient ? v133cGetSupabaseClient() : null;

  if(!client){
    return {
      ok:false,
      mode:'no_supabase',
      count:0,
      items:[],
      env:typeof v133cSupabaseEnvStatus === 'function' ? v133cSupabaseEnvStatus() : {}
    };
  }

  // Sabit sembol arama yerine son kayıtları çekip symbol'e göre grupla.
  // Böylece ALU / aluminium / copper / MCU3 gibi isim farkları sorun olmaz.
  const {data, error} = await client
    .from('metal_price_history')
    .select('created_at,symbol,price,unit,source')
    .order('created_at', {ascending:false})
    .limit(1000);

  if(error) throw error;

  const latestMap = {};
  const rows = Array.isArray(data) ? data : [];

  rows.forEach(row=>{
    const key = String(row.symbol || '').trim();
    if(!key) return;
    if(!latestMap[key]) latestMap[key] = row;
  });

  const items = Object.values(latestMap);

  return {
    ok:true,
    mode:'supabase',
    order:'latest_dynamic_by_symbol',
    count:items.length,
    scanned:rows.length,
    items
  };
}

async function v133CountHistoryRows(){
  const client = v133cGetSupabaseClient();

  if(!client){
    return {
      ok:false,
      mode:'no_supabase',
      count:null,
      env:v133cSupabaseEnvStatus()
    };
  }

  const {count, error} = await client
    .from('metal_price_history')
    .select('*', {count:'exact', head:true});

  if(error) throw error;

  return {
    ok:true,
    mode:'supabase',
    count
  };
}
// ===== V13.3 HISTORY READ ORDER FIX END =====

http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost:'+PORT);
  if(u.pathname==='/'||u.pathname==='/index.html'){serve(res,'index.html');return}
  
  if(u.pathname==='/api/mcu3-copper'){
    try{
      json(res,200,await getMCU3CopperPrice());
    }catch(e){
      json(res,503,{error:e.message,symbol:'MCU3',source:'Investing.com MCU3 direct:failed',url:MCU3_COPPER_URL});
    }
    return;
  }


  

  // ===== V13.2 HISTORY STATUS ROUTE START =====

  // ===== V13.3 HISTORY READ ROUTES START =====

  // ===== V13.3D SYMBOLS ROUTE START =====
  if(u.pathname==='/api/metals-history/symbols'){
    const client = typeof v133cGetSupabaseClient === 'function' ? v133cGetSupabaseClient() : null;
    if(!client){
      json(res,200,{ok:false, mode:'no_supabase', symbols:[]});
      return;
    }

    const {data, error} = await client
      .from('metal_price_history')
      .select('symbol,created_at')
      .order('created_at', {ascending:false})
      .limit(5000);

    if(error) throw error;

    const seen = {};
    (Array.isArray(data)?data:[]).forEach(r=>{
      const s = String(r.symbol || '').trim();
      if(!s) return;
      if(!seen[s]) seen[s] = {symbol:s, lastSeen:r.created_at, count:0};
      seen[s].count++;
    });

    json(res,200,{ok:true, mode:'supabase', count:Object.keys(seen).length, symbols:Object.values(seen)});
    return;
  }
  // ===== V13.3D SYMBOLS ROUTE END =====

  if(u.pathname==='/api/metals-history/latest'){
    const result = await v133FetchLatestBySymbol();
    json(res,200,result);
    return;
  }


  


  // ===== V13.3C SUPABASE DEBUG ROUTE START =====
  if(u.pathname==='/api/supabase-status'){
    const client = v133cGetSupabaseClient();
    json(res,200,{
      ok:!!client,
      clientFound:!!client,
      env:v133cSupabaseEnvStatus()
    });
    return;
  }
  // ===== V13.3C SUPABASE DEBUG ROUTE END =====

  if(u.pathname==='/api/metals-history/count'){
    const result = await v133CountHistoryRows();
    json(res,200,result);
    return;
  }

  if(u.pathname==='/api/metals-history/recent'){
    const limit = Number(u.searchParams.get('limit') || 500);
    const symbol = u.searchParams.get('symbol');
    const result = await v133FetchHistoryRows({limit, symbol});
    json(res,200,result);
    return;
  }
  // ===== V13.3 HISTORY READ ROUTES END =====

  if(u.pathname==='/api/metals-history/status'){
    json(res,200,{
      ok:true,
      autoSnapshot:true,
      lastAutoSnapshotAt:V132_LAST_AUTO_SNAPSHOT_AT,
      lastAutoSnapshotResult:V132_LAST_AUTO_SNAPSHOT_RESULT,
      intervalMs:Number(process.env.HISTORY_SNAPSHOT_INTERVAL_MS || 60000)
    });
    return;
  }

  if(u.pathname==='/api/metals-history/auto-snapshot'){
    const result = await v132RunAutoHistorySnapshot();
    json(res,200,result);
    return;
  }
  // ===== V13.2 HISTORY STATUS ROUTE END =====

  if(u.pathname==='/api/metals-history/snapshot'){
    let metalsData;
    try{
      metalsData=await getMetals();
    }catch(e){
      metalsData=await v1102BuildSafeMetalsPayload(e.message);
    }
    let fxData=null;
    try{ if(typeof getFx==='function') fxData=await getFx(); }catch(e){}
    const saved=await v110SnapshotPriceHistory(metalsData,fxData);
    json(res,200,{ok:true,snapshot:saved,source:metalsData.source,warning:metalsData.warning||null,metals:metalsData && metalsData.metals ? Object.keys(metalsData.metals) : []});
    return;
  }

if(u.pathname==='/api/metals-history'){
    const limit = Number(u.searchParams.get('limit') || 500);
    const symbol = u.searchParams.get('symbol');
    const order = String(u.searchParams.get('order') || 'desc').toLowerCase();
    const result = await v133FetchHistoryRows({limit, symbol});

    if(order === 'asc'){
      result.items = result.items.slice().reverse();
      result.order = 'created_at_asc';
      result.latest = result.items[result.items.length-1] || null;
    }

    json(res,200,result);
    return;
  }

if(u.pathname==='/api/metals'){
    let metalsData;
    try{
      metalsData=await getMetals();
    }catch(e){
      metalsData=await v1102BuildSafeMetalsPayload(e.message);
    }
    try{await v110SnapshotPriceHistory(metalsData,null);}catch(e){}
    json(res,200,metalsData);
    return;
  }

  if(u.pathname==='/api/db-summary'){if(SUPABASE_ENABLED){json(res,200,await sbSummary());return} json(res,200,dbSummary());return}
  if(u.pathname==='/api/audit'){const limit=Number(u.searchParams.get('limit')||20); if(SUPABASE_ENABLED){const rows=await sbAuditList(limit); json(res,200,{mode:'supabase',items:(rows||[]).map(r=>({at:r.created_at,actor:r.actor,action:r.action,table:r.table_name,record_id:r.record_id,meta:r.meta}))});return} const a=readJsonFile(AUDIT_FILE,[]); json(res,200,{mode:'local-json',items:a.slice(0,limit)});return}
  if(u.pathname==='/api/supabase-test'){if(!SUPABASE_ENABLED){json(res,200,{ok:false,configured:false,message:'Supabase .env ayarlı değil'});return} try{json(res,200,{ok:true,configured:true,summary:await sbSummary()});return}catch(e){json(res,500,{ok:false,configured:true,error:e.message});return}}
  if(u.pathname.startsWith('/api/db/')){
    const parts=u.pathname.split('/').filter(Boolean);
    const table=decodeURIComponent(parts[2]||'');
    const id=parts[3]?decodeURIComponent(parts[3]):null;
    if(!table){json(res,400,{error:'Table required'});return}
    if(SUPABASE_ENABLED){
      if(req.method==='GET'){json(res,200,{mode:'supabase',table,data:await sbGetTable(table)});return}
      if(req.method==='POST'){const body=await readBody(req);const data=await sbSetTable(table,Array.isArray(body.data)?body.data:[],actorFrom(req));json(res,200,{ok:true,mode:'supabase',table,data});return}
      if(req.method==='DELETE'){const data=id?await sbDeleteRecord(table,id,actorFrom(req)):await sbGetTable(table);json(res,200,{ok:true,mode:'supabase',table,data});return}
    }
    const db=readSharedDb();
    if(req.method==='GET'){
      json(res,200,{table,data:Array.isArray(db[table])?db[table]:[]});return
    }
    if(req.method==='POST'){
      const body=await readBody(req);
      db[table]=Array.isArray(body.data)?body.data:[];
      writeSharedDb(db);
      addAudit('set',table,actorFrom(req),{count:db[table].length});
      json(res,200,{ok:true,table,data:db[table]});return
    }
    if(req.method==='DELETE'){
      const arr=Array.isArray(db[table])?db[table]:[];
      db[table]=id?arr.filter(x=>String(x.id)!==String(id)):arr;
      writeSharedDb(db);
      addAudit('delete',table,actorFrom(req),{id});
      json(res,200,{ok:true,table,data:db[table]});return
    }
  }

  if(u.pathname==='/api/fx'){const fxData=await getFx(); try{await v110SnapshotPriceHistory(null,fxData);}catch(e){} json(res,200,fxData);return}
  if(u.pathname==='/api/health'){json(res,200,{ok:true,port:PORT,version:'V10.6 Today Advanced Charts Auto Backup',dbMode:SUPABASE_ENABLED?'supabase':'local-json',supabaseConfigured:SUPABASE_ENABLED,lanUrl:lanUrl(),publicUrl:process.env.PUBLIC_URL||null,time:new Date().toISOString()});return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return}
  const safePath=decodeURIComponent(u.pathname.replace(/^\//,'')); if(!safePath.includes('..')&&fs.existsSync(path.join(__dirname,safePath))){serve(res,safePath);return}
  json(res,404,{error:'Not found'});
}catch(e){json(res,500,{error:e.message,detail:'Investing verisi alınamadı. Bot koruması, bölgesel engel veya HTML yapısı değişmiş olabilir.'})}}).listen(PORT,()=>{console.log('AlPro V10.6.9 AŞAMA 1 çalışıyor: http://localhost:'+PORT);console.log('Bu sürümde eski modüller silinmedi; V5 ekleri sol menüye eklendi.');});
