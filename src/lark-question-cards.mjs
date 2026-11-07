import {digest,uid,fail} from './security.mjs';
import {larkSettings} from './lark.mjs';

// Card Markdown is deliberately narrower than classroom Markdown: no mentions or remote images.
const excerpt=value=>{const text=String(value||'');return text.length>1000?text.slice(0,1000)+'\n\n（预览节选；完整内容请在编辑框或课堂查看）':text};
const md=value=>String(value||'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'[图片：$1]').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function larkQuestionCards(store,{lark,origin,discussions,owners=()=>[],allowed=()=>false,active=()=>true,aiView}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS lark_question_cards(id TEXT PRIMARY KEY,question_id TEXT NOT NULL REFERENCES questions(id),destination TEXT NOT NULL,message_id TEXT,revision INTEGER NOT NULL DEFAULT 0,draft TEXT,source TEXT NOT NULL DEFAULT '',hash TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,error TEXT,UNIQUE(question_id,destination));
 CREATE TABLE IF NOT EXISTS lark_question_notifications(question_id TEXT PRIMARY KEY REFERENCES questions(id),dirty INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS lark_question_replies(question_id TEXT PRIMARY KEY REFERENCES questions(id),reply_id TEXT NOT NULL REFERENCES questions(id),revision INTEGER NOT NULL,source TEXT NOT NULL,actor TEXT NOT NULL);`);
 store.db.exec(`DROP TRIGGER IF EXISTS lark_question_insert; DROP TRIGGER IF EXISTS lark_question_update; DROP TRIGGER IF EXISTS lark_question_privacy; CREATE TRIGGER lark_question_insert AFTER INSERT ON questions WHEN NEW.user_id NOT LIKE 'lark-reply:%' BEGIN INSERT INTO lark_question_notifications VALUES(NEW.id,1) ON CONFLICT(question_id) DO UPDATE SET dirty=1; END;
 CREATE TRIGGER IF NOT EXISTS lark_question_update AFTER UPDATE OF body,removed ON questions BEGIN INSERT INTO lark_question_notifications SELECT id,1 FROM questions WHERE (id=NEW.id OR root_id=NEW.id) AND user_id NOT LIKE 'lark-reply:%' ON CONFLICT(question_id) DO UPDATE SET dirty=1; INSERT INTO lark_question_notifications SELECT question_id,1 FROM lark_question_replies WHERE reply_id=NEW.id ON CONFLICT(question_id) DO UPDATE SET dirty=1; END;
 CREATE TRIGGER IF NOT EXISTS lark_question_privacy AFTER UPDATE OF visibility ON discussion_context BEGIN INSERT INTO lark_question_notifications SELECT id,1 FROM questions WHERE (id=NEW.root_id OR root_id=NEW.root_id) AND user_id NOT LIKE 'lark-reply:%' ON CONFLICT(question_id) DO UPDATE SET dirty=1; END;`);
 let running=null,closed=false;
 const question=id=>store.get('SELECT * FROM questions WHERE id=?',id);
 const source=q=>digest(JSON.stringify([q.body,q.removed,discussions.root(q).removed,discussions.meta(q).visibility]));
 const live=q=>!!q&&!q.removed&&!discussions.root(q).removed&&!!store.get('SELECT id FROM courses WHERE id=? AND enabled=1',q.course_id)&&active();
 const publicQuestion=q=>live(q)&&discussions.meta(q).visibility==='public';
 const destinations=q=>{const cfg=larkSettings(store);if(!cfg.enabled||!active())return [];return [...new Set([...String(cfg.receiveId||'').split(',').map(v=>v.trim()).filter(Boolean).map(id=>(cfg.receiveType||'chat_id')+':'+id),...owners(q.course_id).map(id=>'open_id:'+id)])]};
 const response=q=>store.get('SELECT r.*,q.body,q.removed FROM lark_question_replies r JOIN questions q ON q.id=r.reply_id WHERE r.question_id=?',q.id);
 function ai(q){if(aiView)return aiView(q);const a=store.get('SELECT * FROM ai_answers WHERE question_id=?',q.id);if(!a||a.fingerprint!==digest(q.body))return null;return a;}
 function editor(q,row){if(row.draft!==null&&row.source===source(q))return row.draft;const r=response(q);if(r&&!r.removed&&r.source===source(q))return r.body;const a=ai(q);return a?.status==='answered'?a.body:'';}
 function render(row){const q=question(row.question_id),safe=publicQuestion(q),r=q?response(q):null,answer=safe?editor(q,row):'',a=safe?ai(q):null;
  const value={cardId:row.id,revision:row.revision,source:q?source(q):'',replyRevision:r?.revision||0};
  const button=(name,text,action)=>({tag:'button',name,text:{tag:'plain_text',content:text},type:action==='question_publish'?'primary':'default',form_action_type:'submit',behaviors:[{type:'callback',value:{...value,action}}]});
  const details=safe?'课程：'+Object.values(JSON.parse(store.get('SELECT title FROM courses WHERE id=?',q.course_id).title)).join(' / ')+' · '+(store.get('SELECT name FROM users WHERE id=?',q.user_id)?.name||'学员')+' · '+q.created:'';
  const elements=[...(safe?[{tag:'markdown',content:md(details)}]:[]),{tag:'markdown',content:safe?'**课堂留言 / Classroom message**\n'+md(excerpt(q.body||'（图片留言，请打开课堂查看原图）')):'此留言已删除、受限或为私密内容，请在课堂中按原权限查看。'}];
  if(safe){elements.push({tag:'markdown',content:'**'+(r&&!r.removed&&r.source===source(q)?'讲师回复 / Instructor reply':a?.status==='answered'?'AI 草稿，可修改后发布 / Editable AI draft':'人工回复可直接填写 / Manual reply available')+'**\n'+(answer?md(excerpt(answer)):'尚无可用回复；不依赖 AI 即可回复。')});
   if(answer.length<=4000){const chars=Array.from(answer),parts=Array.from({length:4},(_,i)=>chars.slice(i*1000,(i+1)*1000).join(''));
    elements.push({tag:'form',name:'reply_form',elements:[{tag:'markdown',content:'**Markdown 编辑** · 四段按顺序拼接；预览不会发布，点击发布才更新课堂。'},...parts.map((text,i)=>({tag:'input',name:'reply_'+i,input_type:'multiline_text',default_value:text,max_length:1000,placeholder:{tag:'plain_text',content:'回复第 '+(i+1)+' 段（最多 1000 字）'},width:'fill'})),button('preview','预览 Markdown','question_preview'),button('publish','发布讲师回复','question_publish')]});
   }else elements.push({tag:'markdown',content:'原 AI 回复超过课堂 4000 字限制，上方仅为节选。完整原文保留在课堂；可点击下方清空编辑后填写精简回复。'});
   elements.push({tag:'button',text:{tag:'plain_text',content:'刷新 / 清空编辑'},behaviors:[{type:'callback',value:{...value,action:'question_reset'}}]});
  }
  elements.push({tag:'button',text:{tag:'plain_text',content:'打开课堂 / Open classroom'},behaviors:[{type:'open_url',default_url:origin+'/?question='+encodeURIComponent(q?.id||'')}]});
  return {schema:'2.0',config:{update_multi:true},header:{template:'blue',title:{tag:'plain_text',content:'课堂留言与回复 / Classroom discussion'}},body:{elements}};
 }
 function enqueue(id){const q=question(id);if(!q)return;store.run('INSERT OR REPLACE INTO lark_question_notifications VALUES(?,1)',id);const targets=destinations(q);for(const destination of targets)store.run('INSERT OR IGNORE INTO lark_question_cards(id,question_id,destination) VALUES(?,?,?)',uid(),id,destination);store.run("UPDATE lark_question_cards SET state='pending',attempts=0,retry_at=0 WHERE question_id=?",id);if(targets.length)store.run('UPDATE lark_question_notifications SET dirty=0 WHERE question_id=?',id);}
 function changed(id){const q=question(id);if(!q)return;for(const row of store.all("SELECT id FROM questions WHERE (id=? OR root_id=?) AND user_id NOT LIKE 'lark-reply:%'",id,q.root_id||q.id))enqueue(row.id);kick();}
 async function flush(){if(closed)return;for(const pending of store.all('SELECT question_id FROM lark_question_notifications WHERE dirty=1'))enqueue(pending.question_id);for(const row of store.all("SELECT * FROM lark_question_cards WHERE state='pending' AND retry_at<=? ORDER BY retry_at,id LIMIT 30",Date.now())){
   if(closed)break;const q=question(row.question_id);if(!q)continue;
   const stillDestination=destinations(q).includes(row.destination);if(!stillDestination||!active()){continue;}
   // New private messages have only a redacted notification; removed messages only update existing cards.
   if(!live(q)&&!row.message_id){store.run("UPDATE lark_question_cards SET state='cancelled' WHERE id=?",row.id);continue;}
   try{const content=JSON.stringify(render(row)),hash=digest(content);if(hash!==row.hash){if(row.message_id)await lark.api('im/v1/messages/'+encodeURIComponent(row.message_id),{method:'PATCH',body:{content}});else{const split=row.destination.indexOf(':'),type=row.destination.slice(0,split),id=row.destination.slice(split+1);const result=await lark.api('im/v1/messages?receive_id_type='+type,{method:'POST',body:{receive_id:id,msg_type:'interactive',content,uuid:digest(origin+':question:'+row.id).slice(0,32)}});store.run('UPDATE lark_question_cards SET message_id=? WHERE id=?',result.message_id,row.id);}}
    // A comment/AI answer may have changed during the network call; retain a pending update.
    const current=store.get('SELECT * FROM lark_question_cards WHERE id=?',row.id),same=digest(JSON.stringify(render(current)))===hash;
    store.run('UPDATE lark_question_cards SET hash=?,state=?,error=NULL WHERE id=?',hash,same?'sent':'pending',row.id);
   }catch{store.run("UPDATE lark_question_cards SET attempts=attempts+1,retry_at=?,error='DELIVERY_FAILED' WHERE id=?",Date.now()+Math.min(1800000,60000*2**Math.min(row.attempts,5)),row.id);}
  }}
 const tick=()=>running||(running=flush().finally(()=>{running=null}));
 function kick(){queueMicrotask(()=>tick().catch(()=>{}));}
 function handle({eventId,actor,value,formValue={},messageId}){
  const row=store.get('SELECT * FROM lark_question_cards WHERE id=?',String(value.cardId||'')),q=row&&question(row.question_id);
  if(!row||!messageId||row.message_id!==messageId||!publicQuestion(q)||!destinations(q).includes(row.destination)||!allowed(actor,q.course_id))fail(403,'卡片已失效或无课程回复权限 / Card unavailable or course permission denied');
  if(!eventId)fail(400,'Event ID required');
  if(store.get('SELECT id FROM callbacks WHERE id=?',eventId))return {toast:{type:'info',content:'已处理 / Already processed'}};
  const r=response(q);if(value.action!=='question_reset'&&(value.revision!==row.revision||value.source!==source(q)||value.replyRevision!==(r?.revision||0)))fail(409,'留言或回复已更新，请刷新卡片 / Message changed; refresh the card');
  let draft='';if(value.action!=='question_reset'){for(let i=0;i<4;i++){const part=formValue['reply_'+i];if(typeof part!=='string'||Array.from(part).length>1000)fail(400,'Invalid Markdown input');draft+=part;}draft=draft.trim();if(!draft||draft.length>4000)fail(400,'回复须为 1–4000 字 / Reply requires 1–4000 characters');}
  store.transaction(()=>{
   if(value.action==='question_publish'){
    const user='lark-reply:'+digest(actor).slice(0,32);store.run('INSERT OR IGNORE INTO users(id,device_hash,name,created) VALUES(?,?,?,?)',user,user,'飞书讲师 / Lark instructor',store.now());
    let reply=r?.reply_id;if(reply){store.run('INSERT INTO question_edits VALUES(?,?,?,?,?,?,?)',uid(),reply,'lark_review',r.body,draft,'lark:'+actor,store.now());store.run('UPDATE questions SET body=?,removed=0 WHERE id=?',draft,reply);}else{reply=uid();store.run('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',reply,q.course_id,q.page_id,user,q.id,q.root_id||q.id,draft,1,0,0,store.now(),q.material_version,'discussion');discussions.save(reply,null,null,q.page_id,discussions.view(q).language);}
    store.run('INSERT INTO lark_question_replies VALUES(?,?,?,?,?) ON CONFLICT(question_id) DO UPDATE SET revision=excluded.revision,source=excluded.source,actor=excluded.actor',q.id,reply,(r?.revision||0)+1,source(q),actor);
    store.audit('lark:'+actor,'question.card_replied',{question:q.id,reply,course:q.course_id,revision:(r?.revision||0)+1});
    store.run("UPDATE lark_question_cards SET draft=NULL,revision=revision+1,state='pending',retry_at=0 WHERE question_id=?",q.id);
   }else if(!['question_preview','question_reset'].includes(value.action))fail(400,'Unknown question action');
   if(value.action!=='question_publish')store.run("UPDATE lark_question_cards SET draft=?,source=?,revision=revision+1,state='pending',retry_at=0 WHERE id=?",value.action==='question_reset'?(ai(q)?.body?.length>4000?'':null):draft,source(q),row.id);
   store.run('INSERT INTO callbacks VALUES(?,?)',eventId,store.now());
  });kick();return {toast:{type:'success',content:value.action==='question_publish'?'已发布讲师回复 / Reply published':'预览已更新，尚未发布 / Preview only'},card:{type:'raw',data:render(store.get('SELECT * FROM lark_question_cards WHERE id=?',row.id))}};
 }
 return {enqueue,changed,kick,tick,handle,render,describe:()=>({pending:store.get("SELECT COUNT(*) n FROM lark_question_cards WHERE state='pending'").n,unconfigured:store.get('SELECT COUNT(*) n FROM lark_question_notifications WHERE dirty=1').n,failed:store.get("SELECT COUNT(*) n FROM lark_question_cards WHERE error IS NOT NULL").n,sent:store.get("SELECT COUNT(*) n FROM lark_question_cards WHERE state='sent'").n}),close:async()=>{closed=true;await running;}};
}
