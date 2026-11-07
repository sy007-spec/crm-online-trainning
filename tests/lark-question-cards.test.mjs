import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createApp} from '../src/server.mjs';import {testMaterial} from './fixtures/markdown.mjs';import {testEmbedding} from './fixtures/embedding.mjs';
import {uid} from '../src/security.mjs';
async function fixture(){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'question-cards-')),calls=[];let fail=false;
 const app=createApp({runtime,seedMaterial:testMaterial(),scheduler:false,embedding:testEmbedding,larkFetch:async(url,o)=>{if(url.includes('tenant_access_token'))return Response.json({code:0,tenant_access_token:'test',expire:7200});if(fail)throw Error('fixture delivery failure');calls.push({url,...o,body:JSON.parse(o.body)});return Response.json({code:0,data:{message_id:'om_'+calls.length}})}});
 const cfg={enabled:true,appId:'test',appSecret:'test',verificationToken:'test-token',encryptKey:'test-encryption',adminOpenIds:['ou_admin'],receiveType:'open_id',receiveId:'ou_admin'};app.store.set('lark',cfg);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 app.store.run('INSERT INTO users(id,device_hash,name,created) VALUES(?,?,?,?)','author','author','Learner',app.store.now());
 const add=(visibility='public')=>{const id=uid();app.store.run('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,'pamm','manager-01','author',null,id,'留言 **Markdown**',0,0,0,app.store.now(),1,'discussion');app.store.run('INSERT INTO discussion_context(root_id,visibility) VALUES(?,?)',id,visibility);app.store.run('INSERT OR IGNORE INTO public_discussion_threads VALUES(?)',id);app.questionCards.enqueue(id);return id};
 const row=id=>app.store.get('SELECT * FROM lark_question_cards WHERE question_id=?',id);
 const card=id=>app.questionCards.render(row(id));
 const value=(id,action)=>{const c=card(id);return c.body.elements.flatMap(e=>e.elements||[e]).flatMap(e=>e.behaviors||[]).find(b=>b.value?.action===action)?.value};
 const callback=async(id,action,{text='**人工回复**\n\n- 说明',actor='ou_admin',eventId=uid(),v,messageId}={})=>{const payload={schema:'2.0',header:{event_id:eventId,event_type:'card.action.trigger',token:cfg.verificationToken},event:{operator:{open_id:actor},context:{open_message_id:messageId||row(id).message_id},action:{value:v||value(id,action),form_value:{reply_0:text,reply_1:'',reply_2:'',reply_3:''}}}};const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),nonce=uid(),signature=crypto.createHash('sha256').update(timestamp+nonce+cfg.encryptKey+raw).digest('hex');const r=await fetch(base+'/api/lark/callback',{method:'POST',headers:{'content-type':'application/json','x-lark-request-timestamp':timestamp,'x-lark-request-nonce':nonce,'x-lark-signature':signature},body:raw});return {status:r.status,data:await r.json()}};
 return {app,calls,base,add,row,card,value,callback,fail:v=>fail=v,close:async()=>{await app.close();fs.rmSync(runtime,{recursive:true,force:true})}};
}
test('signed card callbacks preview Markdown, publish without AI, update same teacher reply and deduplicate',async()=>{
 const f=await fixture();try{const id=f.add();await f.app.questionCards.tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.msg_type,'interactive');assert.equal(f.card(id).schema,'2.0');
  const preview=await f.callback(id,'question_preview');assert.equal(preview.status,200);assert(JSON.stringify(preview.data.card).includes('**人工回复**'));assert.equal(f.app.store.get('SELECT COUNT(*) n FROM lark_question_replies').n,0);
  const v=f.value(id,'question_publish'),eventId=uid(),published=await f.callback(id,'question_publish',{v,eventId});assert.equal(published.status,200);let reply=f.app.store.get('SELECT * FROM lark_question_replies WHERE question_id=?',id);assert.equal(f.app.store.get('SELECT teacher FROM questions WHERE id=?',reply.reply_id).teacher,1);
  assert.equal((await f.callback(id,'question_publish',{v,eventId})).status,200);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM lark_question_replies').n,1);
  assert.equal((await f.callback(id,'question_publish',{v})).status,409);assert.equal((await f.callback(id,'question_publish',{text:'### 修订\n\n最终说明'})).status,200);assert.equal(f.app.store.get('SELECT reply_id FROM lark_question_replies WHERE question_id=?',id).reply_id,reply.reply_id);assert.equal(f.app.store.get('SELECT COUNT(*) n FROM question_edits WHERE question_id=?',reply.reply_id).n,1);
  await f.app.questionCards.tick();assert.equal(f.calls.filter(x=>x.method==='POST').length,1);assert(f.calls.some(x=>x.method==='PATCH'));
 }finally{await f.close()}
});
test('cards reject outsider, wrong message, stale source and private actions; private notifications redact content',async()=>{
 const f=await fixture();try{const id=f.add();await f.app.questionCards.tick();assert.equal((await f.callback(id,'question_publish',{actor:'ou_other'})).status,403);assert.equal((await f.callback(id,'question_publish',{messageId:'om_other'})).status,403);
  const v=f.value(id,'question_publish');f.app.store.run('UPDATE questions SET body=? WHERE id=?','Changed source',id);assert.equal((await f.callback(id,'question_publish',{v})).status,409);assert.equal((await f.callback(id,'question_reset',{v:{...v,action:'question_reset'}})).status,200);
  f.app.store.run("UPDATE discussion_context SET visibility='private' WHERE root_id=?",id);assert.equal((await f.callback(id,'question_publish',{v})).status,403);f.app.questionCards.changed(id);await f.app.questionCards.tick();assert(!JSON.stringify(f.card(id)).includes('Changed source'));
  const privateId=f.add('private');await f.app.questionCards.tick();assert(!JSON.stringify(f.card(privateId)).includes('留言 **Markdown**'));assert.equal(f.app.store.get('SELECT COUNT(*) n FROM lark_question_replies').n,0);
 }finally{await f.close()}
});
test('delivery failures persist and retry with stable send UUID; disabled transport sends nothing',async()=>{
 const f=await fixture();try{const id=f.add();f.fail(true);await f.app.questionCards.tick();assert.equal(f.row(id).error,'DELIVERY_FAILED');assert.equal(f.row(id).state,'pending');f.fail(false);f.app.store.run('UPDATE lark_question_cards SET retry_at=0');await f.app.questionCards.tick();assert.equal(f.row(id).state,'sent');const sent=f.calls.length;f.app.store.set('lark',{...f.app.store.setting('lark'),enabled:false});f.app.questionCards.changed(id);await f.app.questionCards.tick();assert.equal(f.calls.length,sent);
 }finally{await f.close()}
});
test('unconfigured messages remain queued and later route without losing source edits or private state',async()=>{
 const f=await fixture();try{const cfg=f.app.store.setting('lark');f.app.store.set('lark',{...cfg,enabled:false});const id=f.add();assert.equal(f.row(id),undefined);assert.equal(f.app.questionCards.describe().unconfigured,1);
  f.app.store.run('UPDATE questions SET body=? WHERE id=?','Updated while transport disabled',id);f.app.store.set('lark',cfg);await f.app.questionCards.tick();assert.equal(f.app.questionCards.describe().unconfigured,0);assert(JSON.stringify(f.card(id)).includes('Updated while transport disabled'));
  f.app.store.run("UPDATE discussion_context SET visibility='private' WHERE root_id=?",id);await f.app.questionCards.tick();assert(!f.calls.at(-1).body.content.includes('Updated while transport disabled'));assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
 }finally{await f.close()}
});
test('Markdown form preserves supplementary Unicode across 1000-character boundaries',async()=>{
 const f=await fixture();try{const id=f.add();await f.app.questionCards.tick();const parts=['a'.repeat(999)+'😀','b'.repeat(999)+'😀','',''];const result=f.app.questionCards.handle({eventId:'unicode',actor:'ou_admin',messageId:f.row(id).message_id,value:f.value(id,'question_publish'),formValue:Object.fromEntries(parts.map((p,i)=>['reply_'+i,p]))});assert.equal(result.toast.type,'success');const fields=f.card(id).body.elements.find(e=>e.tag==='form').elements.filter(e=>e.tag==='input');assert.equal(fields.map(e=>e.default_value).join(''),parts.join(''));assert(fields.every(e=>Array.from(e.default_value).length<=1000));
 }finally{await f.close()}
});
