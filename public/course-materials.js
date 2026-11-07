// 课程资料: the shared materials component (hosting) with this product's teaching actions — generate the course draft from
// published sources, translate the missing language of a bilingual draft, approve a source for the AI tutor, rebuild the index.
import {esc} from './render.js';
import {generateDraft} from './course-preparation.js';

const kinds=t=>[{id:'reference',label:t('知识库原始资料（不翻译）','Reference source (kept as is)')},{id:'course',label:t('课程内容草稿（中英文）','Course draft (bilingual)')}];
const languages=t=>[['unspecified','未指定','Unspecified'],['zh','中文','Chinese'],['en','英文','English'],['mixed','混合语言','Mixed'],['other','其他','Other']].map(([id,zh,en])=>({id,label:t(zh,en)}));

async function mount(host,{course,api,t,lang,csrf,toast,onGenerated}){
 const {mountMaterials}=await import('/materials.js');
 const knowledge=()=>api('/api/preparation/knowledge?'+new URLSearchParams({course,businessVersion:'v1'}));
 return mountMaterials(host,{base:'/api/materials',query:{course},lang:lang==='zh'?'zh':'en',headers:()=>({'x-csrf-token':csrf()}),kinds:kinds(t),languages:languages(t),variants:[{id:'en',label:t('英文版本','English')}],variantKinds:['course'],
  toolbar:(el,ctx)=>{el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px"><button data-x="generate" class="primary">'+t('根据已发布资料生成教材草稿','Generate course draft from published sources')+'</button><button data-x="index">'+t('更新答疑知识索引','Rebuild tutor knowledge index')+'</button></div><p style="margin:0 0 8px;font-size:12px;opacity:.75">'+t('资料先保存为草稿，点“发布当前版本”后才用于生成教材；原始资料还需审核后才可用于学员答疑。上传 Word/PDF/PPT/Excel 会先转换为 Markdown，请在“对照复核”中确认。','Materials save as drafts; publishing makes them available for course generation. References also need approval for the AI tutor. Uploaded Word/PDF/PPT/Excel files are converted and reviewed side by side first.')+'</p>';
   el.querySelector('[data-x=generate]').onclick=async e=>{if(!confirm(t('生成会将本课程全部已发布的原始资料发送给课堂模型；结果需审核并单独发布。继续？','Generation sends all published references to the classroom model; the result needs review and separate publishing. Continue?')))return;e.target.disabled=true;e.target.textContent=t('正在生成大纲和教材，请稍候…','Generating…');try{const r=await generateDraft({api,course,onWait:sec=>{e.target.textContent=t('正在生成，已用时 ','Generating… ')+sec+t(' 秒',' s')}});ctx.toast(t('已保存教材草稿，需审核发布：R','Draft saved for review: R')+r.version);onGenerated?.(r)}catch(err){ctx.toast(err.message)}finally{e.target.disabled=false;e.target.textContent=t('根据已发布资料生成教材草稿','Generate course draft from published sources')}};
   el.querySelector('[data-x=index]').onclick=async e=>{e.target.disabled=true;try{await api('/api/preparation/knowledge/build',{method:'POST',body:{course,businessVersion:'v1'}});ctx.toast(t('知识索引已更新','Knowledge index updated'))}catch(err){ctx.toast(err.message)}finally{e.target.disabled=false}};
  },
  docActions:(doc,ctx)=>{
   const out=[];if(doc.revision!==doc.headRevision||doc.archived)return out;
   if(doc.kind==='course'&&doc.publishedRevision){const zh=!!doc.markdown.trim(),en=!!(doc.variants.en||'').trim();if(zh!==en)out.push({label:t('AI 补齐缺失语言','AI-fill the missing language'),run:async()=>{if(doc.state!=='published')return ctx.toast(t('请先发布当前版本','Publish first'));if(!confirm(t('补译会将当前资料发送给课堂使用的模型。AI 译稿需人工审核，不会覆盖已有语言。','Translation sends this material to the classroom model and never overwrites existing text.')))return;await api('/api/preparation/translate',{method:'POST',body:{course,id:doc.id,baseRevision:doc.publishedRevision,language:zh?'en':'zh'}});ctx.toast(t('AI 译稿已保存，请审核','Translation saved for review'));await ctx.open(doc.id)}})}
   if(doc.kind==='reference'&&doc.publishedRevision)out.push({label:t('答疑授权…','Tutor approval…'),run:async()=>{
    const k=await knowledge(),row=k.documents.find(d=>d.id===doc.id),status=row?.status||'private';
    if(!k.canApprove)return ctx.toast(t('需要课程发布权限','Course publishing permission required'));
    if(status==='approved'){if(confirm(t('该资料已用于学员答疑。撤回答疑授权？','This source is approved for the AI tutor. Withdraw?'))){await api('/api/preparation/knowledge',{method:'POST',body:{course,businessVersion:'v1',id:doc.id,approved:false}});ctx.toast(t('已撤回','Withdrawn'))}return}
    if(doc.state!=='published')return ctx.toast(t('请先发布当前版本，再审核用于答疑','Publish the current version before approval'));
    if(!confirm(t('确认已审核整份原文？批准后，本课程获准学员可在AI答案及引用中看到相关原文。仅适用于当前业务版本和发布修订。','Approve the whole source? Authorized learners may see quotes of it in AI answers.')))return;
    await api('/api/preparation/knowledge',{method:'POST',body:{course,businessVersion:'v1',id:doc.id,baseRevision:doc.publishedRevision,basePublished:k.revision,approved:true,confirm:true}});ctx.toast(t('已授权用于本课程答疑','Approved for the AI tutor'))}});
   return out;
  }});
}

/** Admin page: course switcher + materials. */
export async function renderCourseMaterials({root,api,t,lang,courses,course,csrf,toast,onCourse}){
 const local=c=>(lang==='zh'?c.title?.zh:c.title?.en)||c.title?.zh||c.title?.en||c.id;
 if(!courses.length){root.innerHTML='<h1>'+t('课程资料','Course materials')+'</h1><p class="muted">'+t('请先创建课程。','Create a course first.')+'</p>';return}
 root.innerHTML='<h1>'+t('课程资料','Course materials')+'</h1><p class="muted">'+t('每门课程一个资料库：粘贴或上传原始资料、对照复核转换结果、查看修订历史、合并为带变更记录的资料包；飞书课堂群的讨论与文档也会自动进入这里。','One library per course: paste or upload sources, review conversions side by side, browse revisions and merge versions into packs with a changelog. Lark classroom discussions and documents arrive here too.')+'</p><label class="inline">'+t('课程','Course')+' <select id="materialsCourse">'+courses.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===course?' selected':'')+'>'+esc(local(c))+'</option>').join('')+'</select></label><section class="card" id="materialsHost" style="margin-top:12px"></section>';
 const select=root.querySelector('#materialsCourse');select.onchange=()=>{onCourse?.(select.value);renderCourseMaterials({root,api,t,lang,courses,course:select.value,csrf,toast,onCourse})};
 await mount(root.querySelector('#materialsHost'),{course:select.value,api,t,lang,csrf,toast});
}
/** Dialog entry used by the course and instructor pages. */
export async function openCourseMaterials({course,api,dialog,t,lang,csrf}){
 dialog('<h2>'+t('课程资料','Course materials')+'</h2><div id="materialsDialogHost" style="min-width:min(980px,92vw)"></div>');
 await mount(document.getElementById('materialsDialogHost'),{course,api,t,lang,csrf});
}
