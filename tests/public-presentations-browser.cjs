const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 process.env.ADMIN_PASSWORD='public-ppt-browser-test';
 const {createApp}=await import('../src/server.mjs'),{testMaterial}=await import('./fixtures/markdown.mjs');
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'public-ppt-ui-'));let allowed=true,expires=new Date(Date.now()+60000).toISOString();
 const app=createApp({runtime,seedMaterial:testMaterial(),origin:'http://127.0.0.1:3195',scheduler:false,hosting:{allowLegacyAdmin:true,canManage:()=>false,status:()=>({active:true,tier:'advanced'}),publicationPolicy:()=>({allowed,expires})}});
 await new Promise(r=>app.server.listen(3195,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
 try{
  const admin=await browser.newPage(),errors=[];let natives=0;
  admin.setDefaultTimeout(12000);admin.on('pageerror',e=>errors.push(e.message));admin.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/'))console.error(r.url(),r.status(),await r.text())});admin.on('dialog',async d=>{natives++;await d.dismiss()});
  await admin.goto(base+'/admin');await admin.locator('#password').fill(process.env.ADMIN_PASSWORD);await admin.locator('#adminLogin button').click();await admin.locator('[data-admin=publicPpt]').click();
  await admin.locator('#publicPublish button:not([disabled])').waitFor();await admin.locator('#publicConsent').check();await admin.locator('#publicPublish button').click();await admin.keyboard.press('Escape');
  assert.equal(app.store.all('SELECT * FROM public_presentations').length,0);
  await admin.locator('#publicPublish button').click();await admin.locator('.project-dialog button[type=submit]').click();await admin.locator('[data-withdraw]').waitFor();
  const row=app.store.get('SELECT * FROM public_presentations');assert(row);
  const guest=await browser.newPage({viewport:{width:390,height:844}});guest.on('pageerror',e=>errors.push(e.message));
  await guest.goto(base+'/p/'+row.id);await guest.locator('.ppt-slide').waitFor();assert.equal(await guest.locator('#quickDock,#questionText,#noteText,#sharePpt').count(),0);assert.equal((await guest.context().cookies()).length,0);
  const first=await guest.locator('.ppt-slide h1').textContent();await guest.locator('#next').click();assert.notEqual(await guest.locator('.ppt-slide h1').textContent(),first);
  await guest.locator('#language').click();
  for(const theme of ['dark','light']){if(await guest.locator('html').getAttribute('data-theme')!==theme)await guest.locator('.theme-switch').click();assert.equal(await guest.locator('html').getAttribute('data-theme'),theme);assert(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await guest.screenshot({path:path.join(process.env.EVIDENCE_DIR||os.tmpdir(),'public-ppt-'+theme+'.png'),fullPage:true})}
  expires=new Date(Date.now()+1800).toISOString();await guest.reload();await guest.locator('.ppt-slide').waitFor();await guest.locator('#retry').waitFor();assert.equal(await guest.locator('.ppt-slide').count(),0);
  expires=new Date(Date.now()+60000).toISOString();await guest.locator('#retry').click();await guest.locator('.ppt-slide').waitFor();allowed=false;await guest.reload();await guest.locator('#retry').waitFor();assert.equal(await guest.locator('.ppt-slide').count(),0);
  await admin.locator('[data-withdraw]').click();await admin.locator('.project-dialog button[type=submit]').click();await admin.locator('[data-withdraw]').waitFor({state:'detached'});allowed=true;await Promise.all([guest.waitForResponse(r=>r.url().includes('/api/public-presentations/')&&r.status()===404),guest.locator('#retry').click()]);assert.equal(await guest.locator('.ppt-slide').count(),0);
  assert.equal(natives,0);assert.deepEqual(errors,[]);console.log('PASS public PPT: publish/cancel, anonymous slides, mobile themes, expiry, renewal, downgrade and withdrawal');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
