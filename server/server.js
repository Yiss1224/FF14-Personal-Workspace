#!/usr/bin/env node
// FF14 Personal Workspace 自架伺服器：提供靜態網頁與 /api/state 同步 API，不需安裝任何套件。
// 環境變數：
//   PORT               監聽埠，預設 8080
//   FF14_TOKEN         同步金鑰（必填，前端「同步金鑰」按鈕輸入同一串）
//   FF14_DATA_DIR      資料存放目錄，預設 server/data
//   FF14_STATIC_DIR    靜態網頁目錄，預設專案根目錄；設為空字串則只提供 API
//   FF14_ALLOW_ORIGIN  允許跨網域呼叫的來源（例如 https://yiss1224.github.io），預設不開放
'use strict';
const http=require('http'),fs=require('fs'),path=require('path');

const PORT=Number(process.env.PORT)||8080;
const TOKEN=process.env.FF14_TOKEN||'';
const DATA_DIR=path.resolve(process.env.FF14_DATA_DIR||path.join(__dirname,'data'));
const STATIC_DIR=process.env.FF14_STATIC_DIR===''?null:path.resolve(process.env.FF14_STATIC_DIR||path.join(__dirname,'..'));
const ALLOW_ORIGIN=process.env.FF14_ALLOW_ORIGIN||'';
const SCOPES=new Set(['workspace','submarine']);
const MAX_BODY=5*1024*1024;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};

if(!TOKEN){console.error('請設定 FF14_TOKEN 環境變數');process.exit(1)}
fs.mkdirSync(DATA_DIR,{recursive:true});

function send(res,status,body,headers={}){
  const isJson=typeof body!=='string'&&!Buffer.isBuffer(body);
  res.writeHead(status,Object.assign({'Content-Type':isJson?'application/json; charset=utf-8':'text/plain; charset=utf-8'},headers));
  res.end(isJson?JSON.stringify(body):body);
}
function cors(req,res){
  if(ALLOW_ORIGIN&&req.headers.origin===ALLOW_ORIGIN){
    res.setHeader('Access-Control-Allow-Origin',ALLOW_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Vary','Origin');
  }
}
function authorized(req){
  const m=/^Bearer (.+)$/.exec(req.headers.authorization||'');
  if(!m)return false;
  const a=Buffer.from(m[1]),b=Buffer.from(TOKEN);
  return a.length===b.length&&require('crypto').timingSafeEqual(a,b);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(Object.assign(new Error('資料過大'),{status:413}));req.destroy();return}chunks.push(c)});
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error',reject);
  });
}
const stateFile=scope=>path.join(DATA_DIR,scope+'.json');
// 先寫暫存檔再改名，避免寫到一半斷電留下損毀的資料；上一版保留為 .bak。
function saveState(scope,record){
  const file=stateFile(scope),tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(record));
  if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');
  fs.renameSync(tmp,file);
}

async function api(req,res,scope){
  if(!SCOPES.has(scope))return send(res,404,{error:'unknown scope'});
  if(!authorized(req))return send(res,401,{error:'unauthorized'});
  if(req.method==='GET'){
    if(!fs.existsSync(stateFile(scope)))return send(res,404,{error:'not found'});
    return send(res,200,JSON.parse(fs.readFileSync(stateFile(scope),'utf8')));
  }
  if(req.method==='PUT'){
    let body;
    try{body=JSON.parse(await readBody(req))}catch(e){return send(res,e.status||400,{error:e.status?e.message:'invalid json'})}
    if(!body||typeof body.data!=='object'||body.data===null||Array.isArray(body.data))return send(res,400,{error:'data must be an object'});
    const record={data:body.data,updatedAt:new Date().toISOString()};
    saveState(scope,record);
    return send(res,200,{updatedAt:record.updatedAt});
  }
  return send(res,405,{error:'method not allowed'},{Allow:'GET, PUT'});
}

function serveStatic(req,res,pathname){
  if(!STATIC_DIR||!['GET','HEAD'].includes(req.method))return send(res,404,'Not found');
  const rel=decodeURIComponent(pathname==='/'?'/index.html':pathname);
  const file=path.join(STATIC_DIR,rel);
  // 不提供專案外、隱藏檔（.git 等）與伺服器自己的目錄。
  if(!file.startsWith(STATIC_DIR+path.sep)||rel.split('/').some(p=>p.startsWith('.'))||file.startsWith(path.join(STATIC_DIR,'server')+path.sep))return send(res,404,'Not found');
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())return send(res,404,'Not found');
    res.writeHead(200,{'Content-Type':TYPES[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':st.size});
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server=http.createServer(async(req,res)=>{
  try{
    cors(req,res);
    const {pathname}=new URL(req.url,'http://localhost');
    if(req.method==='OPTIONS')return send(res,204,'');
    if(pathname==='/api/health')return send(res,200,{ok:true});
    const m=/^\/api\/state\/([a-z]+)$/.exec(pathname);
    if(m)return await api(req,res,m[1]);
    if(pathname.startsWith('/api/'))return send(res,404,{error:'not found'});
    serveStatic(req,res,pathname);
  }catch(e){console.error(e);if(!res.headersSent)send(res,500,{error:'server error'})}
});
if(require.main===module)server.listen(PORT,()=>console.log(`FF14 workspace server on :${PORT}, data in ${DATA_DIR}`));
module.exports=server;
