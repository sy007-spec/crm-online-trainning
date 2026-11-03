import {uid,fail,ipMatches} from './security.mjs';
export function courseAccess(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS inherited_access(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,user_id TEXT NOT NULL,source_course TEXT NOT NULL,cidr TEXT NOT NULL,device_hash TEXT NOT NULL,expires TEXT,created TEXT NOT NULL,actor TEXT NOT NULL);CREATE INDEX IF NOT EXISTS inherited_user ON inherited_access(course_id,user_id);`);
 const valid=(course,user)=>store.all('SELECT * FROM inherited_access WHERE course_id=? AND user_id=? AND (expires IS NULL OR expires>?)',course,user,store.now());
 const allowed=(s,c)=>valid(c.id,s.user_id).some(g=>ipMatches(s.ip,g.cidr)&&(!g.device_hash||g.device_hash===s.device_hash));
 function snapshot(target,source,actor){if(!source)return {users:0,grants:0};if(typeof source!=='string'||source===target||!store.get('SELECT id FROM courses WHERE id=? AND enabled=1',source))fail(400,'Choose a different enabled source course');const now=store.now(),items=[];
  for(const r of store.all("SELECT user_id,ip,device_hash,expires FROM requests WHERE course_id=? AND status='approved' AND expires>?",source,now))items.push({user:r.user_id,cidr:r.ip,device:r.device_hash,expires:r.expires});
  const people=store.all('SELECT DISTINCT user_id,ip FROM visits WHERE course_id=? UNION SELECT s.user_id,s.ip FROM sessions s JOIN verified_sessions v ON v.session_id=s.id WHERE s.course_id=? AND s.expires>?',source,source,now),whitelist=store.all('SELECT * FROM whitelist WHERE course_id=? AND (expires IS NULL OR expires>?)',source,now);
  for(const p of people)for(const w of whitelist)if(ipMatches(p.ip,w.cidr))items.push({user:p.user_id,cidr:w.cidr,device:'',expires:w.expires});
  for(const g of store.all('SELECT * FROM inherited_access WHERE course_id=? AND (expires IS NULL OR expires>?)',source,now))items.push({user:g.user_id,cidr:g.cidr,device:g.device_hash,expires:g.expires});
  let added=0;const users=new Set();for(const g of items){if(!store.get('SELECT user_id FROM email_users WHERE user_id=?',g.user))continue;users.add(g.user);if(store.get('SELECT id FROM inherited_access WHERE course_id=? AND user_id=? AND source_course=? AND cidr=? AND device_hash=? AND expires IS ?',target,g.user,source,g.cidr,g.device,g.expires))continue;store.run('INSERT INTO inherited_access VALUES(?,?,?,?,?,?,?,?,?)',uid(),target,g.user,source,g.cidr,g.device,g.expires,now,actor);added++}store.audit(actor,'course.access-snapshot',{course:target,source,users:users.size,grants:added});return {users:users.size,grants:added};
 }
 return {allowed,snapshot};
}
