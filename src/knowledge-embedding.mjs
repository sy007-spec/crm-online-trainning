import os from 'node:os';
import path from 'node:path';
export const embeddingVersion='multilingual-e5-small-q8:761b726dd34fb83930e26aab4e9ac3899aa1fa78';
let engine,queue=Promise.resolve(),waiting=0;
export async function embedKnowledge(texts,query=false){
 if(waiting>=32)throw Object.assign(Error('Knowledge encoder busy; retry shortly'),{status:429});
 waiting++;
 const task=queue.then(async()=>{
  if(!engine)engine=(async()=>{const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir=process.env.TRAINING_MODEL_CACHE||path.join(os.homedir(),'.cache','teach-in-public-models');env.backends.onnx.wasm.numThreads=1;return pipeline('feature-extraction','Xenova/multilingual-e5-small',{revision:embeddingVersion.split(':')[1],dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}})})().catch(e=>{engine=null;throw e});
  const encoder=await engine,results=[];
  for(const text of texts){const result=await encoder((query?'query: ':'passage: ')+text,{pooling:'mean',normalize:true});results.push(Array.from(result.data))}
  return results;
 });
 queue=task.catch(()=>{});try{return await task}finally{waiting--}
}
