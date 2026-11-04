const fs=require('fs'),os=require('os'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 process.env.ADMIN_PASSWORD='course-list-test-password';
 const {createApp}=await import('../src/server.mjs');
 const {testMaterial}=await import('./fixtures/markdown.mjs');
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'course-list-'));
 const app=createApp({runtime,seedMaterial:testMaterial(),origin:'http://127.0.0.1:3198',scheduler:false});
 await new Promise(r=>app.server.listen(3198,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+app.server.address().port+'/admin');
  await page.locator('#password').fill(process.env.ADMIN_PASSWORD);await page.locator('#adminLogin button').click();await page.locator('[data-admin=courses]').waitFor();
  await page.evaluate(async()=>{const s=await fetch('/api/session').then(r=>r.json());const r=await fetch('/api/admin/courses',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({id:'second-course',title:{zh:'第二门课程',en:'Second <img src=x> course'},code:'test-second'})});if(!r.ok)throw Error(await r.text());});
  app.store.run('UPDATE courses SET enabled=0 WHERE id=?','second-course');
  await page.locator('[data-admin=courses]').click();
  await page.locator('[data-course-open="second-course"]').waitFor();
  assert.equal(await page.locator('[data-course-open]').count(),2);
  assert.equal(await page.locator('.course-tile img').count(),0);
  assert.match(await page.locator('[data-course-open="second-course"]').innerText(),/Disabled/);
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});
   await page.locator('#courseSearch').fill('第二');assert.equal(await page.locator('.course-tile:visible').count(),1);
   await page.locator('[data-course-open="second-course"]').focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('[data-course-open="second-course"]')?.getAttribute('aria-pressed')==='true');
   assert(await page.locator('#uploadMarkdown').isVisible());
   assert.equal(await page.locator('#toggleCourse').innerText(),'Enable course');
   await page.locator('#courseSearch').fill('no-match');assert(await page.locator('#courseSearchEmpty').isVisible());
   await page.locator('#courseSearch').fill('');assert.equal(await page.locator('.course-tile:visible').count(),2);
   assert(await page.evaluate(()=>document.querySelector('.course-overview').getBoundingClientRect().right<=innerWidth));
   await page.locator('[data-course-open="pamm"]').click();await page.waitForFunction(()=>document.querySelector('[data-course-open="pamm"]')?.getAttribute('aria-pressed')==='true');
  }
  assert.deepEqual(errors,[]);console.log('Course overview passed: multiple courses, search, disabled/empty editing, keyboard selection, safe titles, desktop/mobile');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
