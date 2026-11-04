import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';

test('standalone core has no external provider and HTTP headers cannot install an identity',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'external-contract-'));
 const app=createApp({runtime,emptyCourses:true,scheduler:false});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const r=await fetch(base+'/api/session'),session=await r.json();assert.equal(session.identity,null);
  assert.equal(app.store.get("SELECT name FROM sqlite_master WHERE name='lark_identities'"),undefined);
  const cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const result=await fetch(base+'/api/identity/start',{method:'POST',headers:{cookie,'x-csrf-token':session.csrf,'content-type':'application/json','x-user-id':'admin','x-external-identity':'verified'},body:'{}'});
  assert.equal(result.status,503);
  assert.equal((await fetch(base+'/api/identity/callback?state=forged&ticket=forged',{headers:{cookie,'x-user-id':'admin'}})).status,503);
  assert.equal((await fetch(base+'/api/session',{headers:{cookie}}).then(r=>r.json())).admin,false);
 }finally{await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
});

test('external adapter cannot establish a session for a missing local user',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'external-result-'));
 const app=createApp({runtime,emptyCourses:true,scheduler:false,externalIdentity:()=>({available:()=>true,linked:()=>false,describe:()=>({label:{zh:'测试身份',en:'Test identity'},enabled:true}),complete:async()=>({user:'missing-user'})})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{assert.equal((await fetch(base+'/api/identity/callback?state=test&ticket=test')).status,401)}finally{await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
});
