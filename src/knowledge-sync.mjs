// Durable revision jobs. Drafts are indexed privately; reader authorization still selects publication.
export function knowledgeSync(store,{knowledge,enabled=true}={}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS knowledge_sync_jobs(course_id TEXT,business_id TEXT,revision INTEGER,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,retry_at TEXT NOT NULL DEFAULT '',PRIMARY KEY(course_id,business_id,revision));
 CREATE TRIGGER IF NOT EXISTS knowledge_revision_insert AFTER INSERT ON business_materials BEGIN
 INSERT INTO knowledge_sync_jobs(course_id,business_id,revision) VALUES(new.course_id,new.business_id,new.revision) ON CONFLICT(course_id,business_id,revision) DO UPDATE SET status='pending',attempts=0,retry_at=''; END;
 CREATE TRIGGER IF NOT EXISTS knowledge_revision_update AFTER UPDATE OF material ON business_materials BEGIN
 INSERT INTO knowledge_sync_jobs(course_id,business_id,revision) VALUES(new.course_id,new.business_id,new.revision) ON CONFLICT(course_id,business_id,revision) DO UPDATE SET status='pending',attempts=0,retry_at=''; END;
 CREATE TRIGGER IF NOT EXISTS knowledge_revision_publish AFTER UPDATE OF published ON business_tracks WHEN new.published>0 BEGIN
 INSERT INTO knowledge_sync_jobs(course_id,business_id,revision) VALUES(new.course_id,new.business_id,new.published) ON CONFLICT(course_id,business_id,revision) DO UPDATE SET status='pending',attempts=0,retry_at=''; END;`);
 store.run("UPDATE knowledge_sync_jobs SET status='pending' WHERE status='running'");
 store.run("INSERT OR IGNORE INTO knowledge_sync_jobs(course_id,business_id,revision) SELECT course_id,business_id,published FROM business_tracks WHERE published>0");
 let active=null,stopped=false;
 function run(){if(stopped)return Promise.resolve();if(active)return active;
  active=(async()=>{
   const job=store.get("SELECT * FROM knowledge_sync_jobs WHERE status IN ('pending','failed') AND retry_at<=? ORDER BY CASE WHEN revision=(SELECT published FROM business_tracks WHERE course_id=knowledge_sync_jobs.course_id AND business_id=knowledge_sync_jobs.business_id) THEN 0 ELSE 1 END,rowid LIMIT 1",store.now());if(!job)return;
   const args=[job.course_id,job.business_id,job.revision];
   const c=store.get('SELECT * FROM courses WHERE id=?',job.course_id);
   const valid=()=>!stopped&&!!store.get('SELECT 1 FROM business_materials b WHERE b.course_id=? AND b.business_id=? AND b.revision=? AND NOT EXISTS(SELECT 1 FROM material_revision_state r WHERE r.course_id=b.course_id AND r.revision=b.revision AND r.deleted=1)',...args);
   if(!c||!valid()){store.run('DELETE FROM knowledge_sync_jobs WHERE course_id=? AND business_id=? AND revision=?',...args);return}
   store.run("UPDATE knowledge_sync_jobs SET status='running' WHERE course_id=? AND business_id=? AND revision=?",...args);
   try{await knowledge.ensure({...c,businessId:job.business_id,businessAdmin:true,published:job.revision},valid);store.run("UPDATE knowledge_sync_jobs SET status='ready' WHERE course_id=? AND business_id=? AND revision=? AND status='running'",...args)}
   catch{store.run("UPDATE knowledge_sync_jobs SET status='failed',attempts=attempts+1,retry_at=? WHERE course_id=? AND business_id=? AND revision=? AND status='running'",new Date(Date.parse(store.now())+Math.min(300000,5000*2**Math.min(job.attempts,6))).toISOString(),...args)}
  })().finally(()=>active=null);return active;
 }
 const timer=enabled?setInterval(()=>void run().catch(()=>{}),1000):null;timer?.unref();
 return {run,async close(){stopped=true;clearInterval(timer);await active}};
}
