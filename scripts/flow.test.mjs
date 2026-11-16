import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker/index.js';
import {openDatabase} from './preview.mjs';

test('creation, guide proposals, approvals, linked variables and concurrent edits',async()=>{
  const DB=openDatabase();
  try {
    const call=(path,body,owner='franco')=>handle(new Request('https://example.test'+path,{headers:owner?{'oai-authenticated-user-id':owner}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{DB});
    assert.equal((await call('/api/projects',null,null)).status,401);
    assert.equal((await call('/')).status,200);
    assert.equal((await call('/style.css')).status,200);
    assert.equal((await call('/app.js')).status,200);
    const created=await call('/api/projects',{id:'test',title:'Proyecto de prueba',idea:'Contrastar el problema'});
    assert.equal(created.status,201);
    const {project}=await created.json();
    assert.equal(project.revision,1);
    assert.equal((await call('/api/projects/test',null,'another')).status,404);
    const listed=await call('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'});
    assert.equal((await listed.json()).result.tools.length,3);
    const proposal={project_id:'test',change_id:'chat-session',summary:'Primer experimento',changes:[
      {project:{step:'interview-task',stage:'validation'}},
      {record:{id:'interview-task',kind:'task',title:'Hacer entrevistas'}},
      {record:{id:'evidence',kind:'interview',title:'Primera entrevista',body:'La persona indicó dos pedidos perdidos.',refs:['interview-task']}},
      {record:{id:'price',kind:'variable',title:'Precio',key:'precio',value:'19.990'}},
      {record:{id:'canvas-revenue',kind:'canvas',canvasKey:'revenue',title:'Ingresos',body:'Suscripción de {{precio}} CLP',refs:['price']}},
    ]};
    const rpc=(params)=>call('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params});
    const send=()=>rpc({name:'proponer_cambios',arguments:proposal});
    const before=(await (await send()).json()).result;
    assert.equal(JSON.parse(before.content[0].text).status,'pending_review');
    await send();
    const review=(await (await call('/api/projects/test')).json()).project;
    assert.equal(review.records.length,0);
    assert.equal(review.pending.length,1);
    const applied=(await (await call('/api/projects/test',{key:'reviewed',type:'accept',id:'chat-session',revision:review.revision})).json()).project;
    assert.equal(applied.records.length,4);
    assert.equal(applied.step,'interview-task');
    const priced=(await (await call('/api/projects/test',{key:'updated-price',type:'record',revision:applied.revision,record:{...applied.records.find((r)=>r.id==='price'),value:'29.990',key:'precio_mensual'}})).json()).project;
    assert.equal(priced.records.find((r)=>r.id==='canvas-revenue').body,'Suscripción de {{precio_mensual}} CLP');
    assert.equal(priced.records.find((r)=>r.id==='price').value,'29.990');
    assert.equal((await call('/api/projects/test',{key:'stale',type:'project',revision:applied.revision,fields:{title:'Texto antiguo'}})).status,409);
    assert.equal((await call('/api/projects/test?revision='+priced.revision)).status,304);
    const pinned=(await (await call('/api/projects/test',{key:'new-task',type:'record',record:{id:'new-step',kind:'task',title:'Revisar entrevistas'},step:'new-step'})).json()).project;
    assert.equal(pinned.step,'new-step');
    assert.equal(JSON.parse((await (await send()).json()).result.content[0].text).status,'already_reviewed');
    await rpc({name:'proponer_cambios',arguments:{project_id:'test',change_id:'stale-proposal',summary:'Otro precio',changes:[{record:{...priced.records.find((r)=>r.id==='price'),value:'39.990'}}]}});
    await call('/api/projects/test',{key:'manual-price',type:'record',record:{...priced.records.find((r)=>r.id==='price'),value:'33.990'}});
    assert.equal((await call('/api/projects/test',{key:'accept-stale',type:'accept',id:'stale-proposal'})).status,409);
    const fresh=(await (await call('/api/projects/test')).json()).project;
    assert.equal(fresh.records.find((r)=>r.id==='price').value,'33.990');
    assert.equal(fresh.pending.length,1);
  } finally {
    DB.close();
  }
});
