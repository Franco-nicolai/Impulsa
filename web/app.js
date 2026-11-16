const stages=[
  ['idea','Idea','¿Qué observaste que te hizo pensar que aquí hay una oportunidad?','Escribe a quién afecta, qué intenta hacer y cuándo aparece la dificultad.'],
  ['problem','Problema','¿A quién le pasa esto y cómo lo resuelve hoy?','Usa ejemplos de comportamiento reciente. Pide que reconstruyan una situación concreta.'],
  ['validation','Validación','¿Qué tendría que pasar para cambiar de opinión?','Elige el supuesto de mayor riesgo y fija una señal de éxito antes de probarlo.'],
  ['model','Modelo','¿Cómo se crea, entrega y captura valor?','Trabaja el Canvas, haz explícitos el precio y los costes y enlázalos a su evidencia.'],
  ['mvp','MVP','¿Qué versión mínima prueba el supuesto decisivo?','Recorta el alcance a una experiencia observable con un cliente real.'],
  ['launch','Lanzamiento','¿Qué señal te permite decidir si ampliar, ajustar o detenerte?','Define un canal inicial, una métrica y un momento para revisar los resultados.'],
];
const labels={
  assumption:['Supuesto','Supuestos','◈'], interview:['Entrevista','Entrevistas','◉'], source:['Fuente','Fuentes','↗'],
  decision:['Decisión','Decisiones','✓'],experiment:['Experimento','Experimentos','⚑'],document:['Documento','Documentos','▤'],
  pestel:['PESTEL','PESTEL','◫'],task:['Tarea','Tareas','☷'],variable:['Variable','Variables','ƒ'],canvas:['Canvas','Canvas','◫'],
};
const canvas=[
  ['problem','Problema'],['segments','Segmentos de clientes'],['value','Propuesta de valor'],['solution','Solución'],
  ['channels','Canales'],['revenue','Ingresos'],['costs','Estructura de costes'],['metrics','Métricas clave'],['advantage','Ventaja diferencial'],
];
const statuses={open:'Abierto',validating:'En prueba',supported:'Respaldado',rejected:'Refutado',done:'Cerrado'};
const validViews=new Set(['inicio','bitacora','modelo','guia']);
const main=document.querySelector('#main');
const dialog=document.querySelector('#editor');
const dialogContent=document.querySelector('#dialog-content');
const projectSelect=document.querySelector('#projects');
const dateFormat=new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Santiago'});
let state={view:'inicio',projects:[],project:null,filter:'all',query:'',integration:'sites',login:null};
let toastTimeout;
let refreshCount=0;
const activation=new URLSearchParams(location.hash.slice(1)).get('acceso');
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const action=(name,label,classes='secondary',args='')=>'<button type="button" class="button '+classes+'" data-action="'+name+'" '+args+'>'+label+'</button>';
const ghost=(name,label,args='')=>'<button type="button" class="ghost" data-action="'+name+'" '+args+'>'+label+'</button>';
const named=(name)=>'data-id="'+esc(name)+'"';
const option=(id,title,chosen)=>'<option value="'+esc(id)+'"'+(id===chosen?' selected':'')+'>'+esc(title)+'</option>';
const recordById=(id)=>state.project?.records.find((record)=>record.id===id);
const getView=()=>validViews.has(location.hash.slice(1))?location.hash.slice(1):'inicio';
const date=(at)=>at?dateFormat.format(new Date(at)):'';

