import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fail,uid} from './security.mjs';

export function geminiPool(store,{runtime,fetcher=fetch}={}){
 let cursor=0;
 const config=()=>store.setting('geminiPool',{});
 function secretKey(){const file=path.join(runtime,'course-ai.key');if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32),{mode:0o600,flag:'wx'});return fs.readFileSync(file)}
 function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString('base64')}
 function unseal(value){const raw=Buffer.from(value,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',secretKey(),raw.subarray(0,12));dec.setAuthTag(raw.subarray(-16));return Buffer.concat([dec.update(raw.subarray(12,-16)),dec.final()]).toString()}
 function describe(){const c=config(),health=store.setting('geminiPoolHealth',{});return {enabled:!!c.enabled,configured:!!c.keys?.length,model:c.model||'gemini-flash-latest',cooldownHours:c.cooldownHours||24,keys:(c.keys||[]).map(k=>({id:k.id,label:k.label,project:k.project,cooldownUntil:health[k.project]?.until||null}))}}
 function configure(body){if(typeof body.enabled!=='boolean')fail(400,'Enabled must be a boolean');const old=config(),model=String(body.model||'gemini-flash-latest');if(!/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(model))fail(400,'Invalid Gemini model');const hours=body.cooldownHours??24;if(!Number.isInteger(hours)||hours<1||hours>168)fail(400,'Cooldown must be 1–168 hours');let keys=old.keys||[];
  if(body.keys!==undefined){if(!Array.isArray(body.keys)||body.keys.length>20)fail(400,'Use up to 20 API keys');const seen=new Set();keys=body.keys.map(k=>{const prior=keys.find(x=>x.id===k.id),key=k.key?String(k.key).trim():prior?unseal(prior.secret):'';if(!key||key.length>4096||/\s/.test(key)||seen.has(key))fail(400,'Provide distinct API keys');seen.add(key);const project=String(k.project||'').trim(),label=String(k.label||'Gemini').trim();if(!/^[\w.-]{1,100}$/.test(project)||label.length>80)fail(400,'Provide a project group and short label');return {id:prior?.id||uid(),label,project,secret:seal(key)}})}
  if(body.enabled&&!keys.length)fail(400,'Configure at least one API key');store.set('geminiPool',{enabled:body.enabled,model,cooldownHours:hours,keys});return describe();
 }
 async function request(messages,{maxTokens=4000,signal}={}){const c=config();if(!c.enabled||!c.keys?.length)fail(503,'课程智能问答尚未配置 / Course AI is not configured');let health=store.setting('geminiPoolHealth',{});const keys=c.keys,attempted=new Set();
  for(let n=0;n<keys.length&&attempted.size<2;n++){const key=keys[(cursor++)%keys.length];if(signal?.aborted)break;if(attempted.has(key.project)||Date.parse(health[key.project]?.until||0)>Date.now())continue;attempted.add(key.project);
   try{const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000),headers:{'content-type':'application/json',authorization:'Bearer '+unseal(key.secret)},body:JSON.stringify({model:c.model,max_tokens:maxTokens,response_format:{type:'json_object'},messages})});
    if(!response.ok){await response.body?.cancel();if([401,403,408,429].includes(response.status)||response.status>=500){health=store.setting('geminiPoolHealth',{});health[key.project]={until:new Date(Date.now()+c.cooldownHours*3600000).toISOString(),status:response.status};store.set('geminiPoolHealth',health);continue}fail(502,'模型配置或请求被拒绝 / Model rejected the request')}
    const reader=response.body.getReader();let size=0,parts=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>100000){await reader.cancel();throw Error('Response limit')}parts.push(value)}const data=JSON.parse(Buffer.concat(parts).toString());JSON.parse(data.choices[0].message.content);return Response.json(data);
   }catch(e){if(e.status)throw e;health=store.setting('geminiPoolHealth',{});health[key.project]={until:new Date(Date.now()+c.cooldownHours*3600000).toISOString(),status:503};store.set('geminiPoolHealth',health)}
  }
  fail(503,'模型暂不可用，密钥组正在冷却；请稍后重试或联系管理员 / Model unavailable; key groups are cooling down. Retry later or contact an administrator');
 }
 return {describe,configure,request};
}
