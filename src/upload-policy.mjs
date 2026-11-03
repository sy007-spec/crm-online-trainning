import {fail} from './security.mjs';
export const markdownBytes=hosting=>hosting?(hosting.status().tier==='advanced'?10000000:2000000):1000000;
export function checkMarkdown(body,hosting){
 const limit=markdownBytes(hosting),files=body.files??[{filename:body.filename||'training.md',markdown:body.markdown}];
 if(!Array.isArray(files)||!files.length||files.length>2)fail(400,'Select one or two Markdown files');
 for(const file of files){if(typeof file?.markdown!=='string'||file.markdown.includes('\0')||!/^.{1,200}\.(md|markdown)$/i.test(file.filename||'training.md')||/[\\/:]/.test(file.filename))fail(400,'Upload UTF-8 Markdown files (.md)');if(Buffer.byteLength(file.markdown)>limit)throw Object.assign(Error('Markdown file exceeds '+limit/1000000+' MB'),{status:413,code:'markdown_too_large',limit});}
}
// Shared across tenant instances, including legacy host aliases.
const active=new Map(),recent=new Map();let total=0;
export function acquireWork(key,kind,now=Date.now()){
 const slot=key+':'+kind,cap=kind==='ai'?1:2,globalCap=4;
 if((active.get(slot)||0)>=cap||total>=globalCap)throw Object.assign(Error('Service busy; try again shortly'),{status:429,code:'work_busy'});
 for(const [id,row]of recent)if(row.until<=now)recent.delete(id);
 let row=recent.get(slot);if(!row){row={until:now+60000,count:0};recent.set(slot,row)}
 if(++row.count>(kind==='ai'?6:20))throw Object.assign(Error('Too many uploads; try again shortly'),{status:429,code:'work_busy'});
 active.set(slot,(active.get(slot)||0)+1);total++;let released=false;
 return ()=>{if(released)return;released=true;total--;const n=active.get(slot)-1;if(n)active.set(slot,n);else active.delete(slot)};
}
