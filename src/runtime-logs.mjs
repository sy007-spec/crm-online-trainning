import fs from 'node:fs';
import path from 'node:path';
import {format} from 'node:util';
export function runtimeLogs(runtime){
 const directory=path.join(runtime,'logs');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const prune=(now=Date.now())=>{const first=new Date(now-6*86400000).toISOString().slice(0,10);for(const file of fs.readdirSync(directory))if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)&&file.slice(0,10)<first)fs.unlinkSync(path.join(directory,file))};
 const write=(level,...args)=>{prune();const file=path.join(directory,new Date().toISOString().slice(0,10)+'.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>=2*1024*1024)return;fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),level,message:format(...args).replace(/AIza[\w-]{20,}/g,'[REDACTED]').slice(0,4000)})+'\n',{mode:0o600})};
 prune();return {write,prune};
}
