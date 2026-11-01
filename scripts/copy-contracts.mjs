import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
const source=new URL('../contracts/',import.meta.url),target=new URL('../docs/public/contracts/',import.meta.url);
mkdirSync(target,{recursive:true});
for(const name of readdirSync(source))if(name.endsWith('.schema.json'))copyFileSync(new URL(name,source),new URL(name,target));
