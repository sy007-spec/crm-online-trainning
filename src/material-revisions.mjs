import {checkMarkdown} from './upload-policy.mjs';
import {fail,validateMaterial} from './security.mjs';
import {parseTrainingDocument,serializeTrainingDocument,markdownHash,combineTrainingLanguages,splitTrainingLanguages} from './markdown-import.mjs';

export function materialRevisions(store,business,hosting){
 store.db.exec(`CREATE TABLE IF NOT EXISTS material_revision_state(course_id TEXT,revision INTEGER,ever_published INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,updated TEXT,PRIMARY KEY(course_id,revision));`);
 store.run('INSERT OR IGNORE INTO material_revision_state SELECT course_id,version,0,0,created FROM versions');
 store.run('UPDATE material_revision_state SET ever_published=1 WHERE EXISTS (SELECT 1 FROM publications p WHERE p.course_id=material_revision_state.course_id AND p.version=revision) OR EXISTS (SELECT 1 FROM business_publications p WHERE p.course_id=material_revision_state.course_id AND p.revision=material_revision_state.revision)');
 const state=(c,r)=>store.get('SELECT * FROM material_revision_state WHERE course_id=? AND revision=?',c.id,Number(r));
 function available(c,r){if(state(c,r)?.deleted)fail(404,'Material revision was deleted')}
 function published(c,r){store.run('INSERT INTO material_revision_state VALUES(?,?,1,0,?) ON CONFLICT(course_id,revision) DO UPDATE SET ever_published=1',c.id,r,store.now())}
 function branches(c,r){return store.all('SELECT business_id FROM business_materials WHERE course_id=? AND revision=?',c.id,r).map(b=>b.business_id)}
 function combinedSource(c,r,s){r=Number(r);available(c,r);if(!s.admin){if(store.setting('privateVersions:'+c.id,[]).includes(r))fail(403,'Administrator-only material revision');for(const id of branches(c,r))business.resolve(c,s,id)}const row=store.get('SELECT markdown,sha256,filename,version FROM material_sources WHERE course_id=? AND version=?',c.id,r);if(row)return {...row,filename:c.id+'-R'+r+'.md',origin:'upload'};const ids=branches(c,r);if(!ids.length)fail(404,'Revision not found');const markdown=serializeTrainingDocument(ids.map(id=>({id,material:business.read({...c,businessId:id},r)})));return {markdown,sha256:markdownHash(markdown),filename:c.id+'-R'+r+'.md',version:r,origin:'historical-snapshot-export'}}

 function source(c,r,s,language){const result=combinedSource(c,r,s);if(!language)return result;if(!['zh','en'].includes(language))fail(400,'Unsupported source language');const part=splitTrainingLanguages(result.markdown).find(f=>f.language===language);return {...result,markdown:part.markdown,language,filename:c.id+'-R'+Number(r)+'.'+language+'.md',sha256:markdownHash(part.markdown),revisionSha256:result.sha256}}

 function upload(c,body,s,actor){
  checkMarkdown(body,hosting);
  if(body.baseVersion!==c.draft)fail(409,'Material changed; reload before saving');
  const replacing=body.replaceLatest===true,revision=replacing?c.draft:c.draft+1;
  if(replacing){const old=state(c,revision);if(!revision||old?.ever_published||old?.deleted||store.get('SELECT revision FROM business_publications WHERE course_id=? AND revision=?',c.id,revision))fail(409,'Only the latest never-published draft can be replaced');const original=source(c,revision,s);if(body.baseSha256!==original.sha256)fail(409,'Draft changed; reload before replacing')}
  const previousByBusiness=Object.fromEntries(business.list(c,true).filter(b=>b.draft).map(b=>[b.id,business.read({...c,businessId:b.id},b.draft)]));
  if(body.files!==undefined&&body.markdown!==undefined)fail(400,'Choose language files or legacy combined Markdown, not both');
  const markdown=body.files!==undefined?combineTrainingLanguages(body.files):body.markdown;
  if(typeof markdown==='string'&&/<!--\s*training:language\b/.test(markdown))fail(400,'Select both Chinese and English Markdown files');
  const result=parseTrainingDocument(markdown,{previousByBusiness,filename:body.filename||'training.md'});
  if(!s.admin)for(const branch of result.businessVersions)business.resolve(c,s,branch.id);
  // A revision may retire pages. Keep historical snapshots and learning records;
  // never remap their IDs onto a different page or require obsolete teaching text.
  const retiredPages=[];
  for(const branch of result.businessVersions){
   validateMaterial(branch.material);
   const ids=new Set(branch.material.lessons.flatMap(l=>l.pages).map(p=>p.id));
   const prior=store.all('SELECT material FROM business_materials WHERE course_id=? AND business_id=?',c.id,branch.id);
   const missing=new Set(prior.flatMap(row=>JSON.parse(row.material).lessons.flatMap(l=>l.pages).map(p=>p.id)).filter(id=>!ids.has(id)));
   if(missing.size)retiredPages.push({businessVersion:branch.id,pageIds:[...missing].sort()});
  }
  result.summary.retiredPages=retiredPages;
  if(replacing){const before=branches(c,revision).sort(),after=result.businessVersions.map(b=>b.id).sort();if(JSON.stringify(before)!==JSON.stringify(after))fail(409,'Replacement must retain the same business versions')}
  if(body.preview===true)return {summary:result.summary,material:result.material,businessVersions:result.businessVersions};
  store.transaction(()=>{
   if(replacing){store.run('UPDATE versions SET material=?,author=?,created=? WHERE course_id=? AND version=?',JSON.stringify(result.material),actor,store.now(),c.id,revision);store.run('DELETE FROM material_sources WHERE course_id=? AND version=?',c.id,revision)}
   else store.run('INSERT INTO versions VALUES(?,?,?,?,?)',c.id,revision,JSON.stringify(result.material),actor,store.now());
   for(const branch of result.businessVersions)business.record(c,revision,branch.material,branch.id);
   store.run('UPDATE courses SET draft=? WHERE id=?',revision,c.id);
   store.run('INSERT INTO material_sources VALUES(?,?,?,?,?,?)',c.id,revision,result.markdown,result.summary.sha256,result.material.source.filename,store.now());
   store.run('INSERT INTO material_revision_state VALUES(?,?,0,0,?) ON CONFLICT(course_id,revision) DO UPDATE SET updated=excluded.updated',c.id,revision,store.now());
   if(s.admin)store.set('privateVersions:'+c.id,[...new Set([...store.setting('privateVersions:'+c.id,[]),revision])]);
   store.audit(actor,replacing?'material.markdown-replaced':'material.markdown-imported',{course:c.id,revision,businessVersions:result.businessVersions.map(b=>b.id),sha256:result.summary.sha256});
  });return {version:revision,revision,summary:result.summary};
 }
 function list(c){return store.all('SELECT v.version AS revision,v.created,v.author,s.sha256,s.filename,COALESCE(r.ever_published,0) AS everPublished FROM versions v LEFT JOIN material_sources s ON s.course_id=v.course_id AND s.version=v.version LEFT JOIN material_revision_state r ON r.course_id=v.course_id AND r.revision=v.version WHERE v.course_id=? AND COALESCE(r.deleted,0)=0 ORDER BY v.version DESC',c.id).map(r=>({...r,businessVersions:branches(c,r.revision),canReplace:r.revision===c.draft&&!r.everPublished&&!!r.sha256}))}
 function remove(c,r,actor){r=Number(r);available(c,r);if(!store.get('SELECT version FROM versions WHERE course_id=? AND version=?',c.id,r))fail(404,'Revision not found');if(store.get('SELECT business_id FROM business_tracks WHERE course_id=? AND published=?',c.id,r))fail(409,'Switch the current revision before deleting it');store.transaction(()=>{store.run('INSERT INTO material_revision_state VALUES(?,?,0,1,?) ON CONFLICT(course_id,revision) DO UPDATE SET deleted=1,updated=excluded.updated',c.id,r,store.now());store.run('DELETE FROM business_publications WHERE course_id=? AND revision=?',c.id,r);for(const id of branches(c,r)){const newest=store.get('SELECT MAX(b.revision) AS revision FROM business_materials b LEFT JOIN material_revision_state s ON s.course_id=b.course_id AND s.revision=b.revision WHERE b.course_id=? AND b.business_id=? AND COALESCE(s.deleted,0)=0',c.id,id)?.revision||0;store.run('UPDATE business_tracks SET draft=? WHERE course_id=? AND business_id=?',newest,c.id,id)}store.audit(actor,'material.deleted',{course:c.id,revision:r,learningRecordsRetained:true})});return {ok:true}}
 return {state,available,published,source,upload,list,remove};
}
