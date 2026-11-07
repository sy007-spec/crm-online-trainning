// Administrator view: Feishu/Lark setup guide (shared web SDK) and the groups that act as classrooms.
import {esc} from './render.js';

export async function mountLarkGuide(host,{lang}){
 const {mountLarkSetup}=await import('/lark-setup.js');
 mountLarkSetup(host,{manifestUrl:'/api/admin/lark/setup',lang:lang==='zh'?'zh':'en',storageKey:'teach-lark-setup'});
}

const statusText=(s,t)=>({pending:t('待关联','Not linked'),active:t('课堂中','Active'),removed:t('机器人已移出','Bot removed')}[s]||s);
const courseName=(c,lang)=>esc((lang==='zh'?c.title?.zh:c.title?.en)||c.title?.zh||c.title?.en||c.id);

export async function renderLarkClassrooms({root,api,t,toast,lang,refresh=false}){
 const data=await api('/api/admin/lark/classrooms'+(refresh?'?refresh=1':''));
 const options=(selected)=>'<option value="">'+t('（不关联）','(not linked)')+'</option>'+data.courses.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===selected?' selected':'')+'>'+courseName(c,lang)+'</option>').join('');
 const rows=data.classrooms.map(c=>'<div class="lark-room" data-chat="'+esc(c.chat_id)+'">'
  +'<div><b>'+esc(c.name||t('未命名群','Unnamed chat'))+'</b> <span class="small muted">· '+esc(statusText(c.status,t))+'</span><div class="small muted">'+esc(c.chat_id)+(c.external?' · '+t('外部群，不可作为课堂','external, not allowed'):'')+'</div></div>'
  +'<label>'+t('课程','Course')+'<select data-field="course"'+(c.external?' disabled':'')+'>'+options(c.course_id)+'</select></label>'
  +'<div><div class="lark-opts"><label class="inline"><input type="checkbox" data-field="collect"'+(c.collect?' checked':'')+'>'+t('整理讨论','Digest')+'</label><label class="inline"><input type="checkbox" data-field="draft"'+(c.auto_draft?' checked':'')+'>'+t('自动更新草稿','Auto draft')+'</label><label class="inline"><input type="checkbox" data-field="cards"'+(c.cards!==0?' checked':'')+'>'+t('群主收每日卡片','Owner gets daily card')+'</label></div>'
  +(c.status==='active'?'<div class="small">'+t('群主（课堂管理员）：','Owner (classroom admin): ')+'<b>'+esc(c.owner_name||c.owner_open_id||t('读取中','pending'))+'</b> · <a href="#" data-act="members">'+t('课程名单 ','Roster ')+Number(c.members||0)+t(' 人',' people')+'</a></div><div class="lark-roster small muted" hidden></div>':'')
  +'<div class="small muted">'+t('讨论 ','Messages ')+Number(c.messages||0)+' · '+t('最近整理 ','Last digest ')+esc(c.last_digest||'—')+(c.last_draft_version?' · '+t('草稿 R','Draft R')+Number(c.last_draft_version):'')+'</div>'+(c.last_error?'<div class="notice small">'+esc(c.last_error)+'</div>':'')+'</div>'
  +'<div class="actions"><button data-act="save">'+t('保存','Save')+'</button><button data-act="digest"'+(c.status==='active'?'':' disabled')+'>'+t('立即整理并更新草稿','Digest & update draft')+'</button></div></div>').join('');
 root.innerHTML='<h2>'+t('飞书课堂群','Lark classroom groups')+'</h2>'
  +'<p class="muted">'+t('把课堂助手拉进飞书群，在这里选择关联的课程即可：群主自动成为课堂管理员（接收每日统计卡片、在卡片上审批访问、可让助手立即整理），群成员自动加入课程名单，用飞书登录后无需再申请即可访问课程；成员进出群会自动同步。','Add the classroom assistant to a Feishu/Lark group and pick the course here: the group owner becomes the classroom administrator (daily card, approvals, digest on demand) and members join the course roster, reading the course after signing in with Feishu/Lark; joins and leaves sync automatically.')+'</p>'
  +'<p class="muted">'+t('一个飞书/Lark 群就是一个培训课堂。群内讨论会去除寒暄、表情、重复与机器人消息，移除手机号、邮箱、证件号等个人信息并匿名发言人，每天整理为该课程的一份原始资料；资料变化后自动用全部原始资料更新课程草稿（同一份未发布草稿原地更新，最多每 6 小时一次）。发布和纳入 AI 答疑仍需讲师审核。','Each Feishu/Lark group is a training classroom. Discussions are cleaned (small talk, emoji, duplicates, bot messages and personal data removed; speakers anonymised) and saved daily as a course source; changed sources refresh the course draft (the same unpublished draft is updated, at most every 6 hours). Publishing and AI-tutor approval stay manual.')+'</p>'
  +(data.bot.verified?'<p class="small">'+t('课堂助手：','Classroom assistant: ')+'<b>'+esc(data.bot.name||'')+'</b></p>':'<p class="notice">'+t('请先按上方指引完成接入并保存凭证，课堂助手验证通过后才能接收群消息。','Finish the setup above and save verified credentials first.')+'</p>')
  +(data.refreshError?'<p class="notice">'+t('读取机器人所在群失败：','Could not list chats: ')+esc(data.refreshError)+'</p>':'')
  +'<div class="actions"><button id="larkChatsRefresh">'+t('从飞书刷新群列表','Refresh chats from Lark')+'</button></div>'
  +(rows?'<div class="lark-rooms">'+rows+'</div>':'<p class="muted">'+t('还没有群。把课堂助手拉进飞书群后点“刷新群列表”。','No chats yet. Add the classroom assistant to a group, then refresh.')+'</p>')
  +'<p class="small muted">'+t('群里 @课堂助手 发送“课堂”查看课堂概况；群主可发送“整理”立即整理今天的讨论。','In the group, @ the assistant with “课堂” for a status card; the group owner can send “整理” to digest today now.')+'</p>';
 const again=()=>renderLarkClassrooms({root,api,t,toast,lang});
 root.querySelector('#larkChatsRefresh').onclick=async()=>{try{await renderLarkClassrooms({root,api,t,toast,lang,refresh:true})}catch(e){toast(e.message)}};
 root.querySelectorAll('.lark-room[data-chat]').forEach(tr=>{
  const chatId=tr.dataset.chat,field=f=>tr.querySelector('[data-field="'+f+'"]');
  tr.querySelector('[data-act=save]').onclick=async()=>{try{const r=await api('/api/admin/lark/classrooms',{method:'PUT',body:{chatId,courseId:field('course').value||null,collect:field('collect').checked,autoDraft:field('draft').checked,cards:field('cards').checked}});toast(r.status==='active'?t('已关联：群主成为课堂管理员，群成员已加入课程名单','Linked: the owner is the classroom admin and members joined the roster'):t('已保存','Saved'));await again()}catch(e){toast(e.message)}};
  const members=tr.querySelector('[data-act=members]');if(members)members.onclick=async e=>{e.preventDefault();const box=tr.querySelector('.lark-roster');if(!box.hidden){box.hidden=true;return}try{const r=await api('/api/admin/lark/classrooms/members?chatId='+encodeURIComponent(chatId));box.textContent=r.members.map(m=>m.name||m.open_id).join('、')||t('暂无成员','No members');box.hidden=false}catch(err){toast(err.message)}};
  tr.querySelector('[data-act=digest]').onclick=async e=>{e.target.disabled=true;e.target.textContent=t('整理中…','Working…');try{const r=await api('/api/admin/lark/classrooms/digest',{method:'POST',body:{chatId,draft:true}});const d=r.digest,dr=r.draft;toast((d.state==='saved'?t('已整理 ','Digested ')+d.kept+'/'+d.input:d.state==='unchanged'?t('讨论无变化','No new discussion'):t('今天暂无讨论','No discussion today'))+(dr?' · '+(dr.state==='drafted'?t('草稿已更新 R','Draft updated R')+dr.version:dr.state==='failed'?t('草稿更新失败：','Draft failed: ')+dr.error:t('草稿无需更新','Draft unchanged')):''));await again()}catch(err){toast(err.message);await again()}};
 });
}
