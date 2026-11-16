import {readFileSync} from 'node:fs';
export const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
export const style=readFileSync(new URL('../web/style.css',import.meta.url),'utf8');
export const client=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
