// Feishu/Lark classrooms: one group = one training classroom (course).
// Group discussion is collected, cleaned (noise, duplicates, bots and personal data removed; speakers pseudonymous) and saved
// once per classroom per day as a reference source of the course. When the digest changes, the course draft is regenerated
// from all reference sources: the classroom's own never-published draft is updated in place, otherwise a new draft is saved.
// Nothing is ever published or approved for the AI tutor automatically. Spec: LARK_CLASSROOM_SPEC.md.
// The Feishu/Lark layer is the private lark-feishu-assist module, injected by the hosting platform as `lib`
// (paid add-on); this public repository never imports it directly.
import {dayKey,digest} from './security.mjs';
import {larkSettings,larkDomain} from './lark.mjs';

const DAY_MS=86400000,QUIET_MS=10*60000,DRAFT_INTERVAL_MS=6*3600000,TEXT_MAX=8000;
const shanghaiDay=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const dayStart=day=>Date.parse(day+'T00:00:00+08:00');

export function larkClassroom(store,{lib,preparation,generateDraft,origin,brief=()=>'',fetch,now=Date.now}){
 const {createAssistant,cleanDiscussion,discussionMarkdown,cards}=lib;
 let clientValue=null,clientKey='';
 const larkClient=()=>{const c=larkSettings(store);if(!c.appId||!c.appSecret)throw Error('Lark app credentials missing');const key=[larkDomain(c),c.appId,c.appSecret].join('\u0000');if(!clientValue||clientKey!==key){clientValue=lib.createLarkClient({domain:larkDomain(c),appId:c.appId,appSecret:c.appSecret,fetch});clientKey=key}return clientValue};
 store.db.exec(`CREATE TABLE IF NOT EXISTS lark_classrooms(chat_id TEXT PRIMARY KEY,course_id TEXT,name TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',collect INTEGER NOT NULL DEFAULT 1,auto_draft INTEGER NOT NULL DEFAULT 1,external INTEGER NOT NULL DEFAULT 0,last_draft_at TEXT,last_draft_version INTEGER,last_error TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lark_classroom_messages(message_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,course_id TEXT NOT NULL,sender TEXT NOT NULL,sender_type TEXT NOT NULL,type TEXT NOT NULL,text TEXT NOT NULL,thread_id TEXT,mentions_bot INTEGER NOT NULL DEFAULT 0,time INTEGER NOT NULL,day TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,received TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS lark_classroom_messages_day ON lark_classroom_messages(chat_id,day);
 CREATE TABLE IF NOT EXISTS lark_classroom_digests(chat_id TEXT,day TEXT,document_id TEXT,kept INTEGER,input INTEGER,fingerprint TEXT,drafted INTEGER NOT NULL DEFAULT 0,updated TEXT,PRIMARY KEY(chat_id,day));`);
 const row=chat=>store.get('SELECT * FROM lark_classrooms WHERE chat_id=?',chat);
 const active=chat=>{const r=row(chat);return r&&r.status==='active'&&r.course_id&&store.get('SELECT id FROM courses WHERE id=?',r.course_id)?r:null};
 const discover=(chat,name='',external=false)=>store.run("INSERT INTO lark_classrooms(chat_id,name,external,created,updated) VALUES(?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE lark_classrooms.name END,status=CASE WHEN lark_classrooms.status='removed' THEN CASE WHEN lark_classrooms.course_id IS NULL THEN 'pending' ELSE 'active' END ELSE lark_classrooms.status END,updated=excluded.updated",chat,String(name).slice(0,200),external?1:0,store.now(),store.now());
 const record=(item,courseId,{question=false}={})=>{
  const text=String(item.text||(item.file?.name?'【附件】'+item.file.name:'')).slice(0,TEXT_MAX),time=Number(item.time)||now();
  store.run('INSERT OR IGNORE INTO lark_classroom_messages(message_id,chat_id,course_id,sender,sender_type,type,text,thread_id,mentions_bot,time,day,received) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',item.messageId,item.chatId,courseId,item.sender?.openId||'',item.sender?.type||'user',item.type||'text',text,item.threadId||null,question?1:0,time,shanghaiDay(time),store.now());
 };
 const admins=()=>new Set(larkSettings(store).adminOpenIds||[]);

 function statusCard(r){
  const c=store.get('SELECT * FROM courses WHERE id=?',r.course_id),title=(()=>{try{const t=JSON.parse(c.title);return t.zh||t.en||c.id}catch{return c.id}})();
  const today=store.get('SELECT COUNT(*) n FROM lark_classroom_messages WHERE chat_id=? AND day=? AND deleted=0',r.chat_id,dayKey()).n,last=store.get('SELECT * FROM lark_classroom_digests WHERE chat_id=? ORDER BY day DESC LIMIT 1',r.chat_id);
  return cards.reportCard({title:'课堂 / Classroom · '+title,template:'turquoise',metrics:[{label:'今日讨论 / Today',value:today},{label:'已发布版本 / Published',value:'R'+(c.published||0)},{label:'草稿版本 / Draft',value:c.draft>c.published?'R'+c.draft:'—'},{label:'最近整理 / Last digest',value:last?last.day+' · '+last.kept+'/'+last.input:'—'}],...(brief(r.course_id)?{sections:[{title:'关键说明 / Key description',lines:[brief(r.course_id).split('\n')[0]]}]}:{}),footnote:'讨论按关键说明每天自动整理进课程资料并更新草稿；发布仍需讲师审核。Discussions are digested daily into course sources and drafts; publishing stays manual.',link:{text:'打开课堂 / Open classroom',url:origin+'/'}});
 }

 let assistantValue=null,assistantKey='';
 function assistant(){
  const c=larkSettings(store),key=[c.region,c.appId,c.appSecret,c.botOpenId].join('\u0000');
  if(assistantValue&&assistantKey===key)return assistantValue;
  const client=larkClient();assistantKey=key;
  assistantValue=createAssistant({client,botOpenId:c.botOpenId||undefined,
   seen:id=>store.db.prepare('INSERT OR IGNORE INTO callbacks VALUES(?,?)').run('lark:'+id,store.now()).changes===1,
   resolveChat:async m=>{const r=active(m.chatId);if(!r){discover(m.chatId);return null}return {projectId:r.course_id,name:r.name,brief:brief(r.course_id),collect:!!r.collect,external:!!r.external,externalAllowed:false}},
   knowledge:{save:async item=>record(item,item.projectId)},
   commands:[
    {names:['课堂','统计','stats','class'],description:'本课堂概况 / Classroom status',scope:'group',run:async ctx=>({card:statusCard(active(ctx.message.chatId))})},
    {names:['整理','digest'],description:'立即整理今天的讨论（管理员）/ Digest today now (admins)',scope:'group',run:async ctx=>{if(!admins().has(ctx.sender.openId))return '只有后台登记的飞书管理员可以触发整理。Only registered administrators can trigger a digest.';const r=await distill(ctx.message.chatId,dayKey());return r.state==='saved'?`已整理 ${r.kept}/${r.input} 条讨论，保存为课程资料“${r.title}”。`:r.state==='unchanged'?'今天的讨论没有新内容。Nothing new today.':'今天还没有可整理的讨论。No discussion to digest yet.'}},
   ],
   // A question to the bot is part of the class discussion: keep it for the digest and tell the asker where it goes.
   answer:async(question,ctx)=>{if(ctx.scope!=='group'||!ctx.chat)return '请在已关联课程的课堂群里 @我 提问，或发送“帮助”。Ask in a classroom group, or send "help".';record({...ctx.message,text:question},ctx.chat.projectId,{question:true});return '已记录到课堂讨论，讲师整理课程时会参考。Recorded for the instructor.'},
   onBotAdded:async e=>{discover(e.chatId,e.chatName,e.external);try{await client.sendText({type:'chat_id',id:e.chatId},'我是 TeachInPublic 课堂助手。管理员在后台“飞书课堂与卡片”中把本群关联到课程后，群内讨论会每天整理进课程资料并更新草稿（发布需讲师审核）。@我 发送“帮助”查看命令。',`welcome:${e.chatId}`.slice(0,50))}catch{/* welcome is best effort */}},
   onRemoved:async ref=>{if(ref.kind==='message')store.run('UPDATE lark_classroom_messages SET deleted=1 WHERE message_id=?',ref.messageId);else store.run("UPDATE lark_classrooms SET status='removed',updated=? WHERE chat_id=?",store.now(),ref.chatId)},
   onError:e=>store.set('larkClassroomLastError',{code:e.code||e.message,at:store.now()}),
  });
  return assistantValue;
 }

 /** Digest one classroom-day into a course reference source. Returns {state:'saved'|'unchanged'|'empty'|'inactive'}. */
 async function distill(chat,day){
  const r=active(chat);if(!r)return {state:'inactive'};
  const messages=store.all('SELECT * FROM lark_classroom_messages WHERE chat_id=? AND day=? AND course_id=? ORDER BY time',chat,day,r.course_id);
  const cleaned=cleanDiscussion(messages.map(m=>({messageId:m.message_id,text:m.text,time:m.time,sender:{openId:m.sender,type:m.sender_type},threadId:m.thread_id||undefined,deleted:!!m.deleted,mentionsBot:!!m.mentions_bot})),{brief:brief(r.course_id)});
  const old=store.get('SELECT * FROM lark_classroom_digests WHERE chat_id=? AND day=?',chat,day);
  if(!cleaned.stats.kept&&!old)return {state:'empty'};
  const title=('飞书课堂讨论 · '+(r.name||chat)+' · '+day).slice(0,120);
  const markdown=cleaned.stats.kept?discussionMarkdown({title:'飞书课堂讨论 · '+(r.name||'课堂群'),period:day,topics:cleaned.topics,stats:cleaned.stats,source:'飞书/Lark 课堂群'}):'# '+title+'\n\n> 当天讨论已全部撤回或被过滤。';
  const fingerprint=digest(markdown);if(old?.fingerprint===fingerprint)return {state:'unchanged'};
  let doc=null;if(old?.document_id)doc=store.get('SELECT id,revision FROM preparation_documents WHERE course_id=? AND id=?',r.course_id,old.document_id);
  const saved=preparation.save(r.course_id,{...(doc?{id:doc.id,baseRevision:doc.revision}:{}),kind:'reference',title,raw:markdown,language:'zh',source_ref:'lark:'+chat+':'+day},'lark:classroom');
  store.run('INSERT INTO lark_classroom_digests(chat_id,day,document_id,kept,input,fingerprint,drafted,updated) VALUES(?,?,?,?,?,?,0,?) ON CONFLICT(chat_id,day) DO UPDATE SET document_id=excluded.document_id,kept=excluded.kept,input=excluded.input,fingerprint=excluded.fingerprint,drafted=0,updated=excluded.updated',chat,day,saved.id,cleaned.stats.kept,cleaned.stats.input,fingerprint,store.now());
  store.audit('lark:classroom','lark.classroom_digested',{chat,day,course:r.course_id,kept:cleaned.stats.kept,input:cleaned.stats.input});
  return {state:'saved',documentId:saved.id,title,kept:cleaned.stats.kept,input:cleaned.stats.input,stats:cleaned.stats};
 }

 /** Regenerates the course draft when a digest changed since the last draft, at most once per interval. */
 async function draft(chat,{force=false}={}){
  const r=active(chat);if(!r||!r.auto_draft&&!force)return {state:'disabled'};
  if(!store.get('SELECT 1 FROM lark_classroom_digests WHERE chat_id=? AND drafted=0',chat))return {state:'unchanged'};
  if(!force&&r.last_draft_at&&now()-Date.parse(r.last_draft_at)<DRAFT_INTERVAL_MS)return {state:'waiting'};
  try{
   const result=await generateDraft(r.course_id,{replaceVersion:r.last_draft_version||null});
   store.run('UPDATE lark_classrooms SET last_draft_at=?,last_draft_version=?,last_error=NULL,updated=? WHERE chat_id=?',new Date(now()).toISOString(),result.version,store.now(),chat);
   store.run('UPDATE lark_classroom_digests SET drafted=1 WHERE chat_id=?',chat);
   store.audit('lark:classroom','lark.classroom_draft_updated',{chat,course:r.course_id,version:result.version,replaced:!!result.replaced});
   return {state:'drafted',version:result.version,replaced:!!result.replaced};
  }catch(e){store.run('UPDATE lark_classrooms SET last_error=?,last_draft_at=?,updated=? WHERE chat_id=?',String(e.message).slice(0,300),new Date(now()).toISOString(),store.now(),chat);return {state:'failed',error:e.message}}
 }

 let busy=false,lastTick=0;
 /** Scheduler step: digest classroom-days that went quiet (or ended), then refresh drafts. */
 async function tick({force=false}={}){
  if(busy||!force&&now()-lastTick<5*60000)return;busy=true;lastTick=now();
  try{
   for(const r of store.all("SELECT * FROM lark_classrooms WHERE status='active' AND course_id IS NOT NULL")){
    const days=store.all('SELECT m.day,MAX(m.time) last FROM lark_classroom_messages m LEFT JOIN lark_classroom_digests d ON d.chat_id=m.chat_id AND d.day=m.day WHERE m.chat_id=? AND m.day>=? AND (d.updated IS NULL OR m.received>d.updated) GROUP BY m.day',r.chat_id,shanghaiDay(now()-2*DAY_MS));
    for(const d of days)if(now()-d.last>QUIET_MS||dayStart(d.day)+DAY_MS<=now()){try{await distill(r.chat_id,d.day)}catch(e){store.run('UPDATE lark_classrooms SET last_error=? WHERE chat_id=?',String(e.message).slice(0,300),r.chat_id)}}
    await draft(r.chat_id);
   }
  }finally{busy=false}
 }

 function list(){return store.all('SELECT c.*,(SELECT COUNT(*) FROM lark_classroom_messages m WHERE m.chat_id=c.chat_id AND m.deleted=0) messages,(SELECT MAX(day) FROM lark_classroom_digests d WHERE d.chat_id=c.chat_id) last_digest FROM lark_classrooms c ORDER BY c.status,c.updated DESC')}
 function bind(chat,{courseId,collect,autoDraft,name}){
  if(!/^oc_[A-Za-z0-9_-]{4,80}$/.test(String(chat)))throw Object.assign(Error('Valid chat ID required'),{status:400});
  if(courseId&&!store.get('SELECT id FROM courses WHERE id=?',courseId))throw Object.assign(Error('Course not found'),{status:404});
  discover(chat,name||'');const r=row(chat);
  if(r.external&&courseId)throw Object.assign(Error('External chats cannot be classrooms'),{status:409});
  store.run('UPDATE lark_classrooms SET course_id=?,status=?,collect=?,auto_draft=?,updated=? WHERE chat_id=?',courseId||null,courseId?'active':'pending',collect===false?0:1,autoDraft===false?0:1,store.now(),chat);
  return row(chat);
 }
 async function chats(){const remote=await larkClient().listChats();for(const c of remote)discover(c.id,c.name,c.external);return list()}
 return {assistant,handle:payload=>assistant().handle(payload),distill,draft,tick,list,bind,chats};
}
