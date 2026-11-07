import {uid,digest,fail} from './security.mjs';
export function groupReplyText(r,revision){const refs=JSON.parse(r.sources).map((s,i)=>'['+(i+1)+'] '+(s.title&&typeof s.title==='object'?(s.title.zh||s.title.en||s.id||'课程资料'):(s.title||s.pageTitle||s.id||'课程资料'))).join('\n');return (r.answer_status==='manual'?'群管理员修订回复':'群内 AI 回答（经管理员确认，课程 R'+revision+'）')+'\n\n'+r.answer+(refs?'\n\n引用来源：\n'+refs:'')}
export function larkGroupEdits(store,{lark,fresh,recipients,now}){
 const columns=store.all('PRAGMA table_info(lark_group_qa)').map(x=>x.name);
 for(const [name,type] of [['edit_revision','INTEGER NOT NULL DEFAULT 0'],['synced_revision','INTEGER NOT NULL DEFAULT 0'],['edit_retry_at','INTEGER NOT NULL DEFAULT 0'],['edit_attempts','INTEGER NOT NULL DEFAULT 0'],['edit_error',"TEXT NOT NULL DEFAULT ''"],['edited_by','TEXT']])if(!columns.includes(name))store.db.exec('ALTER TABLE lark_group_qa ADD COLUMN '+name+' '+type);
 store.db.exec('CREATE TABLE IF NOT EXISTS lark_group_qa_edits(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,revision INTEGER NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL,before_answer TEXT NOT NULL,after_answer TEXT NOT NULL,before_status TEXT NOT NULL,before_sources TEXT NOT NULL)');
 function read(form){let text='';for(let i=0;i<4;i++){const p=form?.['reply_'+i];if(typeof p!=='string'||Array.from(p).length>1000)fail(400,'请填写有效的 Markdown 回复');text+=p}text=text.trim();if(!text||text.length>4000)fail(400,'回复须为 1–4000 字');return text}
 function save(r,text,actor){
  const next={...r,answer:text,answer_status:'manual',sources:'[]'};
  if(r.question_id){
   const q=store.get('SELECT * FROM questions WHERE id=?',r.question_id),visibility=store.get('SELECT visibility FROM discussion_context WHERE root_id=?',r.question_id)?.visibility;
   if(!q||q.removed||q.body!==r.question||visibility!=='public')fail(409,'课堂留言已删除或改变可见范围，不能覆盖');
   const user='lark-reply:group-'+digest(r.chat_id).slice(0,32),rows=store.all('SELECT * FROM questions WHERE root_id=? AND parent_id=? AND user_id=? AND teacher=1 ORDER BY rowid',q.id,q.id,user);
   const expected=['answered','manual'].includes(r.answer_status)?groupReplyText(r,q.material_version):'';
   if(rows[0]?.removed||rows.filter(x=>!x.removed).map(x=>x.body).join('')!==expected)fail(409,'课堂回复已被其他人修改，请先核对，不能覆盖');
   let body=groupReplyText(next,q.material_version),index=0;
   while(body){let end=Math.min(3500,body.length);if(/[\uD800-\uDBFF]/.test(body[end-1])&&end<body.length)end--;const part=body.slice(0,end);body=body.slice(end);const old=rows[index++];if(old)store.run('UPDATE questions SET body=?,removed=0 WHERE id=?',part,old.id);else{const id=uid();store.run('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,q.course_id,q.page_id,user,q.id,q.id,part,1,0,0,store.now(),q.material_version,'discussion')}}
   for(const old of rows.slice(index))store.run('UPDATE questions SET removed=1 WHERE id=?',old.id);
  }
  store.run('INSERT INTO lark_group_qa_edits VALUES(?,?,?,?,?,?,?,?,?)',uid(),r.id,r.edit_revision+1,actor,store.now(),r.answer,text,r.answer_status,r.sources);
  store.run("UPDATE lark_group_qa SET answer=?,answer_status='manual',sources='[]',edit_revision=edit_revision+1,edited_by=?,edit_retry_at=0,edit_attempts=0,edit_error='' WHERE id=?",text,actor,r.id);
  store.audit('lark:'+actor,'group_qa.edit',{id:r.id,revision:r.edit_revision+1,question:r.question_id});
 }
 async function flush(){for(const r of store.all("SELECT * FROM lark_group_qa WHERE edit_revision>synced_revision AND state='ready' AND edit_attempts<5 AND edit_retry_at<=?",now())){
  if(!fresh(r)||!recipients(r).includes(r.edited_by))continue;
  try{if(!r.reply_message_id)throw Error('missing reply');await lark.api('im/v1/messages/'+encodeURIComponent(r.reply_message_id),{method:'PUT',body:{msg_type:'text',content:JSON.stringify({text:'【群管理员修订回复】\n'+r.answer+'\n\n'+(r.decision==='imported'?'（已同步课程留言）':'（尚未加入课程留言，待管理员审核）')})}});store.run("UPDATE lark_group_qa SET synced_revision=?,edit_error='',edit_attempts=0 WHERE id=? AND edit_revision=?",r.edit_revision,r.id,r.edit_revision)}
  catch{store.run("UPDATE lark_group_qa SET edit_error='UPDATE_FAILED',edit_attempts=edit_attempts+1,edit_retry_at=? WHERE id=? AND edit_revision=?",now()+Math.min(3600000,60000*2**r.edit_attempts),r.id,r.edit_revision)}
 }}
 return {read,save,flush};
}
