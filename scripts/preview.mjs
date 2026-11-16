import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../worker/index.js';
function openDatabase(filename=':memory:') {
  const db=new DatabaseSync(filename);
  db.exec(readFileSync(new URL('../drizzle/0000_projects.sql',import.meta.url),'utf8').replace('CREATE TABLE projects','CREATE TABLE IF NOT EXISTS projects'));
  return {
    prepare(sql) {
      const statement=db.prepare(sql);
      return {bind:(...values)=>({
        run:async()=>({meta:statement.run(...values)}),
        first:async()=>statement.get(...values),
        all:async()=>({results:statement.all(...values)}),
      })};
    },
    close:()=>db.close(),
  };
}
function preview(filename) {
  const db=openDatabase(filename);
  const server=createServer(async(req,res)=>{
    const headers=new Headers(req.headers);
    headers.set('oai-authenticated-user-id','preview');
    const isWrite=req.method==='POST';
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,...(isWrite?{body:req,duplex:'half'}:{})});
    const response=await handle(request,{DB:db});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  });
  server.on('close',()=>db.close());
  return server;
}
if (process.argv[1]===new URL(import.meta.url).pathname) {
  const server=preview(process.argv[3]);
  server.listen(Number(process.argv[2])||4173,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
}
export {openDatabase,preview};
