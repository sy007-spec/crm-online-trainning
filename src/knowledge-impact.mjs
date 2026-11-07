import {AsyncLocalStorage} from 'node:async_hooks';
import {uid,fail} from './security.mjs';

const integer=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const modelName=n=>typeof n==='string'&&/^[\w./:-]{1,160}$/.test(n)?n:'selected';
export function knowledgeImpact(store){
 const context=new AsyncLocalStorage();
 store.db.exec(`CREATE TABLE IF NOT EXISTS knowledge_impact_runs(id TEXT PRIMARY KEY,created TEXT NOT NULL,course TEXT NOT NULL,detail TEXT NOT NULL,rating TEXT NOT NULL DEFAULT 'unrated',reviewer TEXT);
 CREATE INDEX IF NOT EXISTS impact_run_time ON knowledge_impact_runs(created);
 CREATE TABLE IF NOT EXISTS knowledge_impact_calls(id TEXT PRIMARY KEY,run_id TEXT,created TEXT NOT NULL,detail TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS impact_call_time ON knowledge_impact_calls(created);
 CREATE INDEX IF NOT EXISTS impact_call_run ON knowledge_impact_calls(run_id);`);
 const prune=()=>{const cutoff=new Date(Date.now()-90*86400000).toISOString();store.run('DELETE FROM knowledge_impact_calls WHERE created<?',cutoff);store.run('DELETE FROM knowledge_impact_runs WHERE created<?',cutoff)};
 function update(data){const c=context.getStore();if(c)Object.assign(c,data)}
 function sources(items){update({retrieved:true,sources:items.map(s=>({id:s.id,characters:String(s.text||'').length,kind:s.document?'reference':'course'})).slice(0,100)})}
 function citations(ids){const c=context.getStore();if(c)c.citations=[...new Set(ids)].filter(id=>c.sources.some(s=>s.id===id))}
 async function run(meta,fn){prune();const c={id:uid(),...meta,started:Date.now(),stage:'retrieval',retrieved:false,sources:[],citations:[],grounding:'not_run',attempts:0};
  store.run('INSERT INTO knowledge_impact_runs(id,created,course,detail) VALUES(?,?,?,?)',c.id,store.now(),meta.course,JSON.stringify({...meta,outcome:'pending'}));
  return context.run(c,async()=>{let result;try{result=await fn();return result}finally{const detail={...meta,outcome:result?.status||'failed',reason:result?.reason||'',retrieved:c.retrieved,sources:c.sources,citations:c.citations,grounding:c.grounding,attempts:c.attempts,duration:Date.now()-c.started,cached:c.attempts===0&&!c.retrieved&&['answered','reviewed'].includes(result?.status)};store.run('UPDATE knowledge_impact_runs SET detail=? WHERE id=?',JSON.stringify(detail),c.id)}});
 }
 // The adapter sees every actual provider HTTP attempt, including pool fallback attempts.
 function wrap(fetcher){return async(url,options={})=>{
  let body;try{body=JSON.parse(options.body)}catch{return fetcher(url,options)}
  if(!Array.isArray(body.messages))return fetcher(url,options);prune();
  const c=context.getStore(),system=String(body.messages.find(m=>m.role==='system')?.content||'');
  const stage=c?.stage||(system.startsWith('Translate the supplied discussion')?'translation':system.includes('Convert the supplied source into reviewed-draft')?'material_conversion':system.startsWith('You write the key description')?'course_brief':'other');
  const role=c?.role||(c?.id?'retrieval_evidence':stage==='translation'?'no_retrieval':['material_conversion','course_brief'].includes(stage)?'direct_material':'unclassified');
  const started=Date.now();if(c?.id)c.attempts++;let response,data={},state='transport_error';
  try{response=await fetcher(url,options);state=response.ok?'http_success':'http_error';
   // Read only a bounded copy to obtain provider usage. Never retain content or errors.
   try{const reader=response.clone().body?.getReader();if(reader){const parts=[];let bytes=0;for(;;){const part=await reader.read();if(part.done){data=JSON.parse(Buffer.concat(parts).toString());break}bytes+=part.value.length;if(bytes>1600000){reader.cancel().catch(()=>{});break}parts.push(part.value)}}}catch{}
   return response;
  }finally{const usage=data.usage||{},detail={course:c?.course||null,model:modelName(body.model),stage,role,state,httpStatus:response?.status||null,duration:Date.now()-started,inputCharacters:JSON.stringify(body.messages).length,knowledgeCharacters:c?.id?c.sources.reduce((n,s)=>n+s.characters,0):null,sources:c?.sources||[],usage:{input:integer(usage.prompt_tokens),output:integer(usage.completion_tokens),total:integer(usage.total_tokens)}};
   store.run('INSERT INTO knowledge_impact_calls VALUES(?,?,?,?)',uid(),c?.id||null,store.now(),JSON.stringify(detail));
  }
 }}
 const decode=r=>({...r,...JSON.parse(r.detail),detail:undefined});
 function describe(query=new URLSearchParams()){
  prune();const days=Number(query.get('days')||30);if(![7,30,90].includes(days))fail(400,'Choose 7, 30 or 90 days');
  const since=new Date(Date.now()-days*86400000).toISOString(),offset=Math.min(1000000,Math.max(0,Number(query.get('offset'))||0));if(!Number.isInteger(offset))fail(400,'Invalid offset');
  const runs=store.all('SELECT * FROM knowledge_impact_runs WHERE created>=? ORDER BY created DESC,rowid DESC LIMIT 50 OFFSET ?',since,offset).map(decode);
  const calls=store.all('SELECT * FROM knowledge_impact_calls WHERE created>=? ORDER BY created DESC,rowid DESC LIMIT 50 OFFSET ?',since,offset).map(decode);
  const summary=store.get(`SELECT COUNT(*) calls,SUM(CASE WHEN json_extract(detail,'$.state')<>'http_success' THEN 1 ELSE 0 END) failures,SUM(json_extract(detail,'$.usage.total')) tokens,SUM(CASE WHEN json_extract(detail,'$.usage.total') IS NULL THEN 1 ELSE 0 END) unknownUsage,SUM(CASE WHEN run_id IS NOT NULL THEN 1 ELSE 0 END) linkedCalls FROM knowledge_impact_calls WHERE created>=?`,since);
  const funnel=store.get(`SELECT COUNT(*) runs,SUM(CASE WHEN json_extract(detail,'$.retrieved')=1 THEN 1 ELSE 0 END) searched,SUM(CASE WHEN json_array_length(detail,'$.sources')>0 THEN 1 ELSE 0 END) found,SUM(CASE WHEN json_extract(detail,'$.attempts')>0 THEN 1 ELSE 0 END) dispatched,SUM(CASE WHEN json_array_length(detail,'$.citations')>0 THEN 1 ELSE 0 END) cited,SUM(CASE WHEN json_extract(detail,'$.grounding') IN ('supported','rejected') THEN 1 ELSE 0 END) checked,SUM(CASE WHEN json_extract(detail,'$.grounding')='supported' THEN 1 ELSE 0 END) supported,SUM(CASE WHEN json_extract(detail,'$.outcome')='answered' AND json_extract(detail,'$.cached')=0 THEN 1 ELSE 0 END) answered,SUM(CASE WHEN json_extract(detail,'$.cached')=1 THEN 1 ELSE 0 END) cached FROM knowledge_impact_runs WHERE created>=?`,since);
  const trend=store.all(`SELECT substr(created,1,10) day,COUNT(*) calls,SUM(json_extract(detail,'$.usage.total')) tokens,SUM(CASE WHEN json_extract(detail,'$.state')<>'http_success' THEN 1 ELSE 0 END) failures FROM knowledge_impact_calls WHERE created>=? GROUP BY day ORDER BY day`,since);
  const ratings=store.all('SELECT rating,COUNT(*) count FROM knowledge_impact_runs WHERE created>=? GROUP BY rating',since);
  const roles=store.all("SELECT json_extract(detail,'$.role') role,COUNT(*) count FROM knowledge_impact_calls WHERE created>=? GROUP BY role",since);
  return {days,offset,limit:50,summary,funnel,trend,ratings,roles,runs,calls,retentionDays:90,timeZone:'UTC'};
 }
 function detail(id){prune();const row=store.get('SELECT * FROM knowledge_impact_runs WHERE id=?',id);if(!row)fail(404,'Trace not found');return {run:decode(row),calls:store.all('SELECT * FROM knowledge_impact_calls WHERE run_id=? ORDER BY created,rowid',id).map(decode)}}
 function rate(id,rating,actor){if(!['helpful','partial','unhelpful','unrated'].includes(rating))fail(400,'Invalid rating');if(!store.get('SELECT 1 FROM knowledge_impact_runs WHERE id=?',id))fail(404,'Trace not found');store.run('UPDATE knowledge_impact_runs SET rating=?,reviewer=? WHERE id=?',rating,actor,id);store.audit(actor,'knowledge.impact-rated',{id,rating});return {ok:true}}
 return {run,wrap,update,sources,citations,describe,detail,rate,operation:(meta,fn)=>context.run({...meta,sources:[]},fn)};
}
