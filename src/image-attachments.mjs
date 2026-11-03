import sharp from 'sharp';
import {uid,fail} from './security.mjs';
export function imageAttachments(store,quota){
 store.db.exec(`CREATE TABLE IF NOT EXISTS image_attachments(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,course_id TEXT NOT NULL,question_id TEXT,page_id TEXT,width INTEGER NOT NULL,height INTEGER NOT NULL,data BLOB NOT NULL,created TEXT NOT NULL);CREATE INDEX IF NOT EXISTS images_question ON image_attachments(question_id);CREATE INDEX IF NOT EXISTS images_note ON image_attachments(user_id,course_id,page_id);`);
 const list=(question,user,course,page)=>store.all('SELECT id,width,height,length(data) bytes FROM image_attachments WHERE '+(question?'question_id=?':'question_id IS NULL AND user_id=? AND course_id=? AND page_id=?'),...(question?[question]:[user,course,page]));
 async function prepare(input,user,course,page=null){
  if(input===undefined)return null;if(!Array.isArray(input)||input.length>4)fail(400,'Up to 4 images allowed');const result=[];let added=0;
  for(const item of input){if(item?.id){const old=page&&store.get('SELECT * FROM image_attachments WHERE id=? AND user_id=? AND course_id=? AND page_id=? AND question_id IS NULL',item.id,user,course,page);if(!old||result.some(x=>x.id===old.id))fail(400,'Invalid image reference');result.push(old);continue}
   if(typeof item?.data!=='string'||item.data.length>240000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.data))fail(400,'Invalid image data');const raw=Buffer.from(item.data.split(',')[1],'base64');if(raw.length>180000)fail(413,'Image too large');
   try{const source=sharp(raw,{limitInputPixels:16000000,failOn:'warning'}),meta=await source.metadata();if(!['png','jpeg','webp'].includes(meta.format)||(meta.pages||1)>1)fail(400,'Use a static PNG, JPEG or WebP image');const {data,info}=await source.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:3}).toBuffer({resolveWithObject:true});if(data.length>200000)fail(413,'Image too large');added+=data.length;result.push({id:uid(),data,width:info.width,height:info.height})}catch(e){if(e.status)throw e;fail(400,'Image cannot be decoded')}
  }
  if(added+(store.get('SELECT COALESCE(SUM(length(data)),0) bytes FROM image_attachments WHERE user_id=?',user).bytes)>50000000)fail(413,'Image storage limit reached');return result;
 }
 function save(items,user,course,question=null,page=null){if(items===null)return;if(!question){const keep=new Set(items.map(x=>x.id));for(const row of list(null,user,course,page))if(!keep.has(row.id))store.run('DELETE FROM image_attachments WHERE id=?',row.id)}quota?.consume('images',items.filter(item=>!store.get('SELECT id FROM image_attachments WHERE id=?',item.id)).length);for(const item of items)store.run('INSERT OR IGNORE INTO image_attachments VALUES(?,?,?,?,?,?,?,?,?)',item.id,user,course,question,page,item.width,item.height,item.data,store.now())}
 return {list,prepare,save};
}
