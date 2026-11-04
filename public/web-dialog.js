// Asynchronous project dialogs; never invoke browser alert/confirm/prompt.
const shared=globalThis[Symbol.for('seii.web-dialog')] ||= {active:false};
function ask(message,value,inputMode){
 const cancelled=inputMode?null:false;
 if(shared.active)return Promise.resolve(cancelled);
 shared.active=true;
 return new Promise(resolve=>{
  const previous=document.activeElement,zh=document.documentElement.lang.startsWith('zh');
  const el=document.createElement('dialog');el.className='project-dialog';
  el.setAttribute('aria-labelledby','project-dialog-heading');el.setAttribute('aria-describedby','project-dialog-message');
  const form=document.createElement('form');form.method='dialog';
  const heading=document.createElement('h2');heading.id='project-dialog-heading';heading.textContent=zh?(inputMode?'请输入':'请确认操作'):(inputMode?'Enter details':'Confirm action');
  const close=document.createElement('button');close.type='button';close.className='project-dialog-close';close.textContent='×';close.setAttribute('aria-label',zh?'关闭':'Close');
  const text=document.createElement('p');text.id='project-dialog-message';text.textContent=String(message);
  const field=document.createElement('input');field.type='text';field.value=String(value??'');field.setAttribute('aria-labelledby','project-dialog-message');field.autocomplete='off';
  const actions=document.createElement('div');actions.className='project-dialog-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent=zh?'取消':'Cancel';
  const accept=document.createElement('button');accept.type='submit';accept.className='primary';accept.textContent=zh?'确定':'Confirm';
  let result=cancelled,finished=false;
  const finish=()=>{if(finished)return;finished=true;shared.active=false;el.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result)};
  const dismiss=()=>el.close();
  close.onclick=dismiss;cancel.onclick=dismiss;
  form.onsubmit=e=>{e.preventDefault();result=inputMode?field.value:true;el.close()};
  el.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();dismiss()});el.addEventListener('close',finish,{once:true});
  el.addEventListener('click',e=>{if(e.target!==el)return;const r=el.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss()});
  actions.append(cancel,accept);form.append(close,heading,text);if(inputMode)form.append(field);form.append(actions);el.append(form);(document.fullscreenElement||document.body).append(el);
  try{el.showModal();(inputMode?field:cancel).focus();if(inputMode)field.select()}catch{finish()}
 });
}
export const webConfirm=message=>ask(message,'',false);
export const webPrompt=(message,value='')=>ask(message,value,true);
