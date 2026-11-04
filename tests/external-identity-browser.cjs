const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const {createApp}=await import('../src/server.mjs'),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'core-identity-ui-'));
 const app=createApp({runtime,scheduler:false,emptyCourses:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#access').waitFor();
  assert.equal(await page.locator('#scanExternalLogin').count(),0);assert(!(await page.locator('body').innerText()).includes('扫码登录'));
  for(const theme of ['dark','light']){await page.evaluate(theme=>{localStorage.setItem('seii-training-theme',theme)},theme);await page.reload();await page.locator('#access').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.equal(await page.locator('#scanExternalLogin').count(),0)}
  assert.deepEqual(errors,[]);console.log('PASS standalone email login in dark/light without external provider entry');
 }finally{await browser.close();await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exit(1)});
