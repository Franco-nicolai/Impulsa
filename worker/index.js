import {sample,newProject,projectSummary,mutate,fail,validId,kinds,stages,statuses,canvasKeys} from './domain.js';
import {html,style,client} from './assets.js';

const headers = {
  'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
};
const json = (value,status=200) => Response.json(value,{status,headers});
const asset = (content,type) => new Response(content,{headers:{...headers,'content-type':type,
  'content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; img-src 'self' data:",
}});

function d1Store(db) {
  return {
    async list(owner) {
      const {results}=await db.prepare("SELECT json_extract(document,'$.id') AS id, json_extract(document,'$.title') AS title, json_extract(document,'$.idea') AS idea, json_extract(document,'$.stage') AS stage, updated_at AS updatedAt FROM projects WHERE owner=? ORDER BY updated_at DESC LIMIT 100").bind(owner).all();
      return results;
    },
    async get(owner,id) {
      const row=await db.prepare('SELECT revision,document FROM projects WHERE owner=? AND id=?').bind(owner,id).first();
      return row?{revision:row.revision,document:JSON.parse(row.document)}:null;
    },
    async create(owner,p) {
      const r=await db.prepare('INSERT OR IGNORE INTO projects (owner,id,revision,document,updated_at) VALUES (?,?,1,?,?)').bind(owner,p.id,JSON.stringify(p),p.updatedAt).run();
      return Boolean(r.meta.changes);
    },
    async replace(owner,p,revision) {
      const r=await db.prepare('UPDATE projects SET document=?, updated_at=?, revision=revision+1 WHERE owner=? AND id=? AND revision=?').bind(JSON.stringify(p),p.updatedAt,owner,p.id,revision).run();
      return Boolean(r.meta.changes);
    },
  };
}

async function getProject(store,owner,id) {
  if (!validId(id)) throw fail('Proyecto inválido.');
  const saved=await store.get(owner,id);
  if (saved) return {...saved.document,revision:saved.revision};
  if (id==='demo') return {...sample(),revision:null};
  throw fail('Proyecto no encontrado.',404);
}

async function createProject(store,owner,body) {
  const p=newProject(body);
  if (await store.create(owner,p)) return getProject(store,owner,p.id);
  const existing=await getProject(store,owner,p.id);
  if (existing.title===p.title && existing.idea===p.idea && existing.question===p.question) return existing;
  throw fail('Ese identificador ya pertenece a un proyecto.',409);
}

async function writeProject(store,owner,id,op) {
  if (!op || !validId(op.key)) throw fail('Falta un identificador único para el cambio.');
  for (let attempt=0;attempt<5;attempt++) {
    const current=await getProject(store,owner,id);
    if (current.keys.includes(op.key)) return current;
    const {revision,...document}=current;
    if (Object.hasOwn(op,'revision') && op.revision!==revision) throw fail('El proyecto cambió mientras editabas. Vuelve a abrir el registro y revisa los cambios recientes.',409);
    const next=mutate(document,op,op.key);
    const saved=revision===null?await store.create(owner,next):await store.replace(owner,next,revision);
    if (saved) return getProject(store,owner,id);
  }
  throw fail('El proyecto está recibiendo cambios. Reintenta en unos segundos.',409);
}

function visible(project) {
  const {keys,...safe}=project;
  return safe;
}

