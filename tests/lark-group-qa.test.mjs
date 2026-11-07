import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';
import {testMaterial} from './fixtures/markdown.mjs';import {testEmbedding} from './fixtures/embedding.mjs';
const libPath=process.env.LARK_FEISHU_ASSIST,lib=libPath&&fs.existsSync(libPath)?await import(pathToFileURL(path.resolve(libPath)).href):null;
const skip=lib?false:'set LARK_FEISHU_ASSIST to the private module';
const enc='synthetic-encryption',verification='synthetic-verification';
async function fixture(){
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'group-qa-')),sent=[],requests=[],sdkState={};let sequence=0,mode='good',active=true,addon=true,failDelivery=false;
 const sdk={Domain:{Feishu:'feishu',Lark:'lark'},LoggerLevel:{fatal:0},EventDispatcher:class{register(h){sdkState.handlers=h;return this}},WSClient:class{start(){}close(){}}};
 const options={runtime,seedMaterial:testMaterial(),scheduler:false,larkAssist:lib,larkSdk:sdk,larkAutoPrepare:false,embedding:testEmbedding,hosting:{status:()=>({active,tier:'advanced',limits:{globalModel:true},addons:{larkAssistant:addon}}),globalModel:async()=>({baseURL:'https://model.test/v1',model:'synthetic',key:'synthetic'})},larkFetch:async(url,init={})=>{
  const u=new URL(url),body=init.body?JSON.parse(init.body):{};
  if(u.pathname.endsWith('tenant_access_token/internal'))return Response.json({code:0,tenant_access_token:'synthetic',expire:7200});
  if(u.pathname.endsWith('/members'))return Response.json({code:0,data:{items:['ou_owner','ou_student'].map(member_id=>({member_id,name:'Synthetic'})),has_more:false}});
  if(u.pathname.includes('/chats/'))return Response.json({code:0,data:{owner_id:'ou_owner',name:'Synthetic',external:false}});
  if(u.pathname.includes('/messages')){if(failDelivery&&u.pathname.endsWith('/reply'))throw Error('synthetic transport failure');const message_id='om_sent_'+(++sequence);sent.push({path:u.pathname,method:init.method,body,message_id});return Response.json({code:0,data:{message_id}});}
  throw Error('Unexpected synthetic Lark route '+u.pathname);
 },aiFetch:async(url,init)=>{
  const data=JSON.parse(init.body);if(data.messages[0].content.startsWith('Grounding reviewer'))return Response.json({choices:[{message:{content:'{"supported":true}'}}],usage:{total_tokens:3}});
  const input=JSON.parse(data.messages[1].content);requests.push(input);assert(!init.body.includes('Synthetic instructor content'));if(mode==='fail')return Response.json({}, {status:503});
  return Response.json({choices:[{message:{content:JSON.stringify({answer:{zh:'课程资料答案',en:'Supported synthetic course answer'},citations:[input.sources[0].id],insufficient:false})}}],usage:{total_tokens:20}});
 }};
 let app=createApp(options),s=app.store;s.set('lark',{enabled:true,appId:'cli_synthetic',appSecret:'synthetic',botOpenId:'ou_bot',region:'feishu',encryptKey:enc,verificationToken:verification,adminOpenIds:['ou_admin']});
 await app.classroom.bind('oc_group01',{courseId:'pamm',autoDraft:false});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let count=0;
 const event=(type,event,id='ev_'+(++count))=>({schema:'2.0',header:{event_id:id,event_type:type,token:verification,create_time:String(Date.now())},event});
 async function deliver(payload){const raw=JSON.stringify({encrypt:lib.encryptPayload(payload,enc)}),ts=String(Math.floor(Date.now()/1000)),nonce='n'+count;const res=await fetch(base+'/api/lark/callback',{method:'POST',headers:{'content-type':'application/json','x-lark-request-timestamp':ts,'x-lark-request-nonce':nonce,'x-lark-signature':lib.signature(ts,nonce,enc,raw)},body:raw});return {status:res.status,data:await res.json()};}
 const msg=(id,extra={})=>event('im.message.receive_v1',{sender:{sender_id:{open_id:extra.sender||'ou_student'},sender_type:'user'},message:{message_id:id,chat_id:extra.chat||'oc_group01',chat_type:'group',message_type:'text',create_time:String(Date.now()),thread_id:extra.thread||'omt_one',content:JSON.stringify({text:'@_user_1 Explain synthetic fixture '+id}),mentions:[{key:'@_user_1',id:{open_id:'ou_bot'},name:'Bot'}]}});
 async function settle(){await new Promise(r=>setTimeout(r,25));await app.groupQa.tick();}
 async function ask(id,extra){await app.classroom.handle(msg(id,extra));await settle();return s.get('SELECT * FROM lark_group_qa WHERE message_id=?',id);}
 async function batch(){app.groupQa.force({message:{chatId:'oc_group01'},sender:{openId:'ou_owner'}});await settle();return s.get('SELECT * FROM lark_group_qa_batches ORDER BY created DESC LIMIT 1');}
 function action(b,act='import',itemId,extra={}){return {eventId:'action_'+(++count),actor:'ou_owner',messageId:s.get('SELECT message_id FROM lark_group_qa_cards WHERE batch_id=? AND recipient=?',b.id,'ou_owner').message_id,value:{action:'group_qa_'+act,batchId:b.id,revision:b.revision,...(itemId?{itemId}:{})},...extra};}
 return {get app(){return app},get s(){return s},sent,requests,sdkState,event,deliver,msg,settle,ask,batch,action,reopen:async()=>{await app.close();app=createApp(options);s=app.store;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));},mode:v=>mode=v,active:v=>active=v,addon:v=>addon=v,deliveryFail:v=>failDelivery=v,async close(){await app.close();fs.rmSync(runtime,{recursive:true,force:true})}};
}