function notify(message) {
  const notice=document.querySelector('#toast');
  notice.textContent=message;
  notice.hidden=false;
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{notice.hidden=true;},3600);
}
async function api(path,body) {
  const response=await fetch(path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  if (response.status===304) return null;
  const data=await response.json().catch(()=>null);
  if (!response.ok||!data) throw Object.assign(new Error(data?.error??'No se pudo abrir el espacio. Reintenta.'),{status:response.status,loginMode:data?.loginMode});
  return data;
}
function remember(id) {
  try {localStorage.setItem('impulso-project',id);} catch {}
}
function remembered() {
  try {return localStorage.getItem('impulso-project');} catch {return null;}
}
function showLogin(mode) {
  state.login=mode;
  const content=mode==='code'
    ? '<form id="login-form"><label>'+(activation?'Elige una contraseña de al menos 14 caracteres':'Contraseña')+'<input name="code" type="password" maxlength="256" autocomplete="'+(activation?'new-password':'current-password')+'" '+(activation?'minlength="14"':'')+' required></label><p class="form-error" role="alert" hidden></p><div class="button-row"><button class="button primary">'+(activation?'Activar mi espacio':'Entrar')+'</button></div></form>'
    : '<div class="button-row"><a class="button primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">Entrar con ChatGPT</a></div>';
  main.innerHTML='<section class="login"><h1>Abre tu espacio de trabajo</h1><p>Inicia sesión para ver tus proyectos en Impulso.</p>'+content+'</section>';
}
async function load() {
  try {
    const data=await api('/api/projects');
    state.projects=data.projects;
    state.integration=data.integration;
    state.login=null;
    const last=remembered();
    await selectProject(state.projects.find((item)=>item.id===last)?.id??state.projects[0].id);
  } catch (error) {
    if (error.status===401) showLogin(error.loginMode);
    else main.innerHTML='<section class="login"><h1>No pudimos abrir tu espacio</h1><p>'+esc(error.message)+'</p><div class="button-row">'+action('retry','Reintentar','primary')+'</div></section>';
  }
}
async function selectProject(id) {
  const request=++refreshCount;
  const {project}=await api('/api/projects/'+encodeURIComponent(id));
  if (request!==refreshCount) return;
  state.project=project;
  state.filter='all';
  state.query='';
  remember(id);
  render();
}
async function refresh() {
  if (!state.project||dialog.open||document.hidden||state.view==='bitacora'&&document.activeElement?.id==='search') return;
  const project=state.project;
  const request=refreshCount;
  try {
    const data=await api('/api/projects/'+encodeURIComponent(project.id)+'?revision='+encodeURIComponent(String(project.revision)));
    if (data&&request===refreshCount&&state.project===project&&!dialog.open) {
      saveState(data.project);
      notify('Proyecto actualizado.');
    }
  } catch {}
}
function saveState(project) {
  state.project=project;
  state.projects=state.projects.map((item)=>item.id===project.id?{...item,title:project.title,stage:project.stage,updatedAt:project.updatedAt}:item);
  render();
}
async function change(operation) {
  const project=state.project;
  const result=await api('/api/projects/'+encodeURIComponent(project.id),{key:crypto.randomUUID(),revision:project.revision,...operation});
  if (state.project?.id===project.id) saveState(result.project);
  return result.project;
}
function resolveVars(body) {
  const variables=new Map(state.project.records.filter((r)=>r.kind==='variable').map((r)=>[r.key,r.value]));
  return String(body??'').replace(/\{\{([a-z0-9_]+)\}\}/g,(text,key)=>variables.get(key)??text);
}

function head(kicker,title,description,extra='') {
  return '<header class="page-head"><div>'+ (kicker?'<span class="eyebrow">'+esc(kicker)+'</span>':'')+'<h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+extra+'</header>';
}
function projectHome() {
  const p=state.project;
  const stage=stages.find(([key])=>key===p.stage)??stages[0];
  const idx=stages.indexOf(stage);
  const pinned=recordById(p.step);
  const next=pinned?.status==='done'?p.records.find((r)=>r.kind==='task'&&r.status!=='done')??pinned:pinned??p.records.find((r)=>r.kind==='task'&&r.status!=='done');
  const connected=p.records.filter((r)=>r.kind==='assumption'&&['open','validating'].includes(r.status));
  const quick=[
    ['assumption','Registrar supuesto','Lo que aún debes probar'],
    ['interview','Registrar entrevista','Evidencia de primera mano'],
    ['decision','Registrar decisión','Qué elegiste y por qué'],
  ];
  const proposals=p.pending.length
    ? p.pending.slice(0,3).map((item)=>'<button type="button" data-action="proposal" '+named(item.id)+' class="proposal-brief"><span><strong>'+esc(item.summary)+'</strong><small>'+item.changes.length+' '+(item.changes.length===1?'cambio':'cambios')+' · '+esc(item.source)+'</small></span><span class="arrow" aria-hidden="true">→</span></button>').join('')
    : '<p class="panel-copy">Las propuestas de la guía llegarán aquí para que las revises.</p>';
  return head(p.id==='demo'?'Proyecto de ejemplo':stage[1],p.title,p.idea||'Describe la idea para empezar a cuestionarla.',ghost('edit-project','✎ Editar proyecto'))+
    '<section class="hero" aria-labelledby="focus-title"><div class="hero-copy"><div class="section-label">Pregunta actual</div><h2 id="focus-title">'+esc(p.question||stage[2])+'</h2><p>'+esc(stage[3])+'</p><button type="button" class="button light" data-view="guia"><span aria-hidden="true">✧</span> Conversar con la guía <span aria-hidden="true">↗</span></button></div><div class="hero-art" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></section>'+
    '<div class="road" aria-label="Etapas del proyecto">'+stages.map(([id,title],index)=>'<button type="button" data-action="stage" '+named(id)+' class="stage '+(index===idx?'active':index<idx?'past':'')+'" '+(index===idx?'aria-current="step"':'')+'><span class="stage-dot">'+(index+1)+'</span>'+title+'</button>').join('')+'</div>'+
    '<div class="grid"><section class="panel"><div class="panel-head"><h2>Siguiente paso</h2>'+ghost('new-record','＋ Tarea',named('task'))+'</div>'+
    (next?'<span class="next-tag">'+(next.status==='done'?'✓ Cerrado':'→ '+esc(statuses[next.status]))+'</span><h3 class="step-title">'+esc(next.title)+'</h3><p class="panel-copy">'+esc(resolveVars(next.body))+'</p><div class="button-row">'+action('edit-record','Abrir tarea','secondary',named(next.id))+(next.status!=='done'?ghost('complete','Marcar hecho',named(next.id)):'')+'</div>'
    :'<p class="panel-copy">Agrega una tarea o pídele a la guía que proponga qué comprobar primero.</p>')+
    '</section><section class="panel"><div class="panel-head"><h2>Por revisar</h2><span class="counter">'+p.pending.length+'</span></div>'+proposals+
    (p.pending.length>3?'<div class="button-row"><button type="button" class="ghost" data-view="bitacora">Ver todas →</button></div>':'')+'</section></div>'+
    '<section class="section"><div class="subhead"><h2>Registro rápido</h2></div><div class="quick-grid">'+quick.map(([id,title,copy])=>'<button type="button" class="quick" data-action="new-record" '+named(id)+'><span class="q-icon" aria-hidden="true">'+labels[id][2]+'</span><span><strong>'+title+'</strong><small>'+copy+'</small></span><span class="arrow" aria-hidden="true">＋</span></button>').join('')+'</div></section>'+
    (connected.length?'<section class="section panel"><div class="panel-head"><h2>Supuestos por comprobar</h2><button type="button" class="ghost" data-action="show-assumptions">Ver en la bitácora →</button></div>'+connected.slice(0,3).map(row).join('')+'</section>':'');
}

function row(r) {
  const kind=labels[r.kind];
  return '<button type="button" class="list-row" data-action="edit-record" '+named(r.id)+'><span class="q-icon" aria-hidden="true">'+kind[2]+'</span><span><strong>'+esc(r.title)+'</strong><small>'+kind[0]+' · '+esc(statuses[r.status])+(r.refs.length?' · '+r.refs.length+' '+(r.refs.length===1?'vínculo':'vínculos'):'')+'</small></span><span class="arrow" aria-hidden="true">→</span></button>';
}
function recordList() {
  const q=state.query.trim().toLowerCase();
  const records=state.project.records.filter((r)=>(state.filter==='all'||r.kind===state.filter)&&
    (!q||[r.title,resolveVars(r.body),r.key,r.value].some((part)=>String(part??'').toLowerCase().includes(q))));
  return records.length?records.map(row).join(''):'<p class="empty">No hay registros que coincidan.</p>';
}
function proposalsList() {
  return state.project.pending.map((item)=>'<button type="button" class="list-row" data-action="proposal" '+named(item.id)+'><span class="q-icon" aria-hidden="true">✧</span><span><strong>'+esc(item.summary)+'</strong><small>'+item.changes.length+' cambios · '+esc(item.source)+'</small></span><span class="arrow" aria-hidden="true">→</span></button>').join('');
}
function journal() {
  const p=state.project;
  const filters=[['all','Todo'],...Object.entries(labels).map(([key,label])=>[key,label[1]])];
  return head('','Bitácora','Conecta supuestos, evidencia y decisiones para volver a lo que te hizo avanzar.',action('new-record','＋ Registro','primary'))+
  (p.pending.length?'<section class="panel"><div class="panel-head"><h2>Propuestas por revisar</h2><span class="counter">'+p.pending.length+'</span></div>'+proposalsList()+'</section>':'')+
  '<div class="toolbar"><label class="search"><input type="search" id="search" value="'+esc(state.query)+'" aria-label="Buscar registros" placeholder="Buscar por título, contenido o variable"></label>'+action('import','Importar propuesta')+'</div>'+
  '<div class="filters" aria-label="Tipos de registro">'+filters.map(([id,label])=>'<button type="button" class="filter" data-action="filter" '+named(id)+' aria-pressed="'+String(state.filter===id)+'">'+label+'</button>').join('')+'</div>'+
  '<section class="panel" id="record-list" aria-label="Registros">'+recordList()+'</section>'+
  (p.history.length?'<section class="section panel"><div class="panel-head"><h2>Actividad</h2></div>'+p.history.slice(0,20).map((item)=>'<div class="list-row"><span class="q-icon" aria-hidden="true">·</span><span><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail||'Proyecto')+' · '+esc(date(item.at))+'</small></span></div>').join('')+'</section>':'');
}
function model() {
  const blocks=state.project.records.filter((r)=>r.kind==='canvas');
  const vars=state.project.records.filter((r)=>r.kind==='variable');
  return head('','Modelo Canvas','Define cómo funciona el negocio. Cada bloque puede enlazar evidencia y usar valores del proyecto.',action('new-record','＋ Variable','primary',named('variable')))+
  '<section class="block-grid" aria-label="Bloques del Lean Canvas">'+canvas.map(([id,title])=>{
    const record=blocks.find((r)=>r.canvasKey===id);
    return '<button type="button" class="block" data-action="canvas" '+named(id)+'><strong>'+title+'</strong><span>'+esc(record?resolveVars(record.body):'Completar bloque')+'</span><span class="arrow" aria-hidden="true">'+(record?'↗':'＋')+'</span></button>';
  }).join('')+'</section><section class="panel section"><div class="panel-head"><h2>Variables del modelo</h2></div><p class="panel-copy">Inserta una variable con {{clave}} en el Canvas o en cualquier registro. Al actualizar su valor, el texto vinculado se actualiza al instante.</p>'+
  (vars.length?vars.map((v)=>'<button type="button" class="list-row" data-action="edit-record" '+named(v.id)+'><span class="q-icon" aria-hidden="true">ƒ</span><span><strong>'+esc(v.title)+' · '+esc(v.value)+'</strong><small>{{'+esc(v.key)+'}}</small></span><span class="arrow" aria-hidden="true">→</span></button>').join(''):'<p class="empty">Todavía no hay variables.</p>')+'</section>';
}
function prompt() {
  const p=state.project;
  const snapshot={id:p.id,title:p.title,idea:p.idea,question:p.question,stage:p.stage,step:p.step,records:p.records.slice(0,18).map(({id,kind,title,status,refs,body})=>({id,kind,title,status,refs,body:body.slice(0,240)}))};
  const toolLine=state.integration==='sites'
    ? 'Si tienes conectada la app Impulso, usa listar_proyectos y leer_proyecto antes de proponer cambios. Cuando cerremos una conversación o te diga «registra esto», usa proponer_cambios para enviarlos a revisión.'
    : 'Si tienes disponible la acción de Impulso, usa listar_proyectos y leer_proyecto al comenzar. Usa proponer_cambios cuando cerremos una conversación o te diga «registra esto».';
  return 'Actúa como mi contraparte de emprendimiento. Conversa conmigo en español y ayúdame a depurar la idea.\n\n'+
    '1. Primero pide que te cuente la idea en mis palabras, el problema observado y quién lo vive. No hagas investigación amplia ni completes herramientas antes de entender el contexto.\n'+
    '2. Formula una objeción concreta o una sola pregunta de alto impacto por turno. Separa hechos, supuestos y lo que todavía no sabemos.\n'+
    '3. Cuando convenga investigar, acuerda qué pregunta resolverá la búsqueda. Cita la fuente, fecha y enlace. Diseña entrevistas centradas en conductas pasadas y experimentos con un criterio medible.\n'+
    '4. Tras una conversación relevante, propón una decisión, el supuesto más riesgoso y un siguiente paso con criterio de éxito. Registra evidencia con su fuente. Nunca documentes una decisión como tomada si sigue abierta.\n\n'+toolLine+
    '\nSi no tienes la acción, entrega solo un bloque JSON fácil de importar después del resumen. Formato: {"summary":"...","source":"ChatGPT","changes":[{"record":{"id":"id-unico","kind":"assumption","title":"...","body":"...","stage":"idea","status":"open","refs":[]}}]}. También puedes usar {"project":{"question":"...","step":"id-de-tarea","stage":"problem"}} dentro de changes. Usa refs con IDs existentes o incluidos en la misma propuesta. Tipos: assumption, interview, source, decision, experiment, document, pestel, task, variable, canvas. Las variables tienen key y value. El canvas usa canvasKey con problem, segments, value, solution, channels, revenue, costs, metrics o advantage. Las etapas son idea, problem, validation, model, mvp y launch.\n\n'+
    'Proyecto actual (los datos del proyecto de ejemplo son ficticios):\n'+JSON.stringify(snapshot,null,2);
}
function guide() {
  const sites=state.integration==='sites';
  return head('','Guía en ChatGPT','Conversa sobre la idea y deja las decisiones, la evidencia y el próximo paso en Impulso.')+
  '<div class="guide-grid"><section class="panel"><div class="panel-head"><h2>Iniciar la conversación</h2></div><p class="panel-copy">La guía comienza con tu idea, cuestiona los supuestos y busca evidencia cuando existe una pregunta concreta.</p><div class="button-row">'+action('copy','Copiar prompt y contexto','primary')+
  '<a class="button secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Abrir ChatGPT ↗</a></div><pre class="prompt" id="guide-prompt">'+esc(prompt())+'</pre></section>'+
  '<section class="panel"><div class="panel-head"><h2>Enviar cambios a revisión</h2></div><ol class="steps"><li>'+ (sites?'En ChatGPT, conecta la app privada Impulso en una conversación.':'Para envíos directos, configura una acción en un GPT privado con el esquema y la clave de la guía.') +'</li><li>Pega el prompt. Cuando quieras registrar el resultado, di «Registra esto en Impulso».</li><li>Revisa y aplica la propuesta en Inicio o Bitácora.</li></ol>'+
  (!sites?'<div class="button-row"><a class="button secondary" href="/openapi.json" target="_blank" rel="noopener">Esquema de la acción ↗</a>'+action('copy-key','Copiar clave de la guía')+'</div><p class="archive-note">En el editor del GPT, elige Acción nueva, importa el esquema y configura Clave de API → Bearer.</p>':'')+
  '<p class="panel-copy">También puedes pegar el JSON que genere la guía.</p><div class="button-row">'+action('import','Importar propuesta')+'</div></section></div>';
}

function render() {
  if (!state.project) return;
  const p=state.project;
  document.querySelector('#top-title').textContent=p.title;
  document.querySelector('#initial').textContent=p.title.slice(0,1).toUpperCase();
  projectSelect.innerHTML=state.projects.map((item)=>option(item.id,item.title,item.id===p.id)).join('');
  document.querySelectorAll('#navigation [data-view]').forEach((button)=>{
    if (button.dataset.view===state.view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  const count=document.querySelector('#nav-count');
  count.hidden=!p.pending.length;
  count.textContent=p.pending.length;
  main.innerHTML=({inicio:projectHome,bitacora:journal,modelo:model,guia:guide}[state.view])();
}
function navigate(view) {
  if (location.hash!=='#'+view) history.pushState(null,'','#'+view);
  state.view=view;
  render();
  window.scrollTo(0,0);
  main.focus({preventScroll:true});
}
function modal(title,body) {
  dialogContent.innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+esc(title)+'</h2><button type="button" class="close" data-action="close" aria-label="Cerrar">×</button></div><div class="dialog-body">'+body+'</div>';
  if (!dialog.open) dialog.showModal();
}
const formButtons=(label,extra='')=>'<p class="form-error" role="alert" hidden></p><div class="button-row"><button class="button primary" type="submit">'+label+'</button>'+extra+'</div>';
function projectEditor(create=false) {
  const p=create?{}:state.project;
  modal(create?'Nuevo proyecto':'Editar proyecto','<form data-form="'+(create?'create':'project')+'"><label>Nombre<input name="title" required maxlength="100" value="'+esc(p.title)+'" placeholder="Nombre del proyecto"></label><label>Idea<textarea name="idea" maxlength="3000" placeholder="¿Qué observaste y a quién le afecta?">'+esc(p.idea)+'</textarea></label><label>Pregunta actual<input name="question" maxlength="350" value="'+esc(p.question)+'" placeholder="¿Qué quieres averiguar primero?"></label>'+
  (create?'':'<div class="fields-row"><label>Etapa<select name="stage" class="field">'+stages.map(([id,title])=>option(id,title,p.stage)).join('')+'</select></label><label>Siguiente paso<select name="step" class="field">'+option('','Elegir automáticamente',p.step)+p.records.filter((r)=>r.kind==='task').map((r)=>option(r.id,r.title,p.step)).join('')+'</select></label></div>')+formButtons(create?'Crear proyecto':'Guardar proyecto')+'</form>');
}
const templates={
  interview:'Persona o rol:\nContexto y conducta observada:\nCita o evidencia:\nQué falta comprobar:',
  experiment:'Supuesto que prueba:\nMétodo:\nCriterio de éxito:\nResultado y aprendizaje:',
  pestel:'Político:\nEconómico:\nSocial:\nTecnológico:\nEcológico:\nLegal:\nConsecuencias para el proyecto:',
  decision:'Decisión:\nEvidencia que la sustenta:\nAlternativas consideradas:\nCuándo reconsiderarla:',
};
function recordEditor(record={},kind='') {
  const p=state.project;
  const selected=record.kind||kind||'assumption';
  const defaults=record.body??templates[selected]??'';
  const other=p.records.filter((r)=>r.id!==record.id);
  const incoming=other.filter((r)=>r.refs.includes(record.id));
  const linked=other.filter((r)=>record.refs?.includes(r.id));
  const variable=selected==='variable'?'<div class="fields-row"><label>Clave<input name="key" required pattern="[a-z][a-z0-9_]{0,47}" maxlength="48" value="'+esc(record.key)+'" placeholder="precio_mensual"></label><label>Valor<input name="value" required maxlength="150" value="'+esc(record.value)+'" placeholder="$19.990 CLP"></label></div>':'';
  const canvasOptions=selected==='canvas'?'<label>Bloque<select name="canvasKey" class="field">'+canvas.map(([id,title])=>option(id,title,record.canvasKey)).join('')+'</select></label>':'';
  const evidence=['interview','source','document','pestel','experiment'].includes(selected);
  const source=evidence?'<label>Enlace a la fuente<input name="url" type="url" value="'+esc(record.url)+'" placeholder="https://..."></label>':'';
  const attachments=selected==='interview'||selected==='document'?'<label>Importar texto<input type="file" id="text-file" accept=".txt,.md,text/plain,text/markdown"></label>':'';
  const refList=other.length?'<details '+(linked.length?'open':'')+'><summary>Vincular registros'+(linked.length?' · '+linked.length:'')+'</summary><fieldset><legend>Supuestos, fuentes, tareas y otros registros</legend><div class="ref-list">'+other.map((r)=>'<label class="tick"><input type="checkbox" name="refs" value="'+esc(r.id)+'" '+(record.refs?.includes(r.id)?'checked':'')+'>'+esc(labels[r.kind][0]+' · '+r.title)+'</label>').join('')+'</div></fieldset></details>':'';
  const backlinks=incoming.length?'<div class="panel-copy">Vinculado desde '+incoming.map((r)=>ghost('edit-record',esc(r.title),named(r.id))).join('')+'</div>':'';
  const valueHelp=selected==='canvas'&&p.records.some((r)=>r.kind==='variable')?'<p class="archive-note">Variables disponibles: '+p.records.filter((r)=>r.kind==='variable').map((r)=>'{{'+esc(r.key)+'}}').join(', ')+'</p>':'';
  const extra=(selected==='task'?'<label class="tick"><input type="checkbox" name="next" '+(p.step===record.id&&record.id?'checked':'')+'> Fijar como siguiente paso</label>':'')+refList+backlinks+valueHelp;
  const controls=record.id?action('remove','Eliminar','secondary danger',named(record.id)):'';
  modal(record.id?'Editar '+labels[selected][0].toLowerCase():'Nuevo registro',
    '<form data-form="record" '+named(record.id??'')+'><label>Tipo<select name="kind" class="field" '+(record.id?'disabled':'')+'>'+Object.entries(labels).map(([id,label])=>option(id,label[0],selected)).join('')+'</select></label>'+canvasOptions+
    '<label>Título<input name="title" maxlength="160" required value="'+esc(record.title)+'"></label>'+variable+'<label>'+ (selected==='interview'?'Hallazgos o transcripción':'Contenido') +'<textarea name="body" maxlength="40000">'+esc(defaults)+'</textarea></label>'+source+attachments+
    '<div class="fields-row"><label>Etapa<select name="stage" class="field">'+stages.map(([id,title])=>option(id,title,record.stage??p.stage)).join('')+'</select></label><label>Estado<select name="status" class="field">'+Object.entries(statuses).map(([id,title])=>option(id,title,record.status??'open')).join('')+'</select></label></div>'+extra+formButtons('Guardar registro',controls)+'</form>');
}
function showProposal(id) {
  const item=state.project.pending.find((proposal)=>proposal.id===id);
  if (!item) return;
  modal('Revisar propuesta','<h3>'+esc(item.summary)+'</h3><p class="panel-copy">'+esc(item.source)+' · '+esc(date(item.createdAt))+'</p>'+
  item.changes.map((change)=>{
    if (change.record) {
      const r=change.record;
      const previous=recordById(r.id);
      return '<article class="proposal-item"><h3>'+esc(labels[r.kind][0]+' · '+r.title)+'</h3><p>'+esc(r.body||r.value||'')+'</p>'+
      (r.url?'<p><a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">Abrir fuente ↗</a></p>':'')+
      (previous?'<details><summary>Ver versión actual</summary><p>'+esc(previous.title+'\n'+previous.body)+'</p></details>':'')+'</article>';
    }
    return '<article class="proposal-item"><h3>Actualizar proyecto</h3>'+Object.entries(change.project).map(([field,value])=>'<p><strong>'+esc(({title:'Nombre',idea:'Idea',question:'Pregunta',stage:'Etapa',step:'Siguiente paso'})[field])+':</strong> '+esc(field==='stage'?stages.find(([key])=>key===value)?.[1]:field==='step'?recordById(value)?.title??value:value)+'</p>').join('')+'</article>';
  }).join('')+'<p class="form-error" role="alert" hidden></p><div class="button-row">'+action('accept','Aplicar cambios','primary',named(id))+action('reject','Descartar','secondary',named(id))+'</div>');
}
function stageEditor(id) {
  const stage=stages.find(([key])=>key===id);
  if (!stage) return;
  const records=state.project.records.filter((r)=>r.stage===id);
  modal(stage[1],'<p><strong>'+stage[2]+'</strong></p><p class="panel-copy">'+stage[3]+'</p>'+(records.length?'<details><summary>Ver registros de esta etapa</summary>'+records.map(row).join('')+'</details>':'')+
  '<p class="form-error" role="alert" hidden></p><div class="button-row">'+(state.project.stage===id?'':action('set-stage','Marcar como etapa actual','primary',named(id)))+action('close','Cerrar')+'</div>');
}

function importDialog() {
  modal('Importar propuesta','<p class="panel-copy">Pega el bloque JSON que recibiste en ChatGPT. Los cambios quedarán en la bandeja antes de aplicarlos.</p><form data-form="import"><label>Propuesta JSON<textarea name="payload" required spellcheck="false" placeholder=\'{"summary":"...","changes":[...]}\'></textarea></label>'+formButtons('Enviar a revisión')+'</form>');
}

function reportError(scope,error) {
  const target=scope.querySelector('.form-error');
  if (target) {target.textContent=error.message;target.hidden=false;}
  else notify(error.message);
}

document.addEventListener('click',async(event)=>{
  const button=event.target.closest('[data-action],[data-view]');
  if (!button) return;
  const {action:act,view,id}=button.dataset;
  if (view) {if (state.project) navigate(view);return;}
  if (act==='retry') {await load();return;}
  if (act==='close') {dialog.close();return;}
  if (!state.project) return;
  if (act==='new-project'||act==='edit-project') {projectEditor(act==='new-project');return;}
  if (act==='new-record'||act==='edit-record') {recordEditor(act==='edit-record'?recordById(id):{},act==='new-record'?id:undefined);return;}
  if (act==='canvas') {
    const record=state.project.records.find((r)=>r.kind==='canvas'&&r.canvasKey===id);
    recordEditor(record??{canvasKey:id,title:canvas.find(([key])=>key===id)[1]},'canvas');
    return;
  }
  if (act==='proposal') {showProposal(id);return;}
  if (act==='stage') {stageEditor(id);return;}
  if (act==='import') {importDialog();return;}
  if (act==='filter') {state.filter=id;render();return;}
  if (act==='show-assumptions') {state.filter='assumption';navigate('bitacora');return;}
  if (act==='copy-key') {
    try {
      const {key}=await api('/api/action-key');
      await navigator.clipboard.writeText(key);
      notify('Clave de la guía copiada.');
    } catch (error) {notify(error.message);}
    return;
  }
  if (act==='copy') {
    try {await navigator.clipboard.writeText(prompt());notify('Prompt y contexto copiados.');}
    catch {const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(document.querySelector('#guide-prompt'));selection.removeAllRanges();selection.addRange(range);notify('Prompt seleccionado. Cópialo con el teclado.');}
    return;
  }
  if (act==='remove') {
    const r=recordById(id);
    modal('Eliminar registro','<p>Eliminar <strong>'+esc(r.title)+'</strong> y sus vínculos.</p><p class="form-error" role="alert" hidden></p><div class="button-row">'+action('confirm-remove','Eliminar','primary',named(id))+action('edit-record','Cancelar','secondary',named(id))+'</div>');
    return;
  }
  const operations={
    accept:()=>({type:'accept',id}),reject:()=>({type:'reject',id}),'set-stage':()=>({type:'project',fields:{stage:id}}),
    complete:()=>({type:'record',record:{...recordById(id),status:'done'}}),'confirm-remove':()=>({type:'remove',id}),
  };
  if (!operations[act]) return;
  button.disabled=true;
  try {
    await change(operations[act]());
    if (dialog.open) dialog.close();
    notify(({accept:'Cambios aplicados.',reject:'Propuesta descartada.',complete:'Tarea cerrada.','set-stage':'Etapa actualizada.','confirm-remove':'Registro eliminado.'})[act]);
  } catch (error) {reportError(dialog.open?dialog:main,error);}
  finally {button.disabled=false;}
});
document.addEventListener('input',(event)=>{
  if (event.target.id==='search') {
    state.query=event.target.value;
    document.querySelector('#record-list').innerHTML=recordList();
  }
});
document.addEventListener('change',async(event)=>{
  const target=event.target;
  if (target===projectSelect) {
    try {await selectProject(target.value);} catch (e) {notify(e.message);render();}
  }
  if (target.name==='kind'&&target.closest('form')?.dataset.form==='record') {
    const values=new FormData(target.form);
    const oldBody=values.get('body');
    recordEditor({title:values.get('title'),stage:values.get('stage'),status:values.get('status'),body:Object.values(templates).includes(oldBody)||!oldBody?undefined:oldBody},target.value);
  }
  if (target.id==='text-file'&&target.files[0]) {
    const file=target.files[0];
    if (file.size>160000) {notify('El archivo supera el tamaño admitido.');target.value='';return;}
    const body=await file.text();
    if (body.length>40000) {notify('El texto supera los 40.000 caracteres.');target.value='';return;}
    target.form.elements.body.value=body;
    if (!target.form.elements.title.value) target.form.elements.title.value=file.name.replace(/\.[^.]+$/,'').slice(0,160);
  }
});
document.addEventListener('submit',async(event)=>{
  const form=event.target;
  if (!form.matches('form[data-form],#login-form')) return;
  event.preventDefault();
  const values=new FormData(form);
  const fields=Object.fromEntries(values);
  const button=event.submitter??form.querySelector('button[type=submit]');
  if (button) button.disabled=true;
  try {
    if (form.id==='login-form') {
      await api('/api/session',{code:fields.code,setup:activation});
      if (activation) history.replaceState(null,'','#inicio');
      await load();
      return;
    }
    const mode=form.dataset.form;
    if (mode==='create') {
      const data=await api('/api/projects',{...fields,id:crypto.randomUUID()});
      state.projects.unshift(data.project);
      state.project=data.project;
      state.filter='all';
      state.query='';
      remember(data.project.id);
      navigate('inicio');
    }
    if (mode==='project') await change({type:'project',fields});
    if (mode==='record') {
      const existing=recordById(form.dataset.id);
      const record={...fields,kind:existing?.kind??fields.kind,id:existing?.id??crypto.randomUUID(),refs:values.getAll('refs')};
      delete record.next;
      await change({type:'record',record,step:fields.next?record.id:state.project.step===record.id?'':undefined});
    }
    if (mode==='import') {
      let payload;
      try {payload=JSON.parse(fields.payload.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
      catch {throw new Error('El bloque pegado no contiene JSON válido.');}
      if (payload.project_id&&payload.project_id!==state.project.id) throw new Error('La propuesta pertenece a otro proyecto.');
      await change({type:'propose',summary:payload.summary,source:payload.source??'ChatGPT',changes:payload.changes,...(payload.change_id?{key:payload.change_id}:{})});
    }
    dialog.close();
    notify(({create:'Proyecto creado.',project:'Proyecto actualizado.',record:'Registro guardado.',import:'Propuesta recibida en Por revisar.'})[mode]);
  } catch (error) {reportError(form,error);}
  finally {if (button) button.disabled=false;}
});
window.addEventListener('hashchange',()=>{state.view=getView();render();});
window.addEventListener('focus',refresh);
setInterval(refresh,15000);
state.view=getView();
await load();
