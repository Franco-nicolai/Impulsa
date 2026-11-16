import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {get,list,put,BlobPreconditionFailedError} from '@vercel/blob';
import {handle,mcpTools} from '../worker/index.js';

const origin='https://impulsa-azure.vercel.app';
const appOwner='owner';
const authPath='impulso/v1/access.json';
const cookie='__Host-impulso';
const maxAge=60*60*24*30;
const loginMode='code';
const setupSecret=process.env.IMPULSO_SETUP_TOKEN;
const noCache={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const reply=(data,status=200,headers={})=>Response.json(data,{status,headers:{...noCache,...headers}});
const mac=(value)=>createHmac('sha256',setupSecret).update(value).digest('base64url');
const equal=(left,right)=>{
  if (typeof left!=='string'||typeof right!=='string') return false;
  const a=Buffer.from(left),b=Buffer.from(right);
  return a.length===b.length&&timingSafeEqual(a,b);
};
const pathFor=(id)=>'impulso/v1/projects/'+id+'.json';
const readOptions={access:'private',useCache:false};
const putOptions={access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60};

async function readBlob(path) {
  const entry=await get(path,readOptions);
  if (!entry || entry.statusCode===404) return null;
  if (entry.statusCode!==200 || !entry.stream) throw new Error('Unexpected blob response: '+entry.statusCode);
  return {etag:entry.blob.etag,document:await new Response(entry.stream).json()};
}

async function createBlob(path,document) {
  try {
    await put(path,JSON.stringify(document),{...putOptions,allowOverwrite:false});
    return true;
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || /already exists/i.test(error.message)) return false;
    throw error;
  }
}

const store={
  async list() {
    const {blobs}=await list({prefix:'impulso/v1/projects/',limit:100});
    const records=await Promise.all(blobs.map(({pathname})=>readBlob(pathname)));
    return records.filter(Boolean).map(({document:{id,title,stage,idea,updatedAt}})=>({id,title,stage,idea,updatedAt})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(_owner,id) {
    const entry=await readBlob(pathFor(id));
    return entry?{revision:entry.etag,document:entry.document}:null;
  },
  create(_owner,project) {return createBlob(pathFor(project.id),project);},
  async replace(_owner,project,etag) {
    try {
      await put(pathFor(project.id),JSON.stringify(project),{...putOptions,allowOverwrite:true,ifMatch:etag});
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  },
};

function actionKey() {return mac('impulso:action:v1');}
function webAuthorized(request) {
  const token=request.headers.get('cookie')?.split(/;\s*/).find((pair)=>pair.startsWith(cookie+'='))?.slice(cookie.length+1);
  const [expires,nonce,signature]=token?.split('.')??[];
  return Number(expires)>Date.now() && nonce && equal(signature,mac('impulso:session:'+expires+'.'+nonce));
}
function authorize(request,isAction) {
  if (isAction) {
    const bearer=request.headers.get('authorization');
    return equal(bearer,'Bearer '+actionKey())?appOwner:null;
  }
  return webAuthorized(request)?appOwner:null;
}

async function session(request,body) {
  if (request.headers.get('sec-fetch-site')==='cross-site') return reply({error:'Origen inválido.'},403);
  const {code,setup}=body;
  if (typeof code!=='string'||code.length>256) return reply({error:'Código inválido.'},400);
  const entry=await readBlob(authPath);
  if (!entry) {
    if (!equal(setup,setupSecret)) return reply({error:'Abre el enlace de activación para definir tu contraseña.'},401);
    if (code.length<14) return reply({error:'La contraseña debe tener al menos 14 caracteres.'},400);
    const salt=randomBytes(24).toString('hex');
    if (!await createBlob(authPath,{salt,hash:scryptSync(code,salt,64).toString('hex')})) return reply({error:'El acceso ya fue configurado. Inicia sesión con tu contraseña.'},409);
  } else {
    const {salt,hash}=entry.document;
    if (!equal(scryptSync(code,salt,64).toString('hex'),hash)) return reply({error:'Contraseña incorrecta.'},401);
  }
  const payload=(Date.now()+maxAge*1000)+'.'+randomBytes(20).toString('base64url');
  return reply({ok:true},200,{'set-cookie':cookie+'='+payload+'.'+mac('impulso:session:'+payload)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge});
}

function openApi() {
  const paths=Object.fromEntries(mcpTools.map(({name,description,inputSchema,annotations})=>['/actions/'+name,{post:{
    operationId:name,summary:description,description,security:[{bearerAuth:[]}],
    'x-openai-isConsequential':!annotations.readOnlyHint,
    requestBody:{required:true,content:{'application/json':{schema:inputSchema}}},
    responses:{'200':{description:'Resultado de la operación',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},
      '401':{description:'Clave inválida'},'409':{description:'Conflicto en el proyecto'}},
  }}]));
  return {openapi:'3.1.0',info:{title:'Impulso',description:'Consulta proyectos y envía propuestas a la bandeja privada de revisión.',version:'1.0.0'},
    servers:[{url:origin}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}},paths};
}

export default {
  async fetch(request) {
    const url=new URL(request.url);
    const route=url.searchParams.get('route')||url.pathname;
    if (!route.startsWith('/')||route.startsWith('//')) return reply({error:'Ruta inválida.'},400);
    url.pathname=route;
    url.searchParams.delete('route');
    if (request.method==='GET'&&route==='/openapi.json') return reply(openApi());
    if (request.method==='GET'&&route==='/privacidad') return new Response(
      'Impulso guarda los registros de tu proyecto en almacenamiento privado. La guía en ChatGPT puede consultar registros y enviar propuestas cuando la autorizas. Revisa los cambios antes de aplicarlos.',
      {headers:{...noCache,'content-type':'text/plain; charset=utf-8'}});
    if (request.method==='GET'&&route==='/api/action-key') {
      return setupSecret&&webAuthorized(request)?reply({key:actionKey()}):reply({error:'Inicia sesión.'},401);
    }
    if (!setupSecret && (route.startsWith('/api/')||route.startsWith('/actions/'))) return reply({error:'El acceso de Impulso se está configurando.'},503);
    return handle(new Request(url,request),{IMPULSO_STORE:store,authorize,session,loginMode});
  },
};
