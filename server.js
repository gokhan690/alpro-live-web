// AlPro V5 - ORİJİNAL KORUNDU + Canlı Investing Proxy
// Çalıştır: node server.js  -> http://localhost:8833
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8833;
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

function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(JSON.stringify(obj,null,2));}
function serve(res,file){const full=path.join(__dirname,file); if(!fs.existsSync(full)){res.writeHead(404);res.end('Not found');return} const ext=path.extname(full).toLowerCase(); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'}; res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','Expires':'0'});fs.createReadStream(full).pipe(res)}
http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost:'+PORT);
  if(u.pathname==='/'||u.pathname==='/index.html'){serve(res,'index.html');return}
  if(u.pathname==='/api/metals'){json(res,200,await getMetals());return}
  if(u.pathname==='/api/fx'){json(res,200,await getFx());return}
  if(u.pathname==='/api/health'){json(res,200,{ok:true,port:PORT,version:'V5 original preserved',time:new Date().toISOString()});return}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return}
  const safePath=decodeURIComponent(u.pathname.replace(/^\//,'')); if(!safePath.includes('..')&&fs.existsSync(path.join(__dirname,safePath))){serve(res,safePath);return}
  json(res,404,{error:'Not found'});
}catch(e){json(res,500,{error:e.message,detail:'Investing verisi alınamadı. Bot koruması, bölgesel engel veya HTML yapısı değişmiş olabilir.'})}}).listen(PORT,()=>{console.log('AlPro V5 ORİJİNAL KORUNDU çalışıyor: http://localhost:'+PORT);console.log('Bu sürümde eski modüller silinmedi; V5 ekleri sol menüye eklendi.');});
