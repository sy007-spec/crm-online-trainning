import {DatabaseSync} from 'node:sqlite';

// Export only teaching content that the classroom administrator can access.
// Deliberately never export sessions, credentials, access codes, IPs, personal
// notes or private discussion threads, even when they share the same database.
export function classroomExport(file){
 const db=new DatabaseSync(file,{readOnly:true});
 const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const rows=(sql,...args)=>db.prepare(sql).iterate(...args);
 const visible=exists('discussion_context')?"COALESCE((SELECT visibility FROM discussion_context WHERE root_id=COALESCE(q.root_id,q.id)),'public') IN ('public','staff')":"1=1";
 function* records(course){
  yield {type:'course',data:db.prepare('SELECT id,title,published,draft,enabled,created FROM courses WHERE id=?').get(course)};
  for(const table of ['versions','business_tracks','business_materials','business_publications','material_sources','material_revision_state','annotations','course_links','faq']){
   if(!exists(table))continue;
   for(const row of rows('SELECT * FROM '+table+' WHERE course_id=? ORDER BY rowid',course))yield {type:table,data:row};
  }
  for(const row of rows('SELECT q.* FROM questions q WHERE q.course_id=? AND '+visible+' ORDER BY q.rowid',course)){
   yield {type:'question',data:row};
   if(exists('discussion_languages'))for(const language of rows('SELECT * FROM discussion_languages WHERE question_id=?',row.id))yield {type:'discussion_languages',data:language};
   if(exists('discussion_context')){const meta=db.prepare('SELECT * FROM discussion_context WHERE root_id=?').get(row.root_id||row.id);if(meta&&row.id===(row.root_id||row.id))yield {type:'discussion_context',data:meta};}
   if(exists('question_edits'))for(const edit of rows('SELECT * FROM question_edits WHERE question_id=? ORDER BY rowid',row.id))yield {type:'question_edits',data:edit};
  }
  if(exists('faq_revisions'))for(const row of rows('SELECT r.* FROM faq_revisions r JOIN faq f ON f.id=r.faq_id WHERE f.course_id=? ORDER BY r.rowid',course))yield {type:'faq_revisions',data:row};
  if(exists('faq_business'))for(const row of rows('SELECT b.* FROM faq_business b JOIN faq f ON f.id=b.faq_id WHERE f.course_id=? ORDER BY b.rowid',course))yield {type:'faq_business',data:row};
  if(exists('faq_links'))for(const row of rows('SELECT l.* FROM faq_links l JOIN faq f ON f.id=l.faq_id WHERE f.course_id=? ORDER BY l.rowid',course))yield {type:'faq_links',data:row};
  if(exists('image_attachments'))for(const row of rows('SELECT i.* FROM image_attachments i JOIN questions q ON q.id=i.question_id WHERE i.course_id=? AND '+visible+' ORDER BY i.rowid',course))yield {type:'image',data:{...row,data:Buffer.from(row.data).toString('base64'),encoding:'base64',mime:'image/webp'}};
 }
 return {courses:()=>db.prepare('SELECT id,title,enabled FROM courses ORDER BY id').all(),records,begin:()=>db.exec('BEGIN'),end:()=>db.exec('COMMIT'),close:()=>db.close()};
}
