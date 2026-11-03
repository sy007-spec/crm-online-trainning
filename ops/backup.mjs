import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
const base=process.env.RUNTIME_DIR||'/data',directory=path.join(base,'backups');fs.mkdirSync(directory,{recursive:true,mode:0o700});const target=path.join(directory,'training-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');const db=new DatabaseSync(path.join(base,'training.sqlite'),{readOnly:true});await backup(db,target);db.close();fs.chmodSync(target,0o600);console.log('Local SQLite online backup completed');
