import {uid,fail} from './security.mjs';
export const normalizeEmail=value=>String(value||'').trim().toLowerCase();
export const validEmail=value=>value.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function emailIdentity(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS email_users(email TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS session_devices(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,device_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS identity_merge_archive(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_user_id TEXT NOT NULL,records TEXT NOT NULL,created TEXT NOT NULL);`);
 if(!store.all('PRAGMA table_info(requests)').some(c=>c.name==='device_hash'))store.db.exec("ALTER TABLE requests ADD COLUMN device_hash TEXT NOT NULL DEFAULT ''");
 store.run("UPDATE requests SET device_hash=COALESCE((SELECT device_hash FROM users WHERE id=requests.user_id),'') WHERE device_hash=''");
 store.run('INSERT OR IGNORE INTO session_devices SELECT s.id,u.device_hash FROM sessions s LEFT JOIN instructor_sessions i ON i.session_id=s.id JOIN users u ON u.id=COALESCE(i.device_user_id,s.user_id)');
 function merge(source,target){if(source===target)return;
  const records={profile:store.get('SELECT * FROM users WHERE id=?',source)};for(const table of ['notes','learning_checks','votes','read_state'])records[table]=store.all('SELECT * FROM '+table+' WHERE user_id=?',source);
  store.run('INSERT INTO identity_merge_archive VALUES(?,?,?,?,?)',uid(),target,source,JSON.stringify(records),store.now());
  for(const n of records.notes){const old=store.get('SELECT * FROM notes WHERE user_id=? AND course_id=? AND page_id=?',target,n.course_id,n.page_id);if(old){if(old.body!==n.body)store.run('UPDATE notes SET body=?,updated=? WHERE user_id=? AND course_id=? AND page_id=?',old.body+'\n\n---\n[合并历史笔记 / Merged historical note · '+n.updated+']\n'+n.body,old.updated>n.updated?old.updated:n.updated,target,n.course_id,n.page_id)}else store.run('INSERT INTO notes VALUES(?,?,?,?,?,?)',target,n.course_id,n.page_id,n.body,n.updated,n.material_version)}
  for(const n of records.learning_checks)store.run('INSERT INTO learning_checks VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id,page_id,version) DO UPDATE SET understood=excluded.understood,updated=excluded.updated WHERE excluded.updated>learning_checks.updated',target,n.course_id,n.page_id,n.version,n.understood,n.updated);
  for(const n of records.votes)store.run('INSERT OR IGNORE INTO votes VALUES(?,?)',target,n.question_id);
  for(const table of ['notes','learning_checks','votes','read_state'])store.run('DELETE FROM '+table+' WHERE user_id=?',source);
  for(const table of ['sessions','requests','visits','events','questions','image_attachments'])store.run('UPDATE '+table+' SET user_id=? WHERE user_id=?',target,source);
  store.run('UPDATE instructor_users SET user_id=? WHERE user_id=?',target,source);
  store.run('UPDATE users SET lark_id=COALESCE(lark_id,?),tenant=COALESCE(tenant,?) WHERE id=?',records.profile.lark_id,records.profile.tenant,target);
  store.run("UPDATE users SET contact='',lark_id=NULL,tenant=NULL WHERE id=?",source);
  store.audit('system','identity.email-merged',{source,target});
 }
 function bind(source,email,name){email=normalizeEmail(email);if(!validEmail(email))fail(400,'Valid email required');return store.transaction(()=>{
  const old=store.get('SELECT * FROM users WHERE id=?',source);let target=store.get('SELECT user_id FROM email_users WHERE email=?',email)?.user_id;
  if(!target){target=old&&!store.get('SELECT email FROM email_users WHERE user_id=?',source)?source:uid();if(target!==source)store.run('INSERT INTO users(id,device_hash,name,contact,created) VALUES(?,?,?,?,?)',target,'email:'+target,name,email,store.now());store.run('INSERT INTO email_users VALUES(?,?)',email,target)}
  if(old&&source!==target&&!store.get('SELECT email FROM email_users WHERE user_id=?',source))merge(source,target);
  store.run('UPDATE users SET name=?,contact=? WHERE id=?',name,email,target);return target;
 })}
 store.transaction(()=>{for(const row of store.all("SELECT * FROM users WHERE contact<>'' ORDER BY created,id")){const email=normalizeEmail(row.contact);if(validEmail(email)&&!store.get('SELECT email FROM email_users WHERE user_id=?',row.id))bind(row.id,email,row.name)}});
 if(!store.setting('email-identity-migrated'))store.transaction(()=>{for(const row of store.all('SELECT s.id,u.contact FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.admin=0 AND NOT EXISTS (SELECT 1 FROM instructor_sessions i WHERE i.session_id=s.id)'))if(!validEmail(normalizeEmail(row.contact)))store.run('UPDATE sessions SET course_id=NULL WHERE id=?',row.id);store.set('email-identity-migrated',true)});
 return {bind};
}

