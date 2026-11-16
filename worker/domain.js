const stages = [
  ['idea', 'Idea'], ['problem', 'Problema'], ['validation', 'Validación'],
  ['model', 'Modelo'], ['mvp', 'MVP'], ['launch', 'Lanzamiento'],
];
const kinds = ['assumption', 'interview', 'source', 'decision', 'experiment', 'document', 'pestel', 'task', 'variable', 'canvas'];
const canvasKeys = ['problem', 'segments', 'value', 'solution', 'channels', 'revenue', 'costs', 'metrics', 'advantage'];
const statuses = ['open', 'validating', 'supported', 'rejected', 'done'];
const clean = (value, size = 200) => typeof value === 'string' ? value.trim().slice(0, size) : '';
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const fail = (message, status = 400) => Object.assign(new Error(message), {status});
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {}
  return '';
};

function sample() {
  const records = [
    {id:'a-problem',kind:'assumption',title:'Los pedidos dispersos hacen perder ventas',body:'Creemos que las cafeterías independientes pierden pedidos cuando los reciben por WhatsApp e Instagram. Falta medir frecuencia e impacto.',status:'validating',stage:'problem',refs:[]},
    {id:'a-pay',kind:'assumption',title:'Pagarían por consolidar sus pedidos',body:'Un local pagaría {{precio_mensual}} si reduce el tiempo invertido en responder y confirmar pedidos.',status:'open',stage:'validation',refs:[]},
    {id:'e-first',kind:'interview',title:'Entrevista con una dueña de cafetería',body:'Ejemplo ficticio. La dueña revisa dos bandejas en horario punta y recuerda dos pedidos sin confirmar en una semana.',status:'open',stage:'problem',refs:['a-problem']},
    {id:'d-first',kind:'decision',title:'Empezar por cafeterías independientes',body:'Acotamos a locales de una sola sucursal para observar el flujo completo antes de explorar cadenas.',status:'done',stage:'problem',refs:['a-problem','e-first']},
    {id:'t-first',kind:'task',title:'Entrevistar a 3 dueños de cafeterías',body:'Pídeles que reconstruyan su último turno con pedidos por mensajería. Registra quién recibió cada pedido y qué pasó después.',status:'open',stage:'problem',refs:['a-problem']},
    {id:'v-price',kind:'variable',title:'Precio mensual',key:'precio_mensual',value:'$19.990 CLP',body:'Hipótesis inicial para probar con una oferta real.',status:'open',stage:'model',refs:['a-pay']},
    {id:'c-segment',kind:'canvas',title:'Segmentos de clientes',canvasKey:'segments',body:'Cafeterías independientes con una sucursal que aceptan pedidos por mensajería.',status:'open',stage:'problem',refs:['d-first']},
    {id:'c-rev',kind:'canvas',title:'Ingresos',canvasKey:'revenue',body:'Suscripción propuesta de {{precio_mensual}} por local.',status:'open',stage:'model',refs:['v-price','a-pay']},
  ].map((r) => ({...r, updatedAt:'2026-11-13T15:00:00.000Z'}));
  return {id:'demo',title:'Café de Barrio',idea:'Una bandeja para que cafeterías independientes gestionen sus pedidos de WhatsApp e Instagram sin perder conversaciones en horas punta.', question:'¿El desorden de pedidos es un problema lo bastante frecuente como para pagar por resolverlo?',stage:'problem',step:'t-first',updatedAt:'2026-11-13T15:00:00.000Z',records,pending:[
    {id:'p-demo',summary:'Preparar la siguiente ronda de entrevistas',source:'Conversación de ejemplo',createdAt:'2026-11-13T15:00:00.000Z',changes:[{record:{id:'x-first',kind:'experiment',title:'Reconstruir el último turno',body:'Éxito preliminar si al menos 2 de 3 dueños recuerdan un pedido retrasado o perdido durante los últimos siete días.',stage:'validation',status:'open',refs:['a-problem','t-first']}}]}
  ],history:[{id:'h-demo',title:'Primer foco definido',detail:'Se acotó el proyecto a cafeterías independientes.',at:'2026-11-13T15:00:00.000Z'}],keys:[]};
}

