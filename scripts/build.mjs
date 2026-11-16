import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const read=(file)=>readFile(new URL('../'+file,import.meta.url),'utf8');
const path=(file)=>new URL('../'+file,import.meta.url);
const [domain,worker,html,style,client]=await Promise.all(['worker/domain.js','worker/index.js','web/index.html','web/style.css','web/app.js'].map(read));
const assets=Object.entries({html,style,client}).map(([name,value])=>'const '+name+'='+JSON.stringify(value)+';').join('\n');
const code=[assets,domain.replace(/^export \{.*\};$/m,''),worker.replace(/^import .+\n/gm,'')].join('\n');
await Promise.all(['dist/server/','dist/.openai/'].map((dir)=>mkdir(path(dir),{recursive:true})));
await Promise.all([writeFile(path('dist/server/index.js'),code),copyFile(path('.openai/hosting.json'),path('dist/.openai/hosting.json'))]);
