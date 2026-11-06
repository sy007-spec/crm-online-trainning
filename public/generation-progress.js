// Shared, indeterminate progress: elapsed time is real; stages never imply a percentage.
export function generationProgress(host,t,{answer=false}={}){
 if(!document.getElementById('generationProgressStyle')){
  const style=document.createElement('style');style.id='generationProgressStyle';style.textContent=`
 .generation-progress{padding:20px;border:1px solid #cbdedc;border-radius:16px;background:linear-gradient(120deg,#edf7f4,#f1f5ff);color:#234b47;margin:16px 0;overflow:hidden}
 .generation-progress strong{color:inherit!important;display:block;font-size:16px}.generation-progress p{margin:8px 0;font-size:14px;line-height:1.6}.generation-progress small{display:block;opacity:.8;font-variant-numeric:tabular-nums}
 .generation-track{height:5px;background:#bfd4d5;border-radius:8px;overflow:hidden;margin:16px 0}.generation-track:after{content:'';display:block;width:35%;height:100%;border-radius:8px;background:linear-gradient(90deg,#268e79,#6485e6);animation:generationFlow 1.8s ease-in-out infinite alternate}
 @keyframes generationFlow{from{transform:translateX(-60%)}to{transform:translateX(250%)}}
 [data-theme=dark] .generation-progress{background:linear-gradient(120deg,#172f2d,#202b42);border-color:#3c5959;color:#d4ebe6}
 [data-theme=dark] .generation-track{background:#3b5358}
 @media(prefers-reduced-motion:reduce){.generation-track:after{animation:none;transform:translateX(90%)}}
 `;document.head.append(style)
 }
 const box=document.createElement('div');box.className='generation-progress';box.innerHTML='<strong role="status" aria-live="polite"></strong><div class="generation-track" role="progressbar"></div><p></p><small></small>';
 host.replaceChildren(box);host.setAttribute('aria-busy','true');box.querySelector('[role=progressbar]').setAttribute('aria-label',answer?t('正在回答','Preparing your answer'):t('正在生成教材','Generating your lesson'));
 box.querySelector('p').textContent=answer?t('正在根据本课程资料整理回答，请稍候。完成后会自动显示。','Preparing an answer from this course’s materials. It will appear here when ready.'):t('正在为你整理双语教材与演示页面，请稍候。完成后会自动展示预览。','Preparing your bilingual lesson and slides. Your preview will appear here when ready.');
 const started=Date.now();let timer;const tick=()=>{if(!box.isConnected){clearInterval(timer);return}const seconds=Math.floor((Date.now()-started)/1000);box.querySelector('small').textContent=t('已等待 ','Elapsed ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+(seconds>=45?t(' · 内容较多时需要更久，请保留此页面。',' · Larger documents take longer. Keep this page open.'):'')};
 const labels={uploading:['正在上传资料','Uploading your document'],reading:['正在读取资料','Reading your document'],generating:['正在生成双语教材','Generating your bilingual lesson'],validating:['正在检查教材格式','Checking your lesson format'],repairing:['正在自动完善教材格式','Refining your lesson format']};
 function update(stage){const text=answer?['AI 正在根据课程资料回答','AI is answering from course material']:labels[stage]||labels.generating;box.querySelector('strong').textContent=t(...text)}
 update('uploading');tick();timer=setInterval(tick,1000);
 return {update,finish(message){clearInterval(timer);host.setAttribute('aria-busy','false');host.textContent=message||''}};
}
