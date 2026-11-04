export async function startLarkLogin({button,api,t,toast}){const destination=new URL(location.href).searchParams.get('signin')==='course-admin'?'/admin':location.pathname;const popup=window.open('about:blank','trainingLarkLogin','popup,width=520,height=740');if(!popup){toast(t('请允许弹出授权窗口','Allow the authorization pop-up'));return}button.disabled=true;
 try{popup.opener=null;const r=await api('/api/lark/oauth/start',{method:'POST',body:{destination}});popup.location.replace(r.url);const deadline=Date.now()+600000;const timer=setInterval(()=>{if(popup.closed||Date.now()>deadline||!button.isConnected){clearInterval(timer);button.disabled=false;return}try{if(popup.location.origin===location.origin&&new URL(popup.location.href).searchParams.get('lark')==='linked'){clearInterval(timer);popup.close();location.assign(destination+'?lark=linked')}}catch{}},500)}catch(e){popup.close();button.disabled=false;toast(e.message)}

}
export function mountLarkLogin({root,session,api,t,toast}){
 if(root.querySelector('#scanLarkLogin'))return;
 const target=root.querySelector('.auth')||root.querySelector('header .actions');if(!target)return;
 const button=document.createElement('button');button.id='scanLarkLogin';button.type='button';button.textContent=t(session.larkLinked?'飞书 / Lark 已绑定':'飞书 / Lark 扫码登录或绑定',session.larkLinked?'Feishu / Lark linked':'Scan with Feishu / Lark to sign in or link');target.append(button);if(!session.larkEnabled){button.disabled=true;button.title=t('课堂尚未配置飞书 / Lark 登录，请联系课堂主。','Feishu / Lark sign-in is not configured. Contact the classroom owner.');if(target.matches('.auth')){const note=document.createElement('p');note.className='small muted';note.id='larkSetupNotice';note.textContent=button.title;target.append(note)}return}
 button.onclick=()=>startLarkLogin({button,api,t,toast});
}
export async function chooseLarkCourse({root,session,api,t,esc,localized,toast}){
 if(location.pathname!=='/'||new URL(location.href).searchParams.get('lark')!=='linked')return false;
 history.replaceState(null,'','/');const choices=await api('/api/my-courses');if(!choices.length)return false;
 const dialog=document.createElement('dialog');dialog.className='web-dialog';let selected=choices.find(c=>c.id===session.lastCourse)||choices.find(c=>c.allowed)||choices[0],remaining=5,timer,entering=false;
 dialog.innerHTML='<h2>'+t('欢迎回来，选择课程','Welcome back. Choose a course')+'</h2><div class="course-grid">'+choices.map(c=>'<button type="button" data-lark-course="'+esc(c.id)+'">'+esc(localized(c.title))+(c.allowed?'':' · '+t('需审批','Approval required'))+'</button>').join('')+'</div><p id="larkCountdown" role="status"></p><div class="actions"><button id="larkEnter">'+t('立即进入','Enter now')+'</button><button id="larkPause">'+t('取消自动进入','Cancel automatic entry')+'</button><button id="larkNew">'+t('输入新课程口令','Enter another course code')+'</button></div>';
 document.body.append(dialog);dialog.showModal();
 const update=()=>{dialog.querySelector('#larkCountdown').textContent=localized(selected.title)+(selected.allowed?' · '+t(remaining+'秒后进入', 'Opening in '+remaining+'s'):' · '+t('请申请访问许可','Request access approval'));for(const b of dialog.querySelectorAll('[data-lark-course]'))b.setAttribute('aria-pressed',String(b.dataset.larkCourse===selected.id))};
 const stop=()=>{clearInterval(timer);remaining=0;dialog.querySelector('#larkCountdown').textContent=t('已暂停，请选择课程后进入','Paused. Choose a course and enter')};
 const enter=async()=>{if(entering)return;entering=true;clearInterval(timer);try{await api('/api/switch-course',{method:'POST',body:{course:selected.id}});location.assign('/')}catch(e){entering=false;stop();toast(e.message)}};
 const start=()=>{clearInterval(timer);remaining=5;update();if(selected.allowed)timer=setInterval(()=>{if(!dialog.open||document.hidden){stop();return}remaining--;if(remaining<=0)enter();else update()},1000)};
 for(const b of dialog.querySelectorAll('[data-lark-course]'))b.onclick=()=>{selected=choices.find(c=>c.id===b.dataset.larkCourse);stop();update();dialog.querySelector('#larkCountdown').textContent=localized(selected.title)};
 dialog.querySelector('#larkEnter').onclick=enter;dialog.querySelector('#larkPause').onclick=stop;dialog.querySelector('#larkNew').onclick=()=>{stop();dialog.close();dialog.remove()};dialog.addEventListener('close',stop);dialog.addEventListener('cancel',stop);start();return true;
}