function newProject(data) {
  const title = clean(data.title, 100);
  if (!title) throw fail('Escribe un nombre para el proyecto.');
  return {id:validId(data.id) && data.id !== 'demo' ? data.id : crypto.randomUUID(),title,
    idea:clean(data.idea, 3000),question:clean(data.question, 350),stage:'idea',step:'',
    updatedAt:new Date().toISOString(),records:[],pending:[],history:[],keys:[]};
}

function normalizeFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('Proyecto inválido.');
  const fields = {};
  for (const [key, length] of [['title',100],['idea',3000],['question',350]]) {
    if (Object.hasOwn(raw,key)) fields[key] = clean(raw[key],length);
  }
  if (fields.title === '') throw fail('El proyecto necesita un nombre.');
  if (Object.hasOwn(raw,'stage')) {
    if (!stages.some(([id]) => id === raw.stage)) throw fail('Etapa inválida.');
    fields.stage=raw.stage;
  }
  if (Object.hasOwn(raw,'step')) {
    if (raw.step !== '' && !validId(raw.step)) throw fail('Siguiente paso inválido.');
    fields.step=raw.step;
  }
  if (!Object.keys(fields).length) throw fail('No hay campos para actualizar.');
  return fields;
}

function normalizeRecord(data) {
  if (!data || !kinds.includes(data.kind)) throw fail('Tipo de registro inválido.');
  if (data.id != null && !validId(data.id)) throw fail('Identificador de registro inválido.');
  const title = clean(data.title,160);
  if (!title) throw fail('Cada registro necesita un título.');
  const record = {
    id:data.id ?? crypto.randomUUID(),kind:data.kind,title,body:clean(data.body,40000),status:statuses.includes(data.status)?data.status:'open',
    stage:stages.some(([id])=>id===data.stage)?data.stage:'idea',refs:Array.isArray(data.refs)?[...new Set(data.refs.filter(validId))].slice(0,24):[],
  };
  if (data.url && !(record.url=safeUrl(data.url))) throw fail('La fuente necesita un enlace HTTP o HTTPS válido.');
  if (record.kind==='variable') {
    record.key=clean(data.key,48).toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,47}$/.test(record.key)) throw fail('Usa una clave como precio_mensual.');
    record.value=clean(data.value,150);
    if (!record.value) throw fail('Escribe un valor para la variable.');
  }
  if (record.kind==='canvas') {
    if (!canvasKeys.includes(data.canvasKey)) throw fail('Bloque de Canvas inválido.');
    record.canvasKey=data.canvasKey;
  }
  return record;
}

function apply(project, actions, at) {
  for (const action of actions) {
    if (action.project) Object.assign(project,action.project);
    if (!action.record) continue;
    const record={...action.record,updatedAt:at};
    const existing=project.records.find((old)=>old.id===record.id);
    if (existing && existing.kind!==record.kind) throw fail('El tipo del registro existente es distinto.');
    if (record.kind==='variable' && project.records.some((r)=>r.kind==='variable' && r.id!==record.id && r.key===record.key)) {
      throw fail('Ya existe una variable con esa clave.');
    }
    if (record.kind==='canvas' && project.records.some((r)=>r.kind==='canvas' && r.id!==record.id && r.canvasKey===record.canvasKey)) {
      throw fail('Ya existe ese bloque. Actualiza el registro usando su identificador.');
    }
    if (existing?.kind==='variable' && existing.key!==record.key) {
      for (const other of project.records) {
        other.body=other.body.replaceAll('{{'+existing.key+'}}','{{'+record.key+'}}');
      }
      record.body=record.body.replaceAll('{{'+existing.key+'}}','{{'+record.key+'}}');
    }
    project.records=project.records.filter((r)=>r.id!==record.id);
    project.records.unshift(record);
  }
  if (project.records.length>500) throw fail('El proyecto alcanzó el límite de 500 registros.');
  const ids=new Set(project.records.map((r)=>r.id));
  for (const action of actions) {
    if (action.record?.refs.some((id)=>!ids.has(id)||id===action.record.id)) throw fail('La propuesta vincula un registro que no existe o al mismo registro.');
  }
  if (project.step && !project.records.some((record)=>record.id===project.step && record.kind==='task')) throw fail('El siguiente paso debe ser una tarea del proyecto.');
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 20) throw fail('Envía entre 1 y 20 cambios.');
  return changes.map((item)=>{
    if (!item || Boolean(item.project)===Boolean(item.record)) throw fail('Cada cambio debe tener project o record.');
    return item.project ? {project:normalizeFields(item.project)} : {record:normalizeRecord(item.record)};
  });
}

