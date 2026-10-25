import {answerDiscovery,validateInput} from '../server/discovery-service.js';
// Best-effort instance-local limiter; use host-level shared rate limits for public production traffic.
const buckets=new Map();const windowMs=60000;
export function createHandler({env=process.env,fetchImpl=fetch,clock=Date.now,limits=buckets}={}) {
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'})}
  const host=req.headers?.host;const origin=req.headers?.origin;
  if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Origin not allowed.'})}catch{return res.status(403).json({error:'Origin not allowed.'})}}
  const size=Number(req.headers?.['content-length']??0);
  if(size>4096)return res.status(413).json({error:'Question is too long.'});
  let body=req.body;
  if(typeof body==='string'){if(body.length>4096)return res.status(413).json({error:'Question is too long.'});try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Invalid request.'})}}
  const input=validateInput(body);if(!input)return res.status(400).json({error:'Enter a question of 1–500 characters and a valid category.'});
  const now=clock();for(const [key,value]of limits)if(now-value.start>=windowMs)limits.delete(key);
  const address=String(req.headers?.['x-vercel-forwarded-for']??req.socket?.remoteAddress??'unknown').split(',')[0].trim();
  const bucket=limits.get(address)??{start:now,count:0};
  if(bucket.count>=10||(!limits.has(address)&&limits.size>=5000)){res.setHeader('Retry-After','60');return res.status(429).json({error:'Please wait a minute before trying again.'})}
  bucket.count++;limits.set(address,bucket);
  const result=await answerDiscovery(input,{apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL,fetchImpl});
  return res.status(200).json(result);
 };
}
export default createHandler();
