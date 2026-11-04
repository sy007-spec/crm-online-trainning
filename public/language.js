import './tooltips.js';
import './theme.js';
const valid=value=>['zh','en'].includes(value);
export function readLanguage(fallback='en'){try{for(const key of ['ui-language','hosting-lang','training-lang']){const value=localStorage.getItem(key);if(valid(value))return value}}catch{}return valid(fallback)?fallback:'en'}
export function saveLanguage(value){if(!valid(value))return;try{for(const key of ['ui-language','hosting-lang','training-lang'])localStorage.setItem(key,value)}catch{}}
export function languageButton(lang,id='language'){return '<button type="button" id="'+id+'" class="language-switch" title="'+(lang==='zh'?'切换为英文':'Switch to Chinese')+'" aria-label="'+(lang==='zh'?'切换为英文':'Switch to Chinese')+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></svg><span>'+(lang==='zh'?'English':'中文')+'</span></button>'}
