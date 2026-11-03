import {dateRange,dayKey,digest,fail} from './security.mjs';
export function pptAnalytics(store){
 store.db.exec([
 'CREATE TABLE IF NOT EXISTS ppt_metrics(minute TEXT,share_id TEXT,visitor TEXT,ip TEXT,outcome TEXT,page TEXT,language TEXT,hits INTEGER NOT NULL,seconds REAL NOT NULL,PRIMARY KEY(minute,share_id,visitor,ip,outcome,page,language));',
 'CREATE INDEX IF NOT EXISTS ppt_metrics_time ON ppt_metrics(minute);',
 'CREATE INDEX IF NOT EXISTS ppt_metrics_share ON ppt_metrics(share_id,minute);',
 'CREATE TABLE IF NOT EXISTS ppt_metric_seen(id TEXT PRIMARY KEY,stamp INTEGER);',
 'CREATE TABLE IF NOT EXISTS ppt_metric_state(share_id TEXT,visitor TEXT,page TEXT,stamp INTEGER,active INTEGER,PRIMARY KEY(share_id,visitor));'].join(''));
 if(!store.setting('pptAnalyticsSince'))store.set('pptAnalyticsSince',store.now());
 let cleaned=0;
 const identity=v=>/^[a-f0-9]{64}$/.test(v||'')?digest(v):'';
 function record({share='',visitor='',ip,outcome,page='',language='',seconds=0}){
  const now=Date.now(),minute=new Date(Math.floor(now/60000)*60000).toISOString();
  if(now-cleaned>3600000){store.run('DELETE FROM ppt_metrics WHERE minute<?',new Date(now-90*86400000).toISOString());store.run('DELETE FROM ppt_metric_seen WHERE stamp<?',now-86400000);store.run('DELETE FROM ppt_metric_state WHERE stamp<?',now-86400000);cleaned=now}
  store.run('INSERT INTO ppt_metrics VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT(minute,share_id,visitor,ip,outcome,page,language) DO UPDATE SET hits=hits+1,seconds=seconds+excluded.seconds',minute,share,identity(visitor),ip,outcome,page,language,seconds);
 }
 function event(share,visitor,ip,b){
  if(!identity(visitor)||!b||!['view','heartbeat','pause'].includes(b.kind)||!/^[a-f0-9-]{36}$/.test(b.id||'')||!['zh','en'].includes(b.language))fail(400,'Invalid reading event');
  const who=identity(visitor),now=Date.now(),eventId=digest(share+who+b.id);
  return store.transaction(()=>{
   if(store.get('SELECT id FROM ppt_metric_seen WHERE id=?',eventId))return {ok:true,duplicate:true};
   store.run('INSERT INTO ppt_metric_seen VALUES(?,?)',eventId,now);
   const previous=store.get('SELECT * FROM ppt_metric_state WHERE share_id=? AND visitor=?',share,who);
   const seconds=b.kind!=='view'&&previous?.active&&previous.page===b.page&&now-previous.stamp<=30000?Math.max(0,Math.min(25,(now-previous.stamp)/1000)):0;
   store.run('INSERT INTO ppt_metric_state VALUES(?,?,?,?,?) ON CONFLICT(share_id,visitor) DO UPDATE SET page=excluded.page,stamp=excluded.stamp,active=excluded.active',share,who,b.page,now,b.kind==='pause'?0:1);
   record({share,visitor,ip,outcome:b.kind,page:b.page,language:b.language,seconds});
   return {ok:true,seconds};
  });
 }
 function report(q){
  const from=q.get('from')||dayKey(new Date(Date.now()-6*86400000)),to=q.get('to')||dayKey(),[start,end]=dateRange(from,to);
  if(Date.parse(end)-Date.parse(start)>31*86400000)fail(400,'Select at most 31 days');
  let where='m.minute>=? AND m.minute<?',args=[start,end];
  for(const [key,column] of [['course','p.course_id'],['share','m.share_id'],['ip','m.ip'],['visitor','m.visitor'],['outcome','m.outcome'],['page','m.page']])if(q.get(key)){if(q.get(key).length>200)fail(400,'Invalid filter');where+=' AND '+column+'=?';args.push(key==='share'&&q.get(key)==='unknown'?'':q.get(key))}
  if(q.get('hour')){const h=q.get('hour');if(!/^\d{4}-\d\d-\d\dT\d\d$/.test(h))fail(400,'Invalid hour');where+=' AND substr(m.minute,1,13)=?';args.push(h)}
  const base=' FROM ppt_metrics m LEFT JOIN ppt_shares p ON p.id=m.share_id WHERE '+where;
  const all=(sql,tail='')=>store.all(sql+base+tail,...args);
  const summary=all("SELECT COALESCE(SUM(CASE WHEN outcome='open' THEN hits ELSE 0 END),0) opens,COUNT(DISTINCT CASE WHEN outcome IN ('open','view','heartbeat') AND visitor<>'' THEN visitor END) browsers,COUNT(DISTINCT ip) ips,COALESCE(SUM(CASE WHEN outcome='view' THEN hits ELSE 0 END),0) views,COALESCE(SUM(seconds),0) seconds,COALESCE(SUM(CASE WHEN outcome IN ('blocked','expired','invalid','limited') THEN hits ELSE 0 END),0) blocked")[0];
  const timeline=all("SELECT substr(minute,1,13) hour,SUM(CASE WHEN outcome='open' THEN hits ELSE 0 END) opens,SUM(CASE WHEN outcome IN ('blocked','expired','invalid','limited') THEN hits ELSE 0 END) blocked,SUM(seconds) seconds",' GROUP BY hour ORDER BY hour');
  const shares=all("SELECT m.share_id,p.course_id,p.creator_name,p.creator_email,SUM(CASE WHEN outcome='open' THEN hits ELSE 0 END) opens,COUNT(DISTINCT NULLIF(visitor,'')) browsers,SUM(seconds) seconds",' GROUP BY m.share_id ORDER BY opens DESC LIMIT 20');
  const pages=all("SELECT m.share_id,p.course_id,m.page,SUM(CASE WHEN outcome='view' THEN hits ELSE 0 END) views,SUM(seconds) seconds"," AND m.page<>'' GROUP BY m.share_id,m.page ORDER BY seconds DESC LIMIT 15");
  const burst=all("SELECT substr(minute,1,13) hour,minute,m.ip,m.share_id,SUM(CASE WHEN outcome IN ('blocked','expired','invalid','limited') THEN hits ELSE 0 END) n"," GROUP BY minute,m.ip,m.share_id HAVING n>=10 ORDER BY n DESC LIMIT 30").map(r=>({...r,rule:'blockedBurst'}));
  const spread=all("SELECT substr(minute,1,13) hour,m.share_id,COUNT(DISTINCT NULLIF(visitor,'')) n"," AND outcome IN ('open','view') GROUP BY hour,m.share_id HAVING n>=10 ORDER BY n DESC LIMIT 30").map(r=>({...r,rule:'shareSpread'}));
  const changing=all("SELECT substr(minute,1,13) hour,m.share_id,m.visitor,COUNT(DISTINCT ip) n"," AND visitor<>'' AND outcome IN ('open','view','heartbeat') GROUP BY hour,m.share_id,m.visitor HAVING n>=4 ORDER BY n DESC LIMIT 30").map(r=>({...r,rule:'changingIp'}));
  const rapid=all("SELECT substr(minute,1,13) hour,minute,m.share_id,m.visitor,SUM(hits) n"," AND outcome='view' GROUP BY minute,m.share_id,m.visitor HAVING n>=20 ORDER BY n DESC LIMIT 30").map(r=>({...r,rule:'rapidPages'}));
  const offset=Math.min(100000,Math.max(0,Math.floor(Number(q.get('offset'))||0)));
  const total=all('SELECT COUNT(*) n')[0].n;
  const records=store.all('SELECT m.*,p.course_id,p.creator_email,(SELECT v.email FROM ppt_visitors v WHERE v.share_id=m.share_id AND v.visitor=m.visitor) visitor_email'+base+' ORDER BY minute DESC,m.share_id,m.ip LIMIT 50 OFFSET ?',...args,offset);
  return {from,to,since:store.setting('pptAnalyticsSince'),retentionDays:90,summary,timeline,shares,pages,alerts:[...burst,...spread,...changing,...rapid].sort((a,b)=>b.n-a.n),records,total,offset};
 }
 return {record,event,report};
}
