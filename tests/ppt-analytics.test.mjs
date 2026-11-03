import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../src/store.mjs';
import {pptAnalytics} from '../src/ppt-analytics.mjs';
import {uid,digest} from '../src/security.mjs';
test('shared reading aggregates clocks, deduplicates events and exposes explainable drill-down signals',()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'ppt-metrics-')),store=openStore(runtime);
 try{
 store.db.exec('CREATE TABLE ppt_shares(id TEXT PRIMARY KEY,course_id TEXT,creator_name TEXT,creator_email TEXT)');
 store.db.exec('CREATE TABLE ppt_visitors(share_id TEXT,visitor TEXT,email TEXT)');
 store.run('INSERT INTO ppt_shares VALUES(?,?,?,?)','link','pamm','Teacher','teacher@example.test');
 const a=pptAnalytics(store),visitor='a'.repeat(64),event={id:uid(),kind:'view',page:'manager-01',language:'zh'};
 a.record({share:'link',visitor,ip:'192.0.2.1',outcome:'open'});a.event('link',visitor,'192.0.2.1',event);assert(a.event('link',visitor,'192.0.2.1',event).duplicate);
 store.run('UPDATE ppt_metric_state SET stamp=?',Date.now()-20000);
 const beat=a.event('link',visitor,'192.0.2.1',{...event,id:uid(),kind:'heartbeat'});assert(beat.seconds>=19&&beat.seconds<=21);
 assert(a.event('link',visitor,'192.0.2.1',{...event,id:uid(),kind:'heartbeat'}).seconds<1,'Parallel calls do not multiply time');
 store.run('UPDATE ppt_metric_state SET stamp=?',Date.now()-600000);assert.equal(a.event('link',visitor,'192.0.2.1',{...event,id:uid(),kind:'heartbeat'}).seconds,0);
 for(let i=0;i<12;i++)a.record({share:'link',visitor,ip:'192.0.2.2',outcome:'blocked'});
 for(let i=0;i<10;i++)a.record({share:'link',visitor:(''+i).repeat(64),ip:'192.0.2.3',outcome:'open'});
 for(let i=0;i<4;i++)a.record({share:'link',visitor,ip:'198.51.100.'+i,outcome:'open'});
 for(let i=0;i<20;i++)a.event('link',visitor,'192.0.2.1',{...event,id:uid()});
 const r=a.report(new URLSearchParams());assert.equal(r.summary.blocked,12);assert.equal(r.summary.views,21);assert.equal(r.alerts.length,4);assert(r.alerts.some(x=>x.rule==='blockedBurst'));assert(r.summary.seconds<22);assert.equal(r.shares[0].creator_email,'teacher@example.test');
 const specific=a.report(new URLSearchParams({ip:'192.0.2.2'}));assert.equal(specific.summary.blocked,12);assert(specific.records.every(x=>x.ip==='192.0.2.2'));assert.equal(a.report(new URLSearchParams({course:'other'})).total,0);assert.equal(a.report(new URLSearchParams({page:'manager-02'})).total,0);
 assert.throws(()=>a.report(new URLSearchParams({from:'2026-01-01',to:'2026-03-01'})),/31 days/);
 assert.throws(()=>a.event('link','bad','ip',event),/Invalid reading event/);
 a.record({ip:'203.0.113.1',outcome:'invalid'});assert.equal(a.report(new URLSearchParams({share:'unknown'})).summary.blocked,1);
 assert(!JSON.stringify(r).includes(visitor));assert(r.records.some(x=>x.visitor===digest(visitor)));
 }finally{store.db.close();fs.rmSync(runtime,{recursive:true,force:true})}
});