const string=(description)=>({type:'string',description});
const recordSchema={type:'object',required:['kind','title','id'],additionalProperties:false,properties:{
  id:string('Identificador de un registro existente o ID único para uno nuevo.'),
  kind:{type:'string',enum:kinds},title:string('Título corto.'),body:string('Texto, hallazgo o transcripción. Integra variables con {{clave}}.'),
  stage:{type:'string',enum:stages.map(([key])=>key)},status:{type:'string',enum:statuses},
  refs:{type:'array',items:{type:'string'},maxItems:24},url:string('URL original de la evidencia.'),
  key:string('Clave reutilizable para una variable.'),value:string('Valor actual de la variable.'),canvasKey:{type:'string',enum:canvasKeys},
}};
const projectFields={type:'object',additionalProperties:false,properties:{
  title:string('Nombre del proyecto.'),idea:string('Descripción actual.'),question:string('Pregunta que debe resolver el fundador.'),
  stage:{type:'string',enum:stages.map(([key])=>key)},step:string('ID de una tarea del proyecto que pasa a ser el siguiente paso.'),
}};
const proposalSchema={type:'object',required:['project_id','change_id','summary','changes'],additionalProperties:false,properties:{
  project_id:string('ID devuelto por listar_proyectos.'),change_id:string('ID estable y único. Reutilízalo si reintentas este mismo envío.'),
  summary:string('Descripción breve de la propuesta.'),source:string('Origen de la propuesta, como Conversación con la guía.'),
  changes:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,properties:{project:projectFields,record:recordSchema},oneOf:[{required:['project']},{required:['record']}]}}
}};
const mcpTools=[
  {name:'listar_proyectos',description:'Lista los proyectos de Impulso. El proyecto Café de Barrio es ficticio.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'leer_proyecto',description:'Recupera la pregunta actual, el siguiente paso y los registros de un proyecto. Lee antes de proponer cambios. Usa include_text para recuperar textos completos puntualizados por record_id.',inputSchema:{type:'object',required:['project_id'],additionalProperties:false,properties:{project_id:string('ID del proyecto.'),record_id:string('ID del registro que quieres leer en detalle.'),include_text:{type:'boolean'}}},annotations:{readOnlyHint:true}},
  {name:'proponer_cambios',description:'Envía supuestos, evidencias, entrevistas, experimentos, decisiones, Canvas, variables y tareas a la bandeja de revisión sin modificar el proyecto. Nunca inventes evidencia ni atribuyas decisiones sin confirmación.',inputSchema:proposalSchema,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
];

async function toolCall(store,owner,name,args) {
  if (name==='listar_proyectos') return {projects:await listProjects(store,owner)};
  if (name==='leer_proyecto') {
    const p=await getProject(store,owner,args.project_id);
    if (args.record_id) {
      const record=p.records.find((r)=>r.id===args.record_id);
      if (!record) throw fail('Registro no encontrado.',404);
      return {record:{...record,body:record.body.slice(0,args.include_text?12000:1000)}};
    }
    return {project:{...projectSummary(p),question:p.question,step:p.step,
      records:p.records.slice(0,45).map((r)=>({...r,body:r.body.slice(0,460)})),
      recordCount:p.records.length,pending:p.pending.map(({id,summary})=>({id,summary})),
    }};
  }
  if (name==='proponer_cambios') {
    if (!validId(args.change_id)) throw fail('Falta un ID de cambio válido.');
    const p=await writeProject(store,owner,args.project_id,{...args,type:'propose',key:args.change_id});
    const pending=p.pending.find((proposal)=>proposal.id===args.change_id);
    return {project_id:p.id,proposal_id:args.change_id,status:pending?'pending_review':'already_reviewed',summary:pending?.summary??args.summary};
  }
  throw fail('Herramienta desconocida.',404);
}

async function listProjects(store,owner) {
  const projects=await store.list(owner);
  return projects.some((p)=>p.id==='demo')?projects:[...projects,projectSummary(sample())];
}

async function readJson(request) {
  const max=950_000;
  if (Number(request.headers.get('content-length'))>max) throw fail('Solicitud demasiado grande.',413);
  let raw='';
  if (request.body) {
    const reader=request.body.getReader();
    const decoder=new TextDecoder();
    let length=0;
    try {
      for (;;) {
        const {done,value}=await reader.read();
        if (done) break;
        length+=value.byteLength;
        if (length>max) {
          await reader.cancel();
          throw fail('Solicitud demasiado grande.',413);
        }
        raw+=decoder.decode(value,{stream:true});
      }
      raw+=decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const data=JSON.parse(raw);
    if (data && typeof data==='object' && !Array.isArray(data)) return data;
  } catch {}
  throw fail('El cuerpo de la solicitud debe ser un objeto JSON.');
}

async function rpc(request,store,owner) {
  const msg=await readJson(request);
  if (msg.method?.startsWith?.('notifications/') && !Object.hasOwn(msg,'id')) return new Response(null,{status:202,headers});
  const response=(result)=>json({jsonrpc:'2.0',id:msg.id??null,result});
  const info={name:'impulso',title:'Impulso',version:'1.0.0'};
  if (msg.method==='server/discover') return response({supportedVersions:['2026-07-28'],capabilities:{tools:{}},serverInfo:info});
  if (msg.method==='initialize') return response({protocolVersion:msg.params?.protocolVersion==='2026-07-28'?'2026-07-28':'2025-03-26',capabilities:{tools:{}},serverInfo:info});
  if (msg.method==='ping') return response({});
  if (msg.method==='tools/list') return response({tools:mcpTools});
  if (msg.method==='tools/call') {
    try {
      const result=await toolCall(store,owner,msg.params?.name,msg.params?.arguments??{});
      return response({content:[{type:'text',text:JSON.stringify(result)}]});
    } catch (e) {
      if (!e.status) console.error('MCP tool failed',e);
      return response({isError:true,content:[{type:'text',text:e.status?e.message:'No se pudo completar la operación.'}]});
    }
  }
  return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Method not found'}});
}

async function handle(request,env) {
  const url=new URL(request.url);
  const path=url.pathname;
  const method=request.method;
  if (method==='GET' && path==='/') return asset(html,'text/html; charset=utf-8');
  if (method==='GET' && path==='/style.css') return asset(style,'text/css; charset=utf-8');
  if (method==='GET' && path==='/app.js') return asset(client,'text/javascript; charset=utf-8');
  try {
    if (method==='POST' && path==='/api/session' && env.session) return env.session(request,await readJson(request));
    const action=path.startsWith('/actions/');
    const owner=env.authorize?await env.authorize(request,action):request.headers.get('oai-authenticated-user-id');
    if (!owner) return json({error:'Inicia sesión para abrir tu espacio.',loginMode:env.loginMode??'sites'},401);
    const store=env.IMPULSO_STORE??(env.DB?d1Store(env.DB):null);
    if (!store) throw fail('El almacenamiento de Impulso aún no está disponible.',503);
    if (method==='POST' && path==='/mcp') return rpc(request,store,owner);
    if (path==='/mcp' && (method==='GET'||method==='DELETE')) return json({error:'Método no disponible.'},405);
    if (action && method==='POST') {
      const name=path.slice('/actions/'.length);
      return json(await toolCall(store,owner,name,await readJson(request)));
    }
    if (path==='/api/projects' && method==='GET') return json({projects:await listProjects(store,owner),integration:env.loginMode==='code'?'actions':'sites'});
    if (path==='/api/projects' && method==='POST') return json({project:visible(await createProject(store,owner,await readJson(request)))},201);
    const match=path.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
    if (match && method==='GET') {
      const p=await getProject(store,owner,match[1]);
      if (url.searchParams.get('revision')===String(p.revision)) return new Response(null,{status:304,headers});
      return json({project:visible(p)});
    }
    if (match && method==='POST') return json({project:visible(await writeProject(store,owner,match[1],await readJson(request)))});
    return json({error:'Ruta no disponible.'},404);
  } catch (error) {
    if (!error.status) console.error('Impulso request failed',error);
    return json({error:error.status?error.message:'No se pudo completar la solicitud.'},error.status??500);
  }
}
export default {fetch:handle};
export {handle,d1Store,mcpTools};
