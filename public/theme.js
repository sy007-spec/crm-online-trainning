const key='seii-training-theme',root=document.documentElement,system=matchMedia('(prefers-color-scheme: dark)');
let preference;try{preference=localStorage.getItem(key)}catch{}
function apply(value){root.dataset.theme=value;root.style.colorScheme=value;updateButtons()}
function updateButtons(){for(const button of document.querySelectorAll('.theme-switch')){const dark=root.dataset.theme==='dark',zh=root.lang.startsWith('zh');button.setAttribute('aria-label',zh?(dark?'切换为浅色主题':'切换为深色主题'):(dark?'Switch to light theme':'Switch to dark theme'));button.dataset.tooltip=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(dark));button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+(dark?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>':'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>')+'</svg>'}}
apply(['dark','light'].includes(preference)?preference:system.matches?'dark':'light');
system.addEventListener('change',e=>{if(!['dark','light'].includes(preference))apply(e.matches?'dark':'light')});
addEventListener('storage',e=>{if(e.key===key){preference=e.newValue;apply(['dark','light'].includes(preference)?preference:system.matches?'dark':'light')}});
function mount(){for(const language of document.querySelectorAll('header .language-switch')){const header=language.closest('header');if(header.querySelector('.theme-switch'))continue;const button=document.createElement('button');button.type='button';button.className='theme-switch header-icon';button.onclick=()=>{preference=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,preference)}catch{}apply(preference)};language.after(button);updateButtons()}}
new MutationObserver(mount).observe(root,{childList:true,subtree:true});
new MutationObserver(updateButtons).observe(root,{attributes:true,attributeFilter:['lang']});
mount();