test('group answer uses grounded tutor without public questions; owner approves exact-once and recall withdraws it',{skip},async()=>{const f=await fixture();try{
 const r=await f.ask('om_a');assert.equal(r.state,'ready');assert.equal(r.answer_status,'answered');assert.equal(f.requests.length,1);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,0);assert.equal(f.s.get('SELECT COUNT(*) n FROM ai_answers').n,0);
 const reply=f.sent.find(x=>x.path.endsWith('/om_a/reply'));assert.match(JSON.parse(reply.body.content).text,/Supported synthetic course answer/);assert(!reply.body.content.includes('[object Object]'));assert.equal(reply.body.reply_in_thread,true);
 assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_group_qa_batches').n,0);const b=await f.batch();assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_group_qa_cards').n,2);
 if(process.env.LARK_QA_CARD_EXPORT)fs.writeFileSync(process.env.LARK_QA_CARD_EXPORT,JSON.stringify(f.app.groupQa.render(b)));const a=f.action(b,'import',r.id);const result=f.app.groupQa.handle(a);assert.match(result.toast.content,/已补充/);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,2);assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_question_notifications').n,0);assert.match(f.s.get('SELECT body FROM questions WHERE teacher=1').body,/Supported synthetic course answer/);
 f.app.groupQa.handle(a);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,2);assert.throws(()=>f.app.groupQa.handle({...a,eventId:'new-stale-event'}),/刷新/);
 await f.app.classroom.handle(f.event('im.message.recalled_v1',{message_id:'om_a',chat_id:'oc_group01'}));assert.equal(f.s.get('SELECT COUNT(*) n FROM questions WHERE removed=0').n,0);assert.equal(f.s.get('SELECT decision FROM lark_group_qa').decision,'withdrawn');
 }finally{await f.close()}});

test('signed webhook question and SDK card callbacks share authorization and reject forged message, actor and stale scope',{skip},async()=>{const f=await fixture();try{
 assert.equal((await f.deliver(f.msg('om_signed'))).status,200);await f.settle();const b=await f.batch(),r=f.s.get('SELECT * FROM lark_group_qa');assert.equal(r.state,'ready');
 for(const extra of [{actor:'ou_student'},{messageId:'om_wrong'},{actor:'ou_other_group_owner'}])assert.throws(()=>f.app.groupQa.handle(f.action(b,'import',r.id,extra)),/权限/);
 const a=f.action(b,'import',r.id),callback=f.event('card.action.trigger',{operator:{open_id:a.actor},action:{value:a.value},context:{open_message_id:a.messageId}},a.eventId);
 f.app.classroom.connect();const answer=await f.sdkState.handlers['card.action.trigger'](callback);assert.match(answer.toast.content,/已补充/);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,2);
 const r2=await f.ask('om_revision'),b2=await f.batch();f.s.set('defaultBusiness:pamm','restricted');const x=f.action(b2,'import',r2.id);assert.throws(()=>f.app.groupQa.handle(x),/失效/);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,2);
 }finally{await f.close()}});

