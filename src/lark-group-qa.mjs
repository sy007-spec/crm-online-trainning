import {larkGroupEdits} from './lark-group-edits.mjs';
import {digest,uid,fail} from './security.mjs';

const safe=s=>String(s||'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'[图片：$1]').replaceAll('<','＜').replaceAll('>','＞');
export const sourceLabel=s=>s?.title&&typeof s.title==='object'?(s.title.zh||s.title.en||s.id||'课程资料'):String(s?.title||s?.pageTitle||s?.id||'课程资料');
const short=(s,n)=>Array.from(String(s||'')).slice(0,n).join('')+(Array.from(String(s||'')).length>n?'…（点击查看完整问答）':'');
// Durable group answers and review batches. Nothing enters classroom discussions before approval.
export function larkGroupQa(store,{lark,enabled,course,answer,importQuestion,admins=()=>[],syncMembers,now=Date.now}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS lark_group_qa(id TEXT PRIMARY KEY,message_id TEXT NOT NULL UNIQUE,chat_id TEXT NOT NULL,course_id TEXT NOT NULL,sender TEXT NOT NULL,thread_id TEXT,question TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',answer_status TEXT NOT NULL DEFAULT '',answer TEXT NOT NULL DEFAULT '',sources TEXT NOT NULL DEFAULT '[]',context TEXT NOT NULL,batch_id TEXT,decision TEXT NOT NULL DEFAULT 'pending',question_id TEXT,reply_message_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS lark_group_qa_queue ON lark_group_qa(state,retry_at);
 CREATE TABLE IF NOT EXISTS lark_group_qa_batches(id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,course_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS lark_group_qa_cards(batch_id TEXT NOT NULL,recipient TEXT NOT NULL,message_id TEXT,hash TEXT NOT NULL DEFAULT '',retry_at INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(batch_id,recipient));`);
 let running=null,closed=false;
 const binding=chat=>store.get("SELECT * FROM lark_classrooms WHERE chat_id=? AND status='active' AND external=0",chat);
 const recipients=b=>{const r=binding(b.chat_id);return enabled()&&r&&r.cards&&r.course_id===b.course_id?[...new Set([...(r.members_synced&&now()-Date.parse(r.members_synced)<600000?[r.owner_open_id,...JSON.parse(r.manager_open_ids||'[]')]:[]),...admins()].filter(Boolean))]:[]};
 const member=r=>!!store.get("SELECT 1 FROM lark_classroom_members WHERE chat_id=? AND id_type='open_id' AND member_id=?",r.chat_id,r.sender);
 const live=r=>{const b=binding(r.chat_id);return enabled()&&b?.course_id===r.course_id&&member(r)&&!!store.get('SELECT 1 FROM lark_classroom_messages WHERE message_id=? AND chat_id=? AND course_id=? AND deleted=0',r.message_id,r.chat_id,r.course_id)};
 function context(id){try{return course(id)}catch{return null}}
 const fresh=r=>{const c=context(r.course_id);return live(r)&&!!c&&JSON.stringify(c.stamp)===r.context};
 const items=id=>store.all('SELECT * FROM lark_group_qa WHERE batch_id=? ORDER BY created,id',id);
 function invalidate(r){store.transaction(()=>{store.run("UPDATE lark_group_qa SET state='cancelled',decision=CASE WHEN decision='imported' THEN 'withdrawn' ELSE 'cancelled' END WHERE id=?",r.id);if(r.question_id)store.run('UPDATE questions SET removed=1 WHERE id=? OR root_id=?',r.question_id,r.question_id);if(r.batch_id)store.run('UPDATE lark_group_qa_batches SET revision=revision+1 WHERE id=?',r.batch_id);});}
 function withdraw(ref){for(const r of store.all("SELECT * FROM lark_group_qa WHERE state<>'cancelled' AND "+(ref.kind==='message'?'message_id=?':'chat_id=?'),ref.kind==='message'?ref.messageId:ref.chatId))invalidate(r);kick();}
 async function ask(question,ctx){
  const chat=ctx.message.chatId,b=binding(chat),sender=ctx.sender.openId;
  if(!enabled()||!b||!context(b.course_id))return '本群尚无可用的已发布课程，暂不能答疑。';
  const candidate={chat_id:chat,sender};if(!member(candidate)){try{await syncMembers(chat)}catch{}if(!member(candidate))return '无法确认你的课堂群成员身份，请联系群主同步成员。';}
  question=String(question||'').trim();if(!question||question.length>2000)return '请将问题控制在 2000 字以内，长问题可拆分提问。';
  if(store.get('SELECT id FROM lark_group_qa WHERE message_id=?',ctx.message.messageId))return null;
  if(store.get('SELECT COUNT(*) n FROM lark_group_qa WHERE chat_id=? AND created>?',chat,now()-60000).n>=10||store.get('SELECT COUNT(*) n FROM lark_group_qa WHERE sender=? AND created>?',sender,now()-60000).n>=5)return '问题较多，请稍后再问。';
  const c=context(b.course_id);if(!enabled()||binding(chat)?.course_id!==b.course_id||!c)return '课堂配置已变化，请稍后重试。';
  store.run('INSERT OR IGNORE INTO lark_group_qa(id,message_id,chat_id,course_id,sender,thread_id,question,context,created) VALUES(?,?,?,?,?,?,?,?,?)',uid(),ctx.message.messageId,chat,b.course_id,sender,ctx.message.threadId||null,question,JSON.stringify(c.stamp),now());kick();return null;
 }
 const edits=larkGroupEdits(store,{lark,fresh,recipients,now});
 function render(b,detail=null,draft=null){
  const all=items(b.id),selected=detail?all.filter(r=>r.id===detail):all;
  const button=(text,action,id)=>({tag:'button',text:{tag:'plain_text',content:text},behaviors:[{type:'callback',value:{action:'group_qa_'+action,batchId:b.id,revision:b.revision,...(id?{itemId:id}:{})}}]});
  const elements=[{tag:'markdown',content:'**群问答审核** · '+all.length+' 条\n确认后才补充到课程留言区；AI 回答需由管理员核实。来源变化的问答不能发布。'}];
  for(const r of selected){const valid=r.state!=='cancelled'&&fresh(r);elements.push({tag:'markdown',content:valid?'**问题**\n'+safe(detail?r.question:short(r.question,220))+'\n\n**'+(r.answer_status==='manual'?'群管理员修订回复':r.answer_status==='answered'?'AI 回答':'暂未获得有依据的回答')+'**\n'+safe(detail?r.answer:short(r.answer,450))+'\n\n资料来源：'+JSON.parse(r.sources).length+' 处 · 状态：'+({pending:'待审核',imported:'已补充',ignored:'已忽略',withdrawn:'已撤回',cancelled:'已失效'}[r.decision]||r.decision):'此问答已撤回或课程资料已变化，不能补充。'});
   if(valid&&detail&&r.answer_status==='answered')elements.push({tag:'markdown',content:'**引用来源**\n'+JSON.parse(r.sources).map(s=>safe(short(sourceLabel(s),100))).join('\n')});
   if(valid&&r.decision==='pending')elements.push(button('补充此条','import',r.id),button('忽略此条','ignore',r.id));
   if(valid&&detail&&['pending','imported','ignored'].includes(r.decision)){
    elements.push({tag:'markdown',content:r.edit_revision?'管理员修订第 '+r.edit_revision+' 版 · '+(r.synced_revision===r.edit_revision?'群消息已同步':r.edit_error?'群消息更新失败，可重试；请检查飞书编辑时限、次数或权限。':'已保存，群消息等待更新'):'编辑不调用 AI；保存后标明管理员修订，不自动补充到课堂。'});
    const value=draft??(['answered','manual'].includes(r.answer_status)?r.answer:'');
    if(value.length<=4000){const chars=Array.from(value),submit=(name,text,action)=>({tag:'button',name,text:{tag:'plain_text',content:text},form_action_type:'submit',behaviors:[{type:'callback',value:{action:'group_qa_'+action,batchId:b.id,revision:b.revision,itemId:r.id}}]});elements.push({tag:'markdown',content:'**Markdown 预览（尚未保存）**\n'+safe(value||'（请填写人工回复）')},{tag:'form',name:'group_reply',elements:[...Array.from({length:4},(_,i)=>({tag:'input',name:'reply_'+i,input_type:'multiline_text',default_value:chars.slice(i*1000,(i+1)*1000).join(''),max_length:1000,width:'fill',placeholder:{tag:'plain_text',content:'回复第 '+(i+1)+' 段'}})),submit('preview','预览 Markdown','preview'),submit('save','保存并更新回复','edit')]});}
    else elements.push({tag:'markdown',content:'回复超过 4000 字；请明确清空编辑后填写精简内容，原回复不会自动截断。'});
    elements.push(button('清空编辑（不发布）','clear',r.id));if(r.edit_error)elements.push(button('重试更新群消息','retry_edit',r.id));
   }
   if(valid&&!detail)elements.push(button('查看 / 编辑回复','detail',r.id));
  }
  if(!detail)elements.push(button('补充全部待审核','import'),button('忽略全部待审核','ignore'));
  elements.push(button('刷新 / 返回列表','refresh'));
  return {schema:'2.0',config:{update_multi:true},header:{template:'blue',title:{tag:'plain_text',content:'群问答 → 课程留言审核'}},body:{elements}};
 }
 function batches(forceChat){
  for(const g of store.all("SELECT chat_id,course_id,COUNT(*) n,MIN(created) oldest FROM lark_group_qa WHERE state='ready' AND decision='pending' AND batch_id IS NULL GROUP BY chat_id,course_id")){
   if(g.n<5&&now()-g.oldest<600000&&forceChat!==g.chat_id)continue;
   const pending=store.all("SELECT * FROM lark_group_qa WHERE chat_id=? AND course_id=? AND state='ready' AND decision='pending' AND batch_id IS NULL ORDER BY created,id LIMIT 5",g.chat_id,g.course_id).filter(fresh);
   if(!pending.length)continue;
   store.transaction(()=>{const id=uid();store.run('INSERT INTO lark_group_qa_batches(id,chat_id,course_id,created) VALUES(?,?,?,?)',id,g.chat_id,g.course_id,now());for(const r of pending)store.run('UPDATE lark_group_qa SET batch_id=? WHERE id=?',id,r.id);});
  }
 }
 async function flush(){
  if(closed||!enabled())return;
  for(const r of store.all("SELECT * FROM lark_group_qa WHERE state<>'cancelled' AND (decision='pending' OR decision='imported')"))if(!live(r)||!context(r.course_id)||r.decision==='pending'&&!fresh(r))invalidate(r);
  for(let n=0;n<10&&!closed;n++){
   const r=store.get("SELECT * FROM lark_group_qa WHERE state IN ('queued','answering','delivery') AND retry_at<=? ORDER BY created,id LIMIT 1",now());if(!r)break;
   if(!fresh(r)){invalidate(r);continue;}
   if(r.state!=='delivery'){
    store.run("UPDATE lark_group_qa SET state='answering',retry_at=?,attempts=attempts+1 WHERE id=?",now()+300000,r.id);
    let result;try{result=await answer(r,()=>fresh(r))}catch{result={status:'failed'}}
    if(!fresh(r)||result.status==='stale'){invalidate(r);continue;}
    if(['busy','limited','failed'].includes(result.status)&&r.attempts<2){store.run("UPDATE lark_group_qa SET state='queued',retry_at=? WHERE id=?",now()+60000,r.id);continue;}
    const body=result.status==='answered'?result.body:result.status==='insufficient'?result.body:'AI 暂不可用，尚未生成回答。问题会提交管理员审核，可由讲师补充解答。';
    store.run("UPDATE lark_group_qa SET state='delivery',answer_status=?,answer=?,sources=?,attempts=0,retry_at=0 WHERE id=?",result.status,body||'暂未获得有依据的回答，请联系讲师。',JSON.stringify(result.sources||[]),r.id);
   }
   const ready=store.get('SELECT * FROM lark_group_qa WHERE id=?',r.id);if(!fresh(ready))continue;
   try{
    const refs=JSON.parse(ready.sources).map((s,i)=>'['+(i+1)+'] '+sourceLabel(s)).join('\n');
    const sent=await lark.api('im/v1/messages/'+encodeURIComponent(r.message_id)+'/reply',{method:'POST',body:{msg_type:'text',content:JSON.stringify({text:ready.answer+(refs?'\n\n课程依据：\n'+refs:'')+'\n\n（群问答尚未加入课程留言，待管理员审核）'}),reply_in_thread:!!r.thread_id,uuid:digest('group-answer:'+r.id).slice(0,32)}});
    // A recall may have arrived during the request. Do not resurrect its job.
    if(fresh(ready))store.run("UPDATE lark_group_qa SET state='ready',reply_message_id=?,retry_at=0 WHERE id=? AND state='delivery'",sent.message_id||'',r.id);
   }catch{store.run('UPDATE lark_group_qa SET attempts=attempts+1,retry_at=? WHERE id=?',now()+Math.min(3600000,60000*2**Math.min(ready.attempts,6)),r.id);}
  }
  await edits.flush();
  batches();
  for(const b of store.all('SELECT * FROM lark_group_qa_batches ORDER BY created')){
   for(const recipient of recipients(b))store.run('INSERT OR IGNORE INTO lark_group_qa_cards(batch_id,recipient) VALUES(?,?)',b.id,recipient);
   for(const row of store.all('SELECT * FROM lark_group_qa_cards WHERE batch_id=? AND retry_at<=?',b.id,now())){
    if(!recipients(b).includes(row.recipient))continue;
    const content=JSON.stringify(render(b)),hash=digest(content);if(hash===row.hash)continue;
    try{let message=row.message_id;if(message)await lark.api('im/v1/messages/'+encodeURIComponent(message),{method:'PATCH',body:{content}});else{const sent=await lark.api('im/v1/messages?receive_id_type=open_id',{method:'POST',body:{receive_id:row.recipient,msg_type:'interactive',content,uuid:digest('group-review:'+b.id+':'+row.recipient).slice(0,32)}});message=sent.message_id;}
     if(!message)throw Error('Missing message id');store.run('UPDATE lark_group_qa_cards SET message_id=?,hash=?,attempts=0,retry_at=0 WHERE batch_id=? AND recipient=?',message,hash,b.id,row.recipient);
    }catch{store.run('UPDATE lark_group_qa_cards SET attempts=attempts+1,retry_at=? WHERE batch_id=? AND recipient=?',now()+Math.min(3600000,60000*2**Math.min(row.attempts,6)),b.id,row.recipient);}
   }
  }
 }
 const tick=()=>running||(running=flush().finally(()=>{running=null}));
 function kick(){if(!closed)queueMicrotask(()=>tick().catch(()=>{}));}
 function force(ctx){const b=binding(ctx.message.chatId);if(!b||!recipients(b).includes(ctx.sender.openId))return '只有本群群主、群管理员或登记管理员可发起审核。';batches(b.chat_id);kick();return '已整理当前待审核问答，将通过私聊卡片通知管理员；正在生成的回答会在后续批次提交。';}
 function handle({eventId,actor,value,formValue={},messageId}){
  const b=store.get('SELECT * FROM lark_group_qa_batches WHERE id=?',String(value.batchId||''));
  if(!b||!actor||!messageId||!recipients(b).includes(actor)||!context(b.course_id)||!store.get('SELECT 1 FROM lark_group_qa_cards WHERE batch_id=? AND recipient=? AND message_id=?',b.id,actor,messageId))fail(403,'无本群审核权限或卡片已失效');
  if(!eventId)fail(400,'Event ID required');if(store.get('SELECT id FROM callbacks WHERE id=?',eventId))return {toast:{type:'info',content:'已处理，请刷新卡片'}};
  const action=String(value.action).replace('group_qa_','');if(!['refresh','detail','import','ignore','preview','clear','edit','retry_edit'].includes(action))fail(400,'Unknown action');
  const all=items(b.id),selected=value.itemId?all.filter(r=>r.id===value.itemId):all;if(!selected.length)fail(400,'问答不属于此批次');
  if(['preview','clear','edit','retry_edit'].includes(action)){
   if(!value.itemId||selected.length!==1||value.revision!==b.revision)fail(409,'问答状态已变化，请刷新卡片');const r=selected[0];if(r.state!=='ready'||!fresh(r)||!['pending','imported','ignored'].includes(r.decision))fail(409,'问答或来源已失效，不能编辑');
   const text=['preview','edit'].includes(action)?edits.read(formValue):'';
   if(['preview','clear'].includes(action))return {toast:{type:'info',content:'仅预览，尚未发布'},card:{type:'raw',data:render(b,r.id,text)}};
   store.transaction(()=>{if(action==='edit')edits.save(r,text,actor);else store.run("UPDATE lark_group_qa SET edit_attempts=0,edit_retry_at=0,edit_error='',edited_by=? WHERE id=?",actor,r.id);store.run('UPDATE lark_group_qa_batches SET revision=revision+1 WHERE id=?',b.id);store.run('INSERT INTO callbacks VALUES(?,?)',eventId,store.now());});kick();return {toast:{type:'success',content:action==='edit'?'已保存，群消息等待更新':'已安排重试，请稍后刷新'},card:{type:'raw',data:render(store.get('SELECT * FROM lark_group_qa_batches WHERE id=?',b.id),r.id)}};
  }
  if(['import','ignore'].includes(action)){
   if(value.revision!==b.revision)fail(409,'问答状态已变化，请刷新卡片');
   const pending=selected.filter(r=>r.decision==='pending');if(pending.some(r=>!fresh(r)))fail(409,'消息或课程资料已变化，不能发布，请刷新');
   store.transaction(()=>{for(const r of pending){const id=action==='import'?importQuestion(r,context(r.course_id),actor):null;store.run('UPDATE lark_group_qa SET decision=?,question_id=? WHERE id=?',action==='import'?'imported':'ignored',id,r.id);if(action==='import'&&r.edit_revision>0)store.run('UPDATE lark_group_qa SET synced_revision=-1,edit_retry_at=0,edit_attempts=0 WHERE id=?',r.id);store.audit('lark:'+actor,'group_qa.'+action,{id:r.id,course:r.course_id,question:id});}store.run('UPDATE lark_group_qa_batches SET revision=revision+1 WHERE id=?',b.id);store.run('INSERT INTO callbacks VALUES(?,?)',eventId,store.now());});kick();
  }
  return {toast:{type:'success',content:action==='import'?'已补充到课程留言区':action==='ignore'?'已忽略':'已刷新'},card:{type:'raw',data:render(store.get('SELECT * FROM lark_group_qa_batches WHERE id=?',b.id),action==='detail'?value.itemId:null)}};
 }
 return {ask,force,handle,tick,kick,withdraw,render,describe:()=>({queued:store.get("SELECT COUNT(*) n FROM lark_group_qa WHERE state IN ('queued','answering','delivery')").n,pendingReview:store.get("SELECT COUNT(*) n FROM lark_group_qa WHERE state='ready' AND decision='pending'").n,imported:store.get("SELECT COUNT(*) n FROM lark_group_qa WHERE decision='imported'").n}),close:async()=>{closed=true;await running;}};
}
