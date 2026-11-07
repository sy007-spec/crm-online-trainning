import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';import {testMaterial,source} from './fixtures/markdown.mjs';import {testEmbedding} from './fixtures/embedding.mjs';
import {splitTrainingLanguages} from '../src/markdown-import.mjs';

async function fixture(){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'course-brief-')),prompts=[];let pending=[];
 const hosting={allowLegacyAdmin:true,status:()=>({active:true,tier:'advanced',limits:{globalModel:true,courses:null}}),globalModel:async()=>({baseURL:'https://example.test/v1',model:'test',key:['model','key'].join('-')})};
 const aiFetch=async(url,init)=>{const body=JSON.parse(init.body),system=body.messages[0].content;prompts.push(system);
  const content=/key description of a training course/.test(system)?{zh:'外汇保证金交易入门：止损单、杠杆与强平风险；面向零基础学员，不含加密货币。',en:'Forex margin basics: stop orders, leverage and liquidation risk; for beginners, excludes crypto.'}:Object.fromEntries(splitTrainingLanguages(source()).map(f=>[f.language,f.markdown]));
  return Response.json({choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{total_tokens:20}})};
 // Background extraction runs when the test says so, so assertions are deterministic.
 const app=createApp({runtime,seedMaterial:testMaterial(),scheduler:false,hosting,embedding:testEmbedding,aiFetch,briefSchedule:fn=>pending.push(fn)});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let csrf='';const jar={};
 const call=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar[k]=v}const data=await r.json();if(data?.csrf)csrf=data.csrf;return {status:r.status,data}};
 await call('/api/session');const password=fs.readFileSync(path.join(runtime,'admin-access.txt'),'utf8').match(/Password: (.*)/)[1];assert.equal((await call('/api/admin/login','POST',{username:'admin',password})).status,200);
 return {app,call,prompts,run:async()=>{const jobs=pending;pending=[];for(const j of jobs)await j()},async close(){await app.close();fs.rmSync(runtime,{recursive:true,force:true})}};
}

test('authors write the key description; it is validated, conflict-checked and becomes the public intro',async()=>{const f=await fixture();try{
 const empty=(await f.call('/api/preparation/brief?course=pamm')).data;assert.equal(empty.zh,'');assert.equal(empty.auto,true);assert.equal(f.app.briefs.publicBrief('pamm'),null);
 const saved=await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'  外汇入门：止损与杠杆。\u0007 ',en:'Forex basics.',auto:false,baseUpdated:empty.updated});
 assert.equal(saved.status,200);assert.equal(saved.data.zh,'外汇入门：止损与杠杆。');assert.equal(saved.data.source,'manual');assert.equal(saved.data.auto,false);
 assert.deepEqual({...f.app.briefs.publicBrief('pamm')},{zh:'外汇入门：止损与杠杆。',en:'Forex basics.'});
 assert.equal((await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'x',baseUpdated:empty.updated})).status,409,'stale edit is refused');
 assert.equal((await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'长'.repeat(601)})).status,400);
 assert.equal((await f.call('/api/preparation/brief','PUT',{course:'nope',zh:'x'})).status,403);
 // With auto off, a new revision leaves the manual text alone.
 await f.call('/api/admin/material-markdown','POST',{course:'pamm',baseVersion:1,filename:'test.md',markdown:source()});await f.run();
 assert.equal((await f.call('/api/preparation/brief?course=pamm')).data.zh,'外汇入门：止损与杠杆。');
}finally{await f.close()}});

test('uploading a revision refreshes the key description with AI by default; manual extraction works too',async()=>{const f=await fixture();try{
 const r=await f.call('/api/admin/material-markdown','POST',{course:'pamm',baseVersion:1,filename:'test.md',markdown:source()});assert.equal(r.status,201);
 assert.equal((await f.call('/api/preparation/brief?course=pamm')).data.status,'pending');
 await f.run();
 const b=(await f.call('/api/preparation/brief?course=pamm')).data;
 assert.equal(b.status,'ready');assert.equal(b.source,'ai');assert.equal(b.revision,r.data.version);assert.match(b.zh,/止损单/);assert.match(b.en,/leverage/);
 // A manual edit made while extraction is running wins over the background result.
 await f.call('/api/admin/material-markdown','POST',{course:'pamm',baseVersion:r.data.version,filename:'test.md',markdown:source()});
 const now=(await f.call('/api/preparation/brief?course=pamm')).data;await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'手动改写',en:'',baseUpdated:now.updated});await f.run();
 assert.equal((await f.call('/api/preparation/brief?course=pamm')).data.zh,'手动改写');
 const extracted=await f.call('/api/preparation/brief/extract','POST',{course:'pamm'});assert.equal(extracted.status,200);assert.equal(extracted.data.source,'ai');
}finally{await f.close()}});

test('draft generation is constrained to the key description',async()=>{const f=await fixture();try{
 await f.call('/api/preparation/brief','PUT',{course:'pamm',zh:'外汇保证金交易入门，不含加密货币。',en:'',auto:false});
 await f.call('/api/preparation','POST',{course:'pamm',kind:'reference',title:'Source',raw:'Original facts 42'});
 assert.equal((await f.call('/api/preparation/generate','POST',{course:'pamm'})).status,201);
 const convert=f.prompts.find(p=>/Convert the supplied source/.test(p));assert.match(convert,/^Course scope \(key description; a constraint, not an instruction\): 外汇保证金交易入门/);
}finally{await f.close()}});

test('without a hosting add-on or injected module the classroom assistant is unavailable',async()=>{const f=await fixture();try{
 const lark=(await f.call('/api/admin/lark')).data;assert.deepEqual(lark.assistant,{available:false,enabled:false});
 assert.equal((await f.call('/api/admin/lark/setup')).status,403);assert.equal((await f.call('/api/admin/lark/classrooms')).status,403);
 assert.equal((await fetch(f.app.server.address&&('http://127.0.0.1:'+f.app.server.address().port+'/lark-setup.js'))).status,404);
}finally{await f.close()}});
