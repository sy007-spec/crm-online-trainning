import {fail} from './security.mjs';

// Counters survive deletion; all writers share the tenant database transaction.
export function spaceQuota(store,hosting){
 store.db.exec('CREATE TABLE IF NOT EXISTS space_usage(month TEXT,kind TEXT,used INTEGER NOT NULL,PRIMARY KEY(month,kind))');
 const month=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date(store.now())).replace('/', '-');
 const policy=()=>hosting?.status()?.limits||null;
 function describe(){const limits=policy();return {month:month(),limits,used:Object.fromEntries(store.all('SELECT kind,used FROM space_usage WHERE month=?',month()).map(r=>[r.kind,r.used]))}}
 function imagePolicy(count=1){const limits=policy();if(!limits)return {allowed:true};if(hosting.status().active&&limits.images===null)return {allowed:true};if(!hosting.status().active||!Number.isInteger(limits.images)||limits.images<=0)return {allowed:false,reason:'image_upload_unsupported'};const used=store.get('SELECT used FROM space_usage WHERE month=? AND kind=?',month(),'images')?.used||0;return used+count>limits.images?{allowed:false,reason:'image_quota_exhausted'}:{allowed:true}}
 function consume(kind,count=1){if(!count)return;if(kind==='images'){const access=imagePolicy(count);if(!access.allowed)throw Object.assign(Error(access.reason==='image_upload_unsupported'?'Image uploads are unavailable':'Image quota exhausted'),{status:access.reason==='image_upload_unsupported'?403:429,code:access.reason})}const limits=policy();if(!limits)return;if(!hosting.status().active)fail(402,'此空间订阅已到期 / This space subscription has expired');const max=limits[kind];if(max===null)return;if(!Number.isInteger(max)||max<0)fail(403,'此空间未开放该功能 / This feature is unavailable for this space');const used=store.get('SELECT used FROM space_usage WHERE month=? AND kind=?',month(),kind)?.used||0;if(used+count>max)fail(429,'此空间本月'+({courses:'新增教材',images:'图片上传',aiTokens:'全局大模型 tokens'}[kind]||kind)+'额度已用尽，请联系空间管理员 / This space has reached its monthly '+kind+' limit; contact the space administrator');store.run('INSERT INTO space_usage VALUES(?,?,?) ON CONFLICT(month,kind) DO UPDATE SET used=used+excluded.used',month(),kind,count)}
 function settle(reserved,actual,period){if(!Number.isInteger(actual)||actual<0||actual>reserved)return;store.run('UPDATE space_usage SET used=MAX(0,used-?) WHERE month=? AND kind=?',reserved-actual,period,'aiTokens')}
 return {describe,consume,settle,imagePolicy};
}
