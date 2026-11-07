import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {knowledgeImpact} from '../src/knowledge-impact.mjs';
function fixture(){const db=new DatabaseSync(':memory:');const store={db,run:(s,...a)=>db.prepare(s).run(...a),get:(s,...a)=>db.prepare(s).get(...a),all:(s,...a)=>db.prepare(s).all(...a),now:()=>new Date().toISOString(),audit:()=>{}};return {db,store,k:knowledgeImpact(store)}}
const request={body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'PRIVATE QUESTION'}]})};
test('concurrent traces isolate evidence; actual attempts and unknown usage remain distinct',async()=>{
 const {db,k}=fixture();try{const call=k.wrap(async()=>{await new Promise(r=>setTimeout(r,5));return Response.json({choices:[{message:{content:'PRIVATE ANSWER'}}],usage:{total_tokens:7}})});
 await Promise.all(['a','b'].map(course=>k.run({course,revision:1},async()=>{k.sources([{id:course,text:'PRIVATE SOURCE'}]);k.update({stage:'generation'});await call('https://provider.test',request);k.citations([course,'invalid']);k.update({stage:'grounding_review',grounding:'supported'});await call('https://provider.test',request);return {status:'answered'}})));
 await k.wrap(async()=>Response.json({}))(null,request);
 const d=k.describe();assert.equal(d.summary.calls,5);assert.equal(d.summary.tokens,28);assert.equal(d.summary.unknownUsage,1);assert.equal(d.funnel.answered,2);assert.equal(d.funnel.cited,2);assert.equal(d.funnel.supported,2);
 for(const run of d.runs){const detail=k.detail(run.id);assert.equal(detail.calls.length,2);assert.deepEqual(run.citations,[run.course]);assert(detail.calls.every(c=>c.sources[0].id===run.course));k.rate(run.id,'helpful','admin');assert.equal(k.detail(run.id).run.rating,'helpful')}
 assert(!JSON.stringify(d).includes('PRIVATE'));assert.throws(()=>k.rate(d.runs[0].id,'invented','admin'));assert.throws(()=>k.detail('absent'));assert.throws(()=>k.describe(new URLSearchParams('days=999')));
 }finally{db.close()}
});
test('failures, direct material processing, cached replies and retention do not inflate success',async()=>{
 const {db,store,k}=fixture();try{await k.run({course:'c'},async()=>{k.sources([{id:'p',text:'text'}]);k.update({stage:'generation'});await assert.rejects(k.wrap(async()=>{throw Error('PRIVATE SECRET')})(null,request));await k.wrap(async()=>Response.json({}, {status:503}))(null,request);return {status:'failed'}});
 await k.run({course:'c'},async()=>({status:'answered'}));
 await k.operation({stage:'distillation',role:'direct_material',course:'c'},()=>k.wrap(async()=>Response.json({usage:{total_tokens:0}}))(null,request));
 const d=k.describe();assert.equal(d.summary.calls,3);assert.equal(d.summary.failures,2);assert.equal(d.summary.unknownUsage,2);assert.equal(d.summary.tokens,0);assert.equal(d.funnel.cached,1);assert.equal(d.funnel.answered,0);assert.equal(d.roles.find(x=>x.role==='direct_material').count,1);assert(!JSON.stringify(d).includes('PRIVATE'));
 store.run("UPDATE knowledge_impact_calls SET created='2000-01-01T00:00:00.000Z'");store.run("UPDATE knowledge_impact_runs SET created='2000-01-01T00:00:00.000Z'");assert.equal(k.describe().summary.calls,0);assert.equal(store.get('SELECT COUNT(*) n FROM knowledge_impact_runs').n,0);
 }finally{db.close()}
});
