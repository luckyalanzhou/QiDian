import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handle } from '../server/api.js';
import { openSelfHostedDatabase } from '../server/sqlite-migrations.mjs';
import { loadOrCreateTotpEncryptionKey } from '../server/totp-key.mjs';
import { readStorageCapacity } from '../server/storage-capacity.mjs';
import { createPreviewRequestUrl } from './preview-request.mjs';
import { appendPreviewBuildMarker } from './preview-build-marker.mjs';
const dataDir=resolve(process.env.QIDIAN_PREVIEW_DATA_DIR||'.local');
await mkdir(dataDir, { recursive:true });
const db=await openSelfHostedDatabase({ databasePath:resolve(dataDir,'preview.sqlite'), migrationsDir:resolve('migrations'), backupsDir:resolve(dataDir,'migration-backups') });
const root=resolve(process.env.QIDIAN_PREVIEW_DIST_DIR||'dist'), port=Number(process.env.QIDIAN_PREVIEW_PORT||8788);
const previewBuildMarker=createHash('sha256').update(await readFile(resolve(root,'index.html'))).digest('hex').slice(0,16);
const server=createServer(async (incoming,outgoing)=>{
 try {
  const url=createPreviewRequestUrl(incoming.headers.host,incoming.url,port);
  if(!url) { if(!incoming.complete){outgoing.shouldKeepAlive=false;outgoing.writeHead(403,{'Connection':'close'});}else outgoing.writeHead(403);outgoing.end();return; }
  if(url.pathname.startsWith('/api/')) {
   const method=incoming.method;
   const body=['GET','HEAD'].includes(method)?undefined:Readable.toWeb(incoming);
   const request=new Request(url,{method,headers:incoming.headers,...(body?{body,duplex:'half'}:{})});
   const response=await handle(request,{DB:db,LOCAL_DEV:'true',REGISTRATION_ENABLED:'true',readStorageCapacity:()=>readStorageCapacity(dataDir),getTotpEncryptionKey:()=>loadOrCreateTotpEncryptionKey(dataDir)});
   const responseHeaders=Object.fromEntries(response.headers);
   if(!incoming.complete){outgoing.shouldKeepAlive=false;responseHeaders.Connection='close';}
   outgoing.writeHead(response.status,responseHeaders);outgoing.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const path=resolve(root, '.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root+sep)){outgoing.writeHead(403);outgoing.end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
  const fileContent=await readFile(path);
  const content=url.pathname==='/sw.js'?appendPreviewBuildMarker(fileContent,previewBuildMarker):fileContent;
  outgoing.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});outgoing.end(content);
 }catch{if(!outgoing.headersSent){if(!incoming.complete){outgoing.shouldKeepAlive=false;outgoing.writeHead(404,{'Connection':'close'});}else outgoing.writeHead(404);}outgoing.end('Local preview: file or request unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`SQLite local preview: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
