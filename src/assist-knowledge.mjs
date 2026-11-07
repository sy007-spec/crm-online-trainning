// Optional private module; public core supplies storage and live authorization only.
export function assistKnowledge(store,{lib,materials,allowed,workerAllowed=()=>false,embedding}){
 if(!lib?.createKnowledge||!materials)return null;
 const worker=Symbol('worker');
 const authorize=ctx=>ctx.worker===worker?(!ctx.processing||!!store.get('SELECT 1 FROM assist_kb_settings WHERE library=? AND enabled=1',ctx.library))&&workerAllowed(ctx):allowed(ctx);
 const engine=lib.createKnowledge({db:{get:store.get,all:store.all,run:store.run,exec:s=>store.db.exec(s),transaction:store.transaction},model:o=>materials.model({...o,stage:'distillation'}),embed:embedding,authorize});
 store.db.exec('CREATE TABLE IF NOT EXISTS assist_kb_settings(library TEXT PRIMARY KEY,course TEXT NOT NULL,chat TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,background TEXT NOT NULL DEFAULT \'\',error TEXT,updated TEXT NOT NULL)');
 async function collect(ctx){
  if(!await authorize(ctx))throw Error('FORBIDDEN');
  const rows=ctx.chat?store.all('SELECT message_id id,time,text,thread_id thread,deleted FROM lark_classroom_messages WHERE course_id=? AND chat_id=? ORDER BY time LIMIT 10000',ctx.course,ctx.chat):store.all("SELECT d.id,CAST(strftime('%s',d.updated) AS INTEGER)*1000 time,r.markdown text,NULL thread,CASE WHEN d.archived_at IS NULL THEN 0 ELSE 1 END deleted FROM materials_documents d JOIN materials_revisions r ON r.document_id=d.id AND r.revision=d.head_revision WHERE d.library=? AND d.generated=0",ctx.course);
  if(ctx.chat)rows.push(...store.all("SELECT 'attachment:'||s.document_id id,m.time,r.markdown text,COALESCE(m.thread_id,m.message_id) thread,m.deleted FROM lark_classroom_sources s JOIN lark_classroom_messages m ON m.message_id=s.message_id AND m.chat_id=s.chat_id JOIN materials_documents d ON d.id=s.document_id JOIN materials_revisions r ON r.document_id=d.id AND r.revision=d.head_revision WHERE s.chat_id=? AND m.course_id=? AND d.library=? AND s.status='saved' AND d.archived_at IS NULL",ctx.chat,ctx.course,ctx.course));
  const messages=rows.flatMap(r=>{const chunks=[];for(let i=0;i<Math.max(1,r.text.length);i+=20000)chunks.push({...r,id:ctx.chat&&i===0?r.id:r.id+':'+i,text:r.text.slice(i,i+20000),thread:ctx.chat?r.thread:null,deleted:!!r.deleted});return chunks}).map(r=>({...r,thread:r.thread||(ctx.chat?null:r.id)}));
  if(messages.length>10000)throw Error('LIBRARY_MESSAGE_LIMIT');
  for(let i=0;i<messages.length;i+=1000)await engine.ingest(ctx,messages.slice(i,i+1000));await engine.reconcile(ctx,messages.map(r=>r.id));
  return {received:messages.length};
 }
 async function snapshot(ctx){const data=await engine.overview(ctx);if(!ctx.chat)data.materials=materials.engine.overview(ctx.course);materials.telemetry.snapshot(ctx.library,data);}
 let running=null;
 async function cycle(){for(const config of store.all('SELECT * FROM assist_kb_settings')){const ctx={tenant:'local',library:config.library,course:config.course,chat:config.chat,worker};if(!await authorize(ctx))continue;try{await snapshot(ctx);await collect(ctx);if(config.enabled){ctx.processing=true;await engine.process(ctx,{background:config.background});}store.run('UPDATE assist_kb_settings SET error=NULL,updated=? WHERE library=?',store.now(),ctx.library)}catch{store.run("UPDATE assist_kb_settings SET error='PROCESSING_FAILED',updated=? WHERE library=?",store.now(),ctx.library)}}}
 const tick=()=>running|| (running=cycle().finally(()=>running=null));
 async function handle(ctx,method,action,body={},query=new URLSearchParams()){
  if(!await allowed(ctx))throw Object.assign(Error('Forbidden'),{status:403});
  store.run('INSERT OR IGNORE INTO assist_kb_settings(library,course,chat,updated) VALUES(?,?,?,?)',ctx.library,ctx.course,ctx.chat||'',store.now());
  if(method==='GET'&&action==='sources')return {items:store.all("SELECT chat_id id,name FROM lark_classrooms WHERE course_id=? AND status='active' ORDER BY name",ctx.course)};
  if(method==='GET'&&action==='telemetry'){await snapshot(ctx);const obs=materials.telemetry.describe(ctx.library);if(!ctx.chat)obs.calls.push(...materials.telemetry.describe(ctx.course).calls);return {...obs,settings:store.get('SELECT enabled,background,error,updated FROM assist_kb_settings WHERE library=?',ctx.library)}};
  if(method==='POST'&&action==='settings'){if(!ctx.session?.admin)throw Object.assign(Error('Administrator required'),{status:403});if(typeof body.enabled!=='boolean'||typeof body.background!=='string'||body.background.length>10000)throw Error('INVALID_SETTINGS');store.run('UPDATE assist_kb_settings SET enabled=?,background=?,updated=? WHERE library=?',body.enabled?1:0,body.background,store.now(),ctx.library);return {saved:true};}
  if(method==='GET'&&action===''){await collect(ctx);return engine.list(ctx);}
  if(method==='GET'&&action==='overview')return engine.overview(ctx);
  if(method==='GET'&&action==='evidence')return engine.evidence(ctx,query.get('id'));
  if(method==='POST'&&action==='organize')return engine.organize(ctx,body.id,body);
  if(method==='POST'&&action==='retry')return engine.retry(ctx,body.fingerprint);
  if(method==='GET'&&action==='search'){await collect(ctx);return engine.search(ctx,query.get('q')||'');}
  if(method==='POST'&&action==='import')return engine.ingest(ctx,body.messages);
  if(method==='POST'&&action==='publish')return engine.publish(ctx,body.id);
  if(method==='POST'&&action==='export'){
   await collect(ctx);const card=(await engine.list(ctx)).cards.find(c=>c.id===body.id&&c.state==='published');if(!card)throw Error('PUBLISHED_CARD_REQUIRED');
   const id='kb_'+card.id,markdown=card.markdown+'\n\n来源消息：'+card.citations.join(', '),existing=store.get('SELECT id FROM materials_documents WHERE id=? AND library=?',id,ctx.course);
   if(existing){const current=materials.engine.get(ctx.course,id);if(current.markdown===markdown&&current.title===card.title)return {id,unchanged:true};return materials.engine.save(ctx.course,id,{baseRevision:current.headRevision,title:card.title,markdown,newRevision:true},'knowledge:export');}
   return materials.engine.create(ctx.course,{id,title:card.title,markdown,kind:'reference',generated:true,sourceRef:'knowledge:'+ctx.library+':'+card.id},'knowledge:export');
  }
  if(method==='POST'&&action==='process'){await collect(ctx);const config=store.get('SELECT background FROM assist_kb_settings WHERE library=?',ctx.library);return engine.process(ctx,{background:config.background,force:true});}
  if(method==='POST'&&action==='collect'){
   const rows=store.all('SELECT * FROM lark_classroom_messages WHERE course_id=? AND chat_id=? ORDER BY time LIMIT 2000',ctx.course,ctx.chat);
   return engine.ingest(ctx,rows.map(m=>({id:m.message_id,time:m.time,text:m.text,thread:m.thread_id,deleted:!!m.deleted})));
  }
  throw Object.assign(Error('Not found'),{status:404});
 }
 return {engine,handle,tick,close:async()=>{if(running)await running;}};
}
