import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';import {testMaterial} from './fixtures/markdown.mjs';import {testEmbedding} from './fixtures/embedding.mjs';
// Course materials use the shared materials engine of the private lark-feishu-assist module (injected by the hosting platform).
const libPath=process.env.LARK_FEISHU_ASSIST;
const lib=libPath&&fs.existsSync(libPath)?await import(pathToFileURL(path.resolve(libPath)).href):null;
const skip=lib?false:'set LARK_FEISHU_ASSIST to the private lark-feishu-assist module';

async function open(runtime,{withLib=true,calls=[]}={}){
 const hosting={allowLegacyAdmin:true,status:()=>({active:true,tier:'advanced',limits:{globalModel:true,courses:null},addons:{larkAssistant:false}}),globalModel:async()=>({baseURL:'https://example.test/v1',model:'test',key:['model','key'].join('-')})};
 const aiFetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body.messages[0].content.slice(0,10));return Response.json({choices:[{message:{content:'# 讲义（校准）\n\n限价单在指定价格成交。'},finish_reason:'stop'}],usage:{total_tokens:10}})};
 const app=createApp({runtime,seedMaterial:testMaterial(),scheduler:false,hosting,embedding:testEmbedding,aiFetch,briefSchedule:()=>{},...(withLib?{larkAssist:lib}:{})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let csrf='';const jar={};
 const call=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),'content-type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});for(const c of r.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');jar[k]=v}const type=r.headers.get('content-type')||'';const data=type.includes('json')?await r.json():await r.text();if(data?.csrf)csrf=data.csrf;return {status:r.status,data,headers:r.headers}};
 await call('/api/session');const password=fs.readFileSync(path.join(runtime,'admin-access.txt'),'utf8').match(/Password: (.*)/)[1];assert.equal((await call('/api/admin/login','POST',{username:'admin',password})).status,200);
 return {app,call,close:()=>app.close()};
}

test('existing preparation documents migrate into materials with their IDs; the old name stays a view',{skip},async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'materials-migrate-'));
 try{
  let f=await open(runtime,{withLib:false});
  const ref=(await f.call('/api/preparation','POST',{course:'pamm',kind:'reference',title:'原始讲义',raw:'止损单在触发价成交。'})).data;
  const draft=(await f.call('/api/preparation','POST',{course:'pamm',kind:'course',title:'第一课草稿',zh:'中文稿',en:''})).data;
  f.app.store.run('INSERT INTO knowledge_approvals VALUES(?,?,?,?,?,?,?)','pamm',ref.id,'v1',1,ref.revision,'admin','2026-11-07');
  await f.close();
  f=await open(runtime);
  try{
   assert.equal(f.app.store.get("SELECT type FROM sqlite_master WHERE name='preparation_documents'").type,'view');
   assert.equal((await f.call('/api/session')).data.materials,true);
   const listed=(await f.call('/api/materials?course=pamm')).data.items;assert.deepEqual(listed.map(x=>x.id).sort(),[ref.id,draft.id].sort());
   const got=(await f.call('/api/preparation?course=pamm&id='+ref.id)).data;assert.equal(got.raw,'止损单在触发价成交。');assert.equal(got.revision,ref.revision);
   assert.equal((await f.call(`/api/materials/${draft.id}?course=pamm`)).data.markdown,'中文稿');
   assert.ok(f.app.store.get('SELECT 1 FROM knowledge_approvals a JOIN preparation_documents d ON d.id=a.document_id AND a.document_revision=d.revision'),'approvals still match the migrated revision');
   // Editing creates a draft: readers (the view) keep the published text until it is published; then the approval is stale.
   const doc=(await f.call(`/api/materials/${ref.id}?course=pamm`)).data;
   const edited=(await f.call(`/api/materials/${ref.id}?course=pamm`,'PUT',{baseRevision:doc.headRevision,markdown:'止损单在触发价转市价成交。'})).data;
   assert.equal(edited.state,'changed');assert.equal(f.app.store.get('SELECT raw FROM preparation_documents WHERE id=?',ref.id).raw,'止损单在触发价成交。');
   await f.call(`/api/materials/${ref.id}/publish?course=pamm`,'POST',{});
   assert.equal(f.app.store.get('SELECT raw FROM preparation_documents WHERE id=?',ref.id).raw,'止损单在触发价转市价成交。');
   assert.equal(f.app.store.get('SELECT 1 FROM knowledge_approvals a JOIN preparation_documents d ON d.id=a.document_id AND a.document_revision=d.revision'),undefined,'changed text needs a new approval');
  }finally{await f.close()}
 }finally{fs.rmSync(runtime,{recursive:true,force:true})}
});

test('authors paste, upload and review materials over HTTP; storage is accounted and access is per course',{skip},async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'materials-http-')),calls=[];
 const f=await open(runtime,{calls});
 try{
  assert.match((await f.call('/materials.js')).headers.get('content-type'),/javascript/);
  assert.match((await f.call('/course-materials.js')).headers.get('content-type'),/javascript/);
  const created=(await f.call('/api/materials?course=pamm','POST',{title:'大纲',kind:'reference',markdown:'第一课 止损单'})).data;
  assert.equal(created.state,'draft');assert.equal(f.app.store.get('SELECT 1 FROM preparation_documents WHERE id=?',created.id),undefined,'drafts are not used yet');
  await f.call(`/api/materials/${created.id}/publish?course=pamm`,'POST',{});
  assert.equal(f.app.store.get('SELECT raw FROM preparation_documents WHERE id=?',created.id).raw,'第一课 止损单');
  // A Word-like upload (text file here) is converted with the classroom model and waits for review.
  const up=(await f.call('/api/materials/upload?course=pamm','POST',{files:[{name:'讲义.txt',data:Buffer.from('讲义：限价单在指定价格成交。').toString('base64')}],kind:'reference'})).data.created[0];
  assert.equal(up.kind,'conversion');let job;
  for(let i=0;i<200;i++){await f.app.materials.engine.processJobs();job=(await f.call(`/api/materials/${up.id}/jobs/${up.job}?course=pamm`)).data;if(!['pending','processing'].includes(job.state))break;await new Promise(r=>setTimeout(r,20))}assert.equal(job.state,'awaiting_review');assert.match(job.candidate,/讲义（校准）/);assert.ok(calls.some(c=>c.startsWith('你是文档格式校准器')));
  const accepted=(await f.call(`/api/materials/${up.id}/jobs/${up.job}/accept?course=pamm`,'POST',{})).data;assert.match(accepted.markdown,/限价单/);
  const original=await f.call(`/api/materials/${up.id}/assets/${up.asset}?course=pamm`);assert.equal(original.status,200);assert.match(original.headers.get('content-disposition'),/attachment/);
  assert.ok(f.app.store.get('SELECT used FROM content_storage WHERE id=1').used>0);
  assert.ok(f.app.store.get("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='storage_materials_assets_INSERT'"),'originals count towards classroom storage');
  // Libraries are per course; unknown courses are refused.
  assert.equal((await f.call(`/api/materials/${up.id}?course=nope`)).status,403);
  assert.equal((await f.call('/api/materials?course=pamm','POST',{title:'x',kind:'other'})).status,400);
 }finally{await f.close();fs.rmSync(runtime,{recursive:true,force:true})}
});
