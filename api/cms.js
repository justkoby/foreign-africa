import {createCms} from '../server/cms-service.js';
const buckets=new Map();
async function readBody(req,limit){
 if(typeof req.body==='string'){if(req.body.length>limit)throw Object.assign(new Error('large'),{status:413});return req.body?JSON.parse(req.body):{}}
 if(req.body&&typeof req.body==='object')return req.body;
 const raw=await new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>limit)reject(Object.assign(new Error('large'),{status:413}))});req.on('end',()=>resolve(data));req.on('error',reject)});
 if(raw.length>limit)throw Object.assign(new Error('large'),{status:413});
 return raw?JSON.parse(raw):{};
}
export function createHandler({env=process.env,root,clock=Date.now,limits=buckets}={}){
 const cms=createCms({root,env,clock});
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url||'/',`http://${req.headers?.host||'localhost'}`);
  const path=url.pathname.replace(/^\/api\/cms/,'').replace(/\/$/,'')||'/';
  const authed=cms.session(req.headers?.cookie||'');
  const limit=(name,max)=>{const now=clock();for(const [key,value]of limits)if(now-value.start>=60000)limits.delete(key);const bucket=limits.get(name)??{start:now,count:0};if(bucket.count>=max)return false;bucket.count++;limits.set(name,bucket);return true};
  try{
   if(path==='/session'&&req.method==='GET')return res.status(200).json({ok:authed});
   if(path==='/login'&&req.method==='POST'){
    if(!cms.password())return res.status(503).json({error:'Set CMS_PASSWORD in .env.local, then restart the site.'});
    if(!limit('login',8))return res.status(429).json({error:'Wait a minute, then try again.'});
    const body=await readBody(req,1000);
    if(!cms.same(body.password??'',cms.password()))return res.status(401).json({error:'That password is not correct.'});
    res.setHeader('Set-Cookie',cms.cookie());return res.status(200).json({ok:true});
   }
   if(path==='/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','fa_editor=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return res.status(200).json({ok:true})}
   const form=path.match(/^\/forms\/([a-z0-9_-]+)$/);
   if(form&&req.method==='GET'){const found=cms.publicForm(form[1]);return found?res.status(200).json(found):res.status(404).json({error:'Form unavailable.'})}
   if(path==='/submit'&&req.method==='POST'){
    if(!limit('submit',20))return res.status(429).json({error:'Wait a minute, then try again.'});
    const body=await readBody(req,100000);
    const result=cms.submit(body.formId,body.answers,body.key);
    return res.status(result.status??200).json(result);
   }
   if(!authed)return res.status(401).json({error:'Sign in to continue.'});
   const article=path.match(/^\/article\/([a-z0-9-]+)$/);
   if(article&&req.method==='GET'){const found=cms.readArticle(article[1]);return res.status(200).json(found??{id:article[1],content:[{tag:'p',children:['']}]})}
   if(path==='/submissions'&&req.method==='GET')return res.status(200).json(cms.submissions());
   const collection=url.searchParams.get('collection');
   if(path==='/items'&&req.method==='GET'){const data=cms.list(collection);return data?res.status(200).json(data):res.status(404).json({error:'Unknown section.'})}
   if(path==='/items'&&req.method==='PUT'){const body=await readBody(req,1500000);const saved=body.additional?cms.saveAdditional(body.additional):cms.saveItem(body.collection,body.item);if(saved.error)return res.status(saved.status??400).json(saved);if(body.collection==='commentaries'&&body.blocks)cms.saveArticle(saved.item.id,body.blocks,saved.item.status);return res.status(200).json(saved)}
   if(path==='/items'&&req.method==='DELETE'){const body=await readBody(req,2000);const removed=cms.removeItem(body.collection,body.id);return res.status(removed.status??200).json(removed)}
   return res.status(404).json({error:'Not found.'});
  }catch(error){return res.status(error.status??400).json({error:error.status===413?'That update is too large.':'The update could not be read.'})}
 };
}
export default createHandler();
