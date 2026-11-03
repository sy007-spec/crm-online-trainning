const paths={switchCourse:'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',switchRoleView:'M10 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M3 21v-3a7 7 0 0 1 11-5M16 11h6m-3-3 3 3-3 3M22 19h-6m3-3-3 3 3 3',logout:'M9 4H4v16h5M13 8l4 4-4 4M8 12h12',full:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',sharePpt:'M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8',admin:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',instructor:'M3 4h18v13H3zM8 21h8M12 17v4M7 8h10M7 12h6',hosting:'M3 5h18v14H3zM3 9h18M7 15h4',home:'m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',source:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18'};
export function compactHeader(header=document.querySelector('header')){
 if(!header)return;
 for(const el of header.querySelectorAll('.actions button,.actions>a,nav:not(.breadcrumbs) button,nav:not(.breadcrumbs)>a')){
  if(el.querySelector('svg'))continue;
  const label=el.getAttribute('aria-label')||el.textContent.trim(),href=el.getAttribute('href')||'';
  const key=paths[el.id]?el.id:href.includes('github.com')?'source':href.startsWith('/instructor')?'instructor':href.startsWith('/admin')?'admin':href.includes('/dashboard')?'hosting':'home';
  el.title=label;el.setAttribute('aria-label',label);el.classList.add('header-icon');
  el.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[key]+'"/></svg>';
 }
}
