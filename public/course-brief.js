// Course key description editor (课程关键说明): shown publicly as the course introduction, used to keep drafts and the
// Feishu/Lark classroom assistant within the course scope. Uploading a revision refreshes it with AI when "auto" is on.
import {esc} from './render.js';

const statusText=(b,t)=>b.status==='pending'?t('AI 正在根据新修订提炼…','AI is extracting from the new revision…'):b.status==='failed'?t('自动提炼失败：','Extraction failed: ')+(b.error||''):b.source==='ai'?t('AI 提炼自修订 R','AI extracted from revision R')+(b.revision??'?'):b.updated?t('手动填写','Written manually'):t('尚未填写','Not written yet');

export async function renderCourseBrief(host,{api,t,course,compact=false}){
 if(!host||!course)return;
 let b;try{b=await api('/api/preparation/brief?'+new URLSearchParams({course}))}catch(e){host.innerHTML='<p class="small muted">'+esc(e.message)+'</p>';return}
 const hasRevision=!!(b.versions.draft||b.versions.published);
 host.innerHTML=(compact?'':'<h2>'+t('课程关键说明','Course key description')+'</h2>')
  +'<p class="small muted">'+t('一段说明课程讲什么、适合谁、不包含什么的文字。对外作为课程简介显示；飞书课堂助手按它筛选群讨论，AI 生成草稿时只保留范围内的内容。','A short statement of what the course covers, for whom, and what it excludes. Shown publicly as the course introduction; the Lark classroom assistant screens group discussion with it, and AI drafts keep only content within it.')+'</p>'
  +'<div class="form-grid"><label>'+t('中文','Chinese')+'<textarea id="briefZh" rows="4" maxlength="600">'+esc(b.zh)+'</textarea></label><label>English<textarea id="briefEn" rows="4" maxlength="600">'+esc(b.en)+'</textarea></label></div>'
  +'<label class="inline"><input type="checkbox" id="briefAuto"'+(b.auto?' checked':'')+'>'+t('上传修订时由 AI 自动更新（会覆盖手动修改）','Refresh with AI when a revision is uploaded (overwrites manual edits)')+'</label>'
  +'<p class="small" id="briefState">'+esc(statusText(b,t))+'</p>'
  +(hasRevision?'':'<p class="small muted">'+t('课程还没有上传修订，请直接填写；上传修订后可由 AI 提炼。','No revision uploaded yet: write it yourself; AI can extract it once a revision is uploaded.')+'</p>')
  +'<div class="actions"><button class="primary" id="briefSave">'+t('保存关键说明','Save key description')+'</button><button id="briefExtract"'+(hasRevision?'':' disabled')+'>'+t('用 AI 从当前修订提炼','Extract from current revision with AI')+'</button></div>';
 const $=id=>host.querySelector('#'+id),busy=(on,label)=>{for(const id of ['briefSave','briefExtract'])if($(id))$(id).disabled=on||id==='briefExtract'&&!hasRevision;if(label)$('briefState').textContent=label};
 const again=()=>renderCourseBrief(host,{api,t,course,compact});
 $('briefSave').onclick=async()=>{busy(true,t('保存中…','Saving…'));try{await api('/api/preparation/brief',{method:'PUT',body:{course,zh:$('briefZh').value,en:$('briefEn').value,auto:$('briefAuto').checked,baseUpdated:b.updated}});await again()}catch(e){busy(false,e.message)}};
 $('briefExtract').onclick=async()=>{busy(true,t('AI 提炼中…','Extracting…'));try{await api('/api/preparation/brief/extract',{method:'POST',body:{course}});await again()}catch(e){busy(false,e.message)}};
 if(b.status==='pending')setTimeout(()=>{if(host.isConnected)again()},3000);
}