function mutate(document, operation, key) {
  const p=structuredClone(document);
  const at=new Date().toISOString();
  const {type}=operation;
  let title;
  let detail='';
  if (type==='project') {
    apply(p,[{project:normalizeFields(operation.fields)}],at);
    title='Proyecto actualizado';
  } else if (type==='record') {
    const record=normalizeRecord(operation.record);
    const actions=[{record}];
    if (typeof operation.step==='string') actions.push({project:normalizeFields({step:operation.step})});
    apply(p,actions,at);
    title=record.title;
    detail='Registro guardado';
  } else if (type==='remove') {
    const record=p.records.find((r)=>r.id===operation.id);
    if (!record) throw fail('Registro no encontrado.',404);
    if (record.kind==='variable' && p.records.some((r)=>r.id!==record.id && r.body.includes('{{'+record.key+'}}'))) throw fail('Quita las referencias a esta variable antes de borrarla.');
    p.records=p.records.filter((r)=>r.id!==record.id);
    p.records.forEach((r)=>{r.refs=r.refs.filter((id)=>id!==record.id);});
    if (p.step===record.id) p.step='';
    title=record.title;
    detail='Registro eliminado';
  } else if (type==='propose') {
    const summary=clean(operation.summary,200);
    if (!summary) throw fail('La propuesta necesita un resumen.');
    if (p.pending.length>=40) throw fail('Revisa propuestas pendientes antes de agregar otras.');
    const changes=normalizeChanges(operation.changes);
    apply(structuredClone(p),changes,at);
    const baseline={records:Object.create(null),project:{}};
    for (const item of changes) {
      if (item.record) baseline.records[item.record.id]=p.records.find((r)=>r.id===item.record.id)?.updatedAt??null;
      if (item.project) for (const field of Object.keys(item.project)) baseline.project[field]=p[field];
    }
    p.pending.unshift({id:key,summary,source:clean(operation.source,120)||'ChatGPT',changes,baseline,createdAt:at});
    title=summary;
    detail='Propuesta recibida';
  } else if (type==='accept' || type==='reject') {
    const proposal=p.pending.find((item)=>item.id===operation.id);
    if (!proposal) throw fail('La propuesta ya fue revisada o no existe.',404);
    if (type==='accept') {
      const baseline=proposal.baseline;
      const recordsChanged=Object.entries(baseline?.records??{}).some(([id,updatedAt])=>(p.records.find((r)=>r.id===id)?.updatedAt??null)!==updatedAt);
      const projectChanged=Object.entries(baseline?.project??{}).some(([field,value])=>p[field]!==value);
      if (recordsChanged||projectChanged) throw fail('Uno de los registros de esta propuesta cambió. Pide a la guía una propuesta actualizada.',409);
      apply(p,proposal.changes,at);
    }
    p.pending=p.pending.filter((item)=>item.id!==proposal.id);
    title=proposal.summary;
    detail=type==='accept'?'Propuesta aplicada':'Propuesta descartada';
  } else {
    throw fail('Acción desconocida.');
  }
  p.updatedAt=at;
  p.history=[{id:key,title,detail,at},...p.history].slice(0,100);
  p.keys=[key,...p.keys].slice(0,160);
  if (new TextEncoder().encode(JSON.stringify(p)).length>1_500_000) throw fail('El proyecto alcanzó su capacidad de almacenamiento.');
  return p;
}

function projectSummary(p) {
  return {id:p.id,title:p.title,idea:p.idea,stage:p.stage,updatedAt:p.updatedAt};
}

export {stages,kinds,statuses,canvasKeys,sample,newProject,projectSummary,mutate,fail,validId};
