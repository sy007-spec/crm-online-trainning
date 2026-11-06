export const LOG_DAYS=7;
export function pruneLogs(store,now=Date.now()){
 const cutoff=new Date(now-LOG_DAYS*86400000).toISOString();
 // Keep identity, access decisions, course revisions and discussions: they are not logs.
 for(const [table,column] of [['audit','created'],['model_logs','created'],['visits','created'],['events','created'],['callbacks','created'],['cards','updated'],['ppt_daily','day']]){
  if(store.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?",table))store.run(`DELETE FROM ${table} WHERE ${column} < ?`,column==='day'?cutoff.slice(0,10):cutoff);
 }
}
