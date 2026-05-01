// AlPro V5 - ORİJİNAL KORUNDU + Canlı Investing Proxy
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
  if(metal==='copper'){const ton=nums.find(x=>x.n>=1000&&x.n<=30000); if(ton)return {price:ton.n,rawPrice:ton.n,rawUnit:'USD/t',note:'Investing metals table'}; const lb=nums.find(x=>x.n>=1&&x.n<=20); if(lb)return {price:lb.n*LB_PER_METRIC_TON,rawPrice:lb.n,rawUnit:'USD/lb',note:'Copper converted from USD/lb to USD/t'};}
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
  const copper=parseCommodity(html,['Copper','Copper c3'],'copper');
  const zinc=parseCommodity(html,['Zinc','Zinc c3'],'zinc');
  const data={source:'Investing.com proxy - AlPro V5',url,fetchedAt:new Date().toISOString(),conversion:'Copper USD/lb -> USD/t if needed.',metals:{
    aluminium:{symbol:'ALUMINIUM',name:'Aluminium',unit:'USD/t',...aluminium},
    copper:{symbol:'COPPER',name:'Copper',unit:'USD/t',...copper},
    zinc:{symbol:'ZINC',name:'Zinc',unit:'USD/t',...zinc}
  }};
  const missing=Object.values(data.metals).filter(x=>x.price===null).map(x=>x.name); if(missing.length)data.warning='Ayrıştırılamadı: '+missing.join(', ');
  cache={data,at:Date.now()}; return data;
}

let fxCache = { data:null, at:0 };
async function getFx(){
  if(fxCache.data && Date.now()-fxCache.at<10*60_000) return {...fxCache.data, cached:true};
  const txt = await requestText('https://open.er-api.com/v6/latest/USD');
  let j;
  try{ j=JSON.parse(txt); }catch(e){ throw new Error('FX JSON parse error'); }
  const usdtry = j && j.rates ? Number(j.rates.TRY) : null;
  if(!usdtry || !Number.isFinite(usdtry)) throw new Error('USD/TRY bulunamadı');
  const data = {source:'open.er-api.com', base:'USD', quote:'TRY', usdtry, fetchedAt:new Date().toISOString()};
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

function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(JSON.stringify(obj,null,2));}
function serve(res,file){const full=path.join(__dirname,file); if(!fs.existsSync(full)){res.writeHead(404);res.end('Not found');return} const ext=path.extname(full).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','Expires':'0'});fs.createReadStream(full).pipe(res)}
http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost:'+PORT);
  if(u.pathname==='/'||u.pathname==='/index.html'){serve(res,'index.html');return}
  if(u.pathname==='/api/metals'){json(res,200,await getMetals());return}

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

  if(u.pathname==='/api/fx'){json(res,200,await getFx());return}
  if(u.pathname==='/api/health'){json(res,200,{ok:true,port:PORT,version:'V6.9M Currency Dashboard Widgets',dbMode:SUPABASE_ENABLED?'supabase':'local-json',supabaseConfigured:SUPABASE_ENABLED,lanUrl:lanUrl(),publicUrl:process.env.PUBLIC_URL||null,time:new Date().toISOString()});return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return}
  const safePath=decodeURIComponent(u.pathname.replace(/^\//,'')); if(!safePath.includes('..')&&fs.existsSync(path.join(__dirname,safePath))){serve(res,safePath);return}
  json(res,404,{error:'Not found'});
}catch(e){json(res,500,{error:e.message,detail:'Investing verisi alınamadı. Bot koruması, bölgesel engel veya HTML yapısı değişmiş olabilir.'})}}).listen(PORT,()=>{console.log('AlPro V5.9 AŞAMA 1 çalışıyor: http://localhost:'+PORT);console.log('Bu sürümde eski modüller silinmedi; V5 ekleri sol menüye eklendi.');});
