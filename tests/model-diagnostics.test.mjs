import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openStore} from '../src/store.mjs';import {diagnostics} from '../src/model-diagnostics.mjs';import {pruneLogs} from '../src/log-retention.mjs';import {runtimeLogs} from '../src/runtime-logs.mjs';
test('diagnostics handles array errors, exposes reported quota only, drops secret payloads and expires logs without deleting business records',()=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'diagnostics-')),s=openStore(runtime,null,true);try{
 const logs=diagnostics(s);logs.record({project:'test',model:'gemini-flash-latest',status:403,data:[{error:{status:'PERMISSION_DENIED',message:'The Gemini API free tier is not available for this project. secret-text',details:[]}}]});
 assert.equal(logs.list()[0].explanation,'free_tier_unavailable_billing_required');assert.equal(logs.list()[0].remainingQuota,null);assert(!JSON.stringify(logs.list()).includes('secret-text'));
 logs.record({project:'test',status:429,data:{error:{details:[{violations:[{quotaMetric:'requests',quotaValue:'0'}]},{retryDelay:'60s'}]}}});assert.equal(logs.list()[0].quota[0].limit,0);assert.equal(logs.list()[0].retryAfter,'60s');
 s.run("INSERT INTO notes VALUES('user','course','page','keep',?,1)",'2020-01-01');s.audit('actor','old',{});s.run("UPDATE audit SET created='2020-01-01'");s.run("UPDATE model_logs SET created='2020-01-01'");pruneLogs(s);assert.equal(logs.list().length,0);assert.equal(s.all('SELECT * FROM audit').length,0);assert.equal(s.all('SELECT * FROM notes').length,1);
 const files=runtimeLogs(runtime);fs.writeFileSync(path.join(runtime,'logs','2020-01-01.jsonl'),'old');files.write('info','current');assert(!fs.existsSync(path.join(runtime,'logs','2020-01-01.jsonl')));assert.equal(fs.readdirSync(path.join(runtime,'logs')).length,1);
 }finally{s.db.close();fs.rmSync(runtime,{recursive:true,force:true})}
});
