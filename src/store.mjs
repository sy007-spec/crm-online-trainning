import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {uid,token,digest,passwordHash} from './security.mjs';
export function openStore(runtime,seedMaterial=null,emptyCourses=false){fs.mkdirSync(runtime,{recursive:true,mode:0o700});const db=new DatabaseSync(path.join(runtime,'training.sqlite'),{allowExtension:true});db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,device_hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL DEFAULT '',contact TEXT NOT NULL DEFAULT '',lark_id TEXT,tenant TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT NOT NULL,ip TEXT NOT NULL,course_id TEXT,admin INTEGER NOT NULL DEFAULT 0,expires TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,title TEXT NOT NULL,code_hash TEXT NOT NULL,code_lookup TEXT UNIQUE NOT NULL,published INTEGER NOT NULL DEFAULT 0,draft INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS versions(course_id TEXT REFERENCES courses(id),version INTEGER NOT NULL,material TEXT NOT NULL,author TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(course_id,version));
CREATE TABLE IF NOT EXISTS publications(course_id TEXT REFERENCES courses(id),version INTEGER NOT NULL,published_at TEXT NOT NULL,PRIMARY KEY(course_id,version));
CREATE TABLE IF NOT EXISTS whitelist(id TEXT PRIMARY KEY,course_id TEXT REFERENCES courses(id),cidr TEXT NOT NULL,label TEXT NOT NULL,expires TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),course_id TEXT REFERENCES courses(id),ip TEXT NOT NULL,status TEXT NOT NULL,expires TEXT,actor TEXT,created TEXT NOT NULL,decided TEXT);
CREATE INDEX IF NOT EXISTS request_access ON requests(user_id,course_id,ip,status);
CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,user_id TEXT NOT NULL,course_id TEXT NOT NULL,ip TEXT NOT NULL,agent TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS course_visits(user_id TEXT NOT NULL,course_id TEXT NOT NULL,PRIMARY KEY(user_id,course_id));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,user_id TEXT NOT NULL,course_id TEXT NOT NULL,page_id TEXT NOT NULL,version INTEGER NOT NULL,kind TEXT NOT NULL,seconds REAL NOT NULL DEFAULT 0,scroll REAL NOT NULL DEFAULT 0,language TEXT NOT NULL,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS event_stats ON events(course_id,created,page_id,user_id);
CREATE TABLE IF NOT EXISTS learning_checks(user_id TEXT,course_id TEXT,page_id TEXT,version INTEGER,understood INTEGER NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(user_id,course_id,page_id,version));
CREATE TABLE IF NOT EXISTS read_state(user_id TEXT,course_id TEXT,page_id TEXT,tab_id TEXT,stamp INTEGER,active INTEGER,PRIMARY KEY(user_id,course_id));
CREATE TABLE IF NOT EXISTS notes(user_id TEXT,course_id TEXT,page_id TEXT,body TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(user_id,course_id,page_id));
CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,page_id TEXT NOT NULL,user_id TEXT REFERENCES users(id),parent_id TEXT REFERENCES questions(id),root_id TEXT,body TEXT NOT NULL,teacher INTEGER NOT NULL DEFAULT 0,resolved INTEGER NOT NULL DEFAULT 0,removed INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS question_threads ON questions(course_id,page_id,root_id,created);
CREATE TABLE IF NOT EXISTS votes(user_id TEXT,question_id TEXT REFERENCES questions(id),PRIMARY KEY(user_id,question_id));
CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY,course_id TEXT,page_id TEXT,body TEXT NOT NULL,author TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,detail TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS cards(day TEXT,destination TEXT NOT NULL,message_id TEXT,hash TEXT,updated TEXT,state TEXT,PRIMARY KEY(day,destination));
CREATE TABLE IF NOT EXISTS callbacks(id TEXT PRIMARY KEY,created TEXT NOT NULL);
`);
 for(const table of ['notes','questions']){if(!db.prepare('PRAGMA table_info('+table+')').all().some(c=>c.name==='material_version'))db.exec('ALTER TABLE '+table+' ADD COLUMN material_version INTEGER NOT NULL DEFAULT 1')}
 const get=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 const setting=(key,fallback=null)=>{const row=get('SELECT value FROM settings WHERE key=?',key);return row?JSON.parse(row.value):fallback};
 const set=(key,value)=>run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
 const now=()=>new Date().toISOString();const audit=(actor,action,detail)=>run('INSERT INTO audit VALUES(?,?,?,?,?)',uid(),actor,action,JSON.stringify(detail),now());
 let depth=0;const transaction=fn=>{const name='nested_'+(++depth),nested=depth>1;db.exec(nested?'SAVEPOINT '+name:'BEGIN IMMEDIATE');try{const value=fn();db.exec(nested?'RELEASE SAVEPOINT '+name:'COMMIT');return value}catch(e){db.exec(nested?'ROLLBACK TO SAVEPOINT '+name:'ROLLBACK');if(nested)db.exec('RELEASE SAVEPOINT '+name);throw e}finally{depth--}};
 if(!all('PRAGMA table_info(cards)').some(c=>c.name==='destination')){const cfg=setting('lark',{}),destination=(cfg.receiveType||'chat_id')+':'+(cfg.receiveId||'legacy');transaction(()=>{db.exec('ALTER TABLE cards RENAME TO cards_legacy');db.exec('CREATE TABLE cards(day TEXT,destination TEXT NOT NULL,message_id TEXT,hash TEXT,updated TEXT,state TEXT,PRIMARY KEY(day,destination))');run('INSERT INTO cards SELECT day,?,message_id,hash,updated,state FROM cards_legacy',destination);db.exec('DROP TABLE cards_legacy')})}
 if(!setting('codeKey'))set('codeKey',token());
 if(!setting('adminHash')){const password=process.env.ADMIN_PASSWORD||token();set('adminHash',passwordHash(password));fs.writeFileSync(path.join(runtime,'admin-access.txt'),'Username: admin\nPassword: '+password+'\n',{mode:0o600});}
 try{fs.chmodSync(path.join(runtime,'training.sqlite'),0o600)}catch{}
 if(!emptyCourses&&seedMaterial&&!get('SELECT id FROM courses LIMIT 1')){const code='pamm',id='pamm',revision=seedMaterial?1:0;run('INSERT INTO courses VALUES(?,?,?,?,?,?,?,?)',id,JSON.stringify({zh:'测试课程',en:'Test course'}),passwordHash(code),digest(setting('codeKey')+code),revision,revision,1,now());if(seedMaterial)run('INSERT INTO versions VALUES(?,?,?,?,?)',id,1,JSON.stringify(seedMaterial),'test-fixture',now());}
 for(const c of all('SELECT id,published FROM courses WHERE published>0'))run('INSERT OR IGNORE INTO publications VALUES(?,?,?)',c.id,c.published,now());
 return {db,get,all,run,setting,set,now,audit,transaction,runtime};
}