test('five answers batch automatically; per-item ignore and batch approval remain isolated and complete',{skip},async()=>{const f=await fixture();try{
 for(let i=0;i<5;i++)await f.ask('om_batch'+i);assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_group_qa_batches').n,1);let b=f.s.get('SELECT * FROM lark_group_qa_batches');const rows=f.s.all('SELECT * FROM lark_group_qa');
 const detail=f.app.groupQa.handle(f.action(b,'detail',rows[0].id));assert.match(JSON.stringify(detail),/Supported synthetic/);assert(Buffer.byteLength(JSON.stringify(detail.card.data))<30000);
 f.app.groupQa.handle(f.action(b,'ignore',rows[0].id));b=f.s.get('SELECT * FROM lark_group_qa_batches');f.app.groupQa.handle(f.action(b,'import'));assert.equal(f.s.get('SELECT COUNT(*) n FROM questions WHERE parent_id IS NULL').n,4);assert.equal(f.s.get("SELECT COUNT(*) n FROM lark_group_qa WHERE decision='ignored'").n,1);assert.equal(f.requests.length,5);
 }finally{await f.close()}});

test('no model preserves an unanswered question; delivery failure resumes without another model request',{skip},async()=>{const f=await fixture();try{
 f.deliveryFail(true);const r=await f.ask('om_retry');assert.equal(r.state,'delivery');assert.equal(f.requests.length,1);f.deliveryFail(false);await f.reopen();f.s.run('UPDATE lark_group_qa SET retry_at=0');await f.settle();assert.equal(f.s.get('SELECT state FROM lark_group_qa').state,'ready');assert.equal(f.requests.length,1);
 f.mode('fail');const no=await f.ask('om_fail');for(let i=0;i<3;i++){f.s.run('UPDATE lark_group_qa SET retry_at=0');await f.settle();}assert.equal(f.s.get('SELECT answer_status FROM lark_group_qa WHERE id=?',no.id).answer_status,'failed');
 const b=await f.batch();f.app.groupQa.handle(f.action(b,'import',no.id));assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,1);assert.equal(f.s.get('SELECT teacher FROM questions').teacher,0);
 }finally{await f.close()}});

test('ten-minute batching, member/entitlement/source checks and expired leases fail closed',{skip},async()=>{const f=await fixture();try{
 const r=await f.ask('om_wait');f.s.run('UPDATE lark_group_qa SET created=? WHERE id=?',Date.now()-601000,r.id);await f.settle();assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_group_qa_batches').n,1);
 assert.match(f.app.groupQa.force({message:{chatId:'oc_group01'},sender:{openId:'ou_student'}}),/只有/);
 await f.ask('om_outsider',{sender:'ou_outsider'});assert.equal(f.s.get('SELECT COUNT(*) n FROM lark_group_qa').n,1);
 f.addon(false);const count=f.requests.length;await f.ask('om_noaddon');assert.equal(f.requests.length,count);f.addon(true);
 const lease=await f.ask('om_lease');f.s.run("UPDATE lark_group_qa SET state='answering',retry_at=0,attempts=1 WHERE id=?",lease.id);await f.settle();assert.equal(f.s.get('SELECT state FROM lark_group_qa WHERE id=?',lease.id).state,'ready');
 f.s.run("DELETE FROM lark_classroom_members WHERE member_id='ou_student'");await f.settle();assert.equal(f.s.get("SELECT COUNT(*) n FROM lark_group_qa WHERE state<>'cancelled'").n,0);
 }finally{await f.close()}});

 test('changed knowledge blocks approval, long Unicode answers fit cards and import without truncation',{skip},async()=>{const f=await fixture();try{
 const r=await f.ask('om_long'),b=await f.batch();const text='课'.repeat(4990);f.s.run('UPDATE lark_group_qa SET answer=?,question=? WHERE id=?',text,'问'.repeat(2000),r.id);
 const detail=f.app.groupQa.handle(f.action(b,'detail',r.id));assert(Buffer.byteLength(JSON.stringify(detail.card.data))<30000);
 f.s.run('UPDATE lark_group_qa SET context=? WHERE id=?','["v1",999,"changed"]',r.id);assert.throws(()=>f.app.groupQa.handle(f.action(b,'import',r.id)),/资料已变化/);assert.equal(f.s.get('SELECT COUNT(*) n FROM questions').n,0);
 f.s.run('UPDATE lark_group_qa SET context=? WHERE id=?',r.context,r.id);f.app.groupQa.handle(f.action(b,'import',r.id));const replies=f.s.all('SELECT body FROM questions WHERE teacher=1 ORDER BY rowid');assert(replies.length>1);assert(replies.map(x=>x.body).join('').includes(text));assert(replies.every(x=>x.body.length<=4000));
 }finally{await f.close()}});
