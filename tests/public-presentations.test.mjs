import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {publicPresentations} from '../src/public-presentations.mjs';
import {businessVersions} from '../src/business-versions.mjs';
import {contentStorage} from '../src/content-storage.mjs';
import {testMaterial} from './fixtures/markdown.mjs';

test('public PPT snapshots obey live entitlement, withdrawal and publication boundaries',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'public-ppt-'));let allowed=true,expires=new Date(Date.now()+60000).toISOString();
 const hosting={status:()=>({active:true,tier:'advanced'}),publicationPolicy:()=>({allowed,expires})};
 const material=testMaterial();material.lessons[0].pages[0].speaker={en:'PRIVATE SPEAKER',zh:'PRIVATE SPEAKER'};
 const app=createApp({runtime,seedMaterial:material,hosting,origin:'http://127.0.0.1',scheduler:false});
 const service=publicPresentations(app.store,{business:businessVersions(app.store),hosting,origin:'http://127.0.0.1'}),admin={admin:true,user_id:'operator'};
 try{
  assert.throws(()=>service.publish({}, {course:'pamm',confirm:true}),/Administrator/);
  assert.throws(()=>service.publish(admin,{course:'pamm'}),/Confirm/);
  allowed=false;assert.throws(()=>service.publish(admin,{course:'pamm',confirm:true}),/advanced/);allowed=true;
  const published=service.publish(admin,{course:'pamm',businessVersion:'v1',confirm:true});const original=service.read(published.id);
  assert(!JSON.stringify(original).includes('PRIVATE SPEAKER'));assert(!JSON.stringify(original).includes('exercise'));assert(original.material.lessons.length);
  material.lessons[0].pages[0].body={zh:'Changed draft',en:'Changed draft'};app.store.run("UPDATE business_materials SET material=? WHERE course_id='pamm' AND revision=1",JSON.stringify({...material,extra:'not public'}));assert.deepEqual(service.read(published.id).material,original.material);
  assert(app.store.get('SELECT used FROM content_storage').used>0);
  allowed=false;assert.throws(()=>service.read(published.id),e=>e.status===402);allowed=true;
  expires=new Date(Date.now()-1000).toISOString();assert.throws(()=>service.read(published.id),e=>e.status===402);expires=new Date(Date.now()+60000).toISOString();assert(service.read(published.id));
  app.store.run("UPDATE business_tracks SET visibility='admin' WHERE course_id='pamm'");assert.throws(()=>service.read(published.id),e=>e.status===404);app.store.run("UPDATE business_tracks SET visibility='public' WHERE course_id='pamm'");
  app.store.run("UPDATE courses SET enabled=0 WHERE id='pamm'");assert.throws(()=>service.read(published.id),e=>e.status===404);app.store.run("UPDATE courses SET enabled=1 WHERE id='pamm'");
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  let response=await fetch(base+'/api/public-presentations/'+published.id);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
  response=await fetch(base+'/api/public-presentations/'+published.id,{method:'POST'});assert.equal(response.status,405);
  response=await fetch(base+'/api/course');assert.notEqual(response.status,200);
  response=await fetch(base+'/api/question',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.notEqual(response.status,200);
  const shell=await fetch(base+'/p/'+published.id);assert.equal(shell.status,200);assert.equal(shell.headers.get('set-cookie'),null);assert.match(shell.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await fetch(base+'/api/public-presentations/00000000-0000-0000-0000-000000000000')).status,404);
  allowed=false;service.withdraw(admin,published.id);allowed=true;assert.throws(()=>service.read(published.id),e=>e.status===404);
  assert.equal(service.publish(admin,{course:'pamm',confirm:true}).id,published.id);
  assert.equal(app.store.all('SELECT * FROM public_presentations').length,1);
  const before=app.store.get('SELECT used FROM content_storage').used;
  contentStorage(app.store,hosting);assert.equal(app.store.get('SELECT used FROM content_storage').used,before);
  app.store.run('UPDATE content_storage SET cap=used');
  material.lessons[0].pages[0].body={zh:'x'.repeat(10000),en:'y'.repeat(10000)};
  app.store.run('DROP TRIGGER storage_business_materials_UPDATE');
  app.store.run("UPDATE business_materials SET material=? WHERE course_id='pamm' AND revision=1",JSON.stringify(material));
  assert.throws(()=>service.publish(admin,{course:'pamm',confirm:true}),/classroom_storage_full/);
  assert.equal(app.store.get('SELECT used FROM content_storage').used,before);
  assert(!JSON.stringify(service.read(published.id)).includes('x'.repeat(10000)));
  const closed=publicPresentations(app.store,{business:businessVersions(app.store),hosting:{},origin:base});assert.throws(()=>closed.read(published.id),e=>e.status===402);
  assert.throws(()=>publicPresentations(app.store,{business:businessVersions(app.store),origin:base,enabled:false}).read(published.id),e=>e.status===402);
  app.store.run("DELETE FROM business_publications WHERE course_id='pamm'");assert.throws(()=>service.read(published.id),e=>e.status===404);
 }finally{await app.close();fs.rmSync(runtime,{recursive:true,force:true})}
});

test('public snapshots persist across restart and remain isolated from other classroom stores',async()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'public-persist-')),otherRuntime=fs.mkdtempSync(path.join(os.tmpdir(),'public-other-'));
 const hosting={status:()=>({tier:'advanced'}),publicationPolicy:()=>({allowed:true,expires:new Date(Date.now()+60000).toISOString()})};
 let app=createApp({runtime,seedMaterial:testMaterial(),hosting,scheduler:false}),other;
 const service=a=>publicPresentations(a.store,{business:businessVersions(a.store),hosting,origin:'http://localhost'});
 try{const published=service(app).publish({admin:true,user_id:'test'},{course:'pamm',confirm:true}),before=app.store.get('SELECT used FROM content_storage').used;await app.close();
 app=createApp({runtime,hosting,scheduler:false});assert(service(app).read(published.id).material.lessons.length);assert.equal(app.store.get('SELECT used FROM content_storage').used,before);
 other=createApp({runtime:otherRuntime,seedMaterial:testMaterial(),hosting,scheduler:false});assert.throws(()=>service(other).read(published.id),e=>e.status===404);
 }finally{await app.close();if(other)await other.close();fs.rmSync(runtime,{recursive:true,force:true});fs.rmSync(otherRuntime,{recursive:true,force:true})}
});
