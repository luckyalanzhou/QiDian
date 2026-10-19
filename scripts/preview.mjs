import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handle } from '../server/api.js';
import { openSelfHostedDatabase } from '../server/sqlite-migrations.mjs';
const dataDir=resolve(process.env.QIDIAN_PREVIEW_DATA_DIR||'.local');
await mkdir(dataDir, { recursive:true });
const db=await openSelfHostedDatabase({ databasePath:resolve(dataDir,'preview.sqlite'), migrationsDir:resolve('migrations'), backupsDir:resolve(dataDir,'migration-backups') });
const root=resolve('dist'), port=Number(process.env.QIDIAN_PREVIEW_PORT||8788);
const server=createServer(async (incoming,outgoing)=>{
 try {
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(incoming.headers.host)) { outgoing.writeHead(403);outgoing.end();return; }
  const url=new URL(incoming.url,`http://127.0.0.1:${port}`);
  if(url.pathname.startsWith('/api/')) {
   let size=0;const chunks=[];
   for await(const chunk of incoming){size+=chunk.length;if(size>8*1024*1024+10000){outgoing.writeHead(413);outgoing.end();return;}chunks.push(chunk);}
   const method=incoming.method;
   const response=await handle(new Request(url,{method,headers:incoming.headers,body:['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks)}),{DB:db,LOCAL_DEV:'true',REGISTRATION_ENABLED:'true'});
   outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const path=resolve(root, '.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root+sep)){outgoing.writeHead(403);outgoing.end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
  outgoing.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});outgoing.end(await readFile(path));
 }catch{if(!outgoing.headersSent)outgoing.writeHead(404);outgoing.end('Local preview: file or request unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`SQLite local preview: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
