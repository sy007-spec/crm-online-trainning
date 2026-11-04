import {fail,passwordHash,passwordValid} from './security.mjs';
export function profileSecurity(store,s){
 const configured=store.get('SELECT * FROM account_security WHERE user_id=?',s.user_id);
 const root=!!store.get('SELECT id FROM sessions WHERE id=? AND admin=1',s.id);
 const instructor=store.get('SELECT i.* FROM instructors i JOIN instructor_sessions x ON x.instructor_id=i.id WHERE x.session_id=?',s.id);
 const describe=()=>({methods:[...(configured?[{id:'security',mode:configured.mode,question:configured.question}]:[]),...(root||instructor?[{id:'password',minLength:14}]:[])]});
 function change(b){
  const original=b.method==='security'?configured?.secret_hash:b.method==='password'?(root?store.setting('adminHash'):instructor?.password_hash):null;
  const normalize=v=>String(v||'').trim().normalize('NFKC').toLowerCase();
  const current=b.method==='security'&&configured?.mode==='question'?normalize(b.current):String(b.current||'');
  if(!original||current.length>200||!passwordValid(current,original))fail(401,'Current security answer or password is incorrect');
  if(b.method==='security'){
   if(!['question','password'].includes(b.mode))fail(400,'Choose a security method');
   const secret=b.mode==='question'?normalize(b.secret):String(b.secret||'');
   const confirm=b.mode==='question'?normalize(b.confirm):String(b.confirm||'');
   if(secret!==confirm)fail(400,'Security confirmation does not match');
   if(secret.length>200)fail(400,'Security value is too long');
   if(b.mode==='password'&&(secret.length<8||!secret.trim()))fail(400,'Security password needs at least 8 characters');
   if(b.mode==='question'&&!((secret.match(/[a-z]/g)||[]).length>=7||(secret.match(/\p{Script=Han}/gu)||[]).length>=3))fail(400,'Answer needs at least 7 English letters or 3 Chinese characters');
   const question=b.mode==='question'?String(b.question||'').trim():'';
   if(b.mode==='question'&&(question.length<3||question.length>200))fail(400,'Choose or enter a security question');
   store.run('UPDATE account_security SET mode=?,question=?,secret_hash=?,created=? WHERE user_id=?',b.mode,question,passwordHash(secret),store.now(),s.user_id);
   store.run('DELETE FROM security_challenges WHERE email=?',s.user.contact);
  }else{
   if(typeof b.secret!=='string'||b.secret.length<14||b.secret.length>200||b.secret!==b.confirm)fail(400,'Use matching passwords of 14–200 characters');
   if(root){store.set('adminHash',passwordHash(b.secret));store.run('DELETE FROM sessions WHERE admin=1 AND id<>?',s.id)}
   else{store.run('UPDATE instructors SET password_hash=? WHERE id=?',passwordHash(b.secret),instructor.id);store.run('DELETE FROM sessions WHERE id<>? AND id IN (SELECT session_id FROM instructor_sessions WHERE instructor_id=?)',s.id,instructor.id)}
  }
  store.run('DELETE FROM sessions WHERE user_id=? AND id<>?',s.user_id,s.id);
  store.audit(s.user_id,'profile.security-changed',{method:b.method});return {ok:true};
 }
 return {describe,change};
}
