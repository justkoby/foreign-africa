import {defineConfig,loadEnv} from 'vite';
import {createHandler} from './api/discover.js';
import {createHandler as createCmsHandler} from './api/cms.js';
import {createApp} from './server/app.js';
import {createPool} from './server/db.js';
import {databaseConfigured,readConfig} from './server/config.js';
import {publicItem} from './server/content-store.js';
import {articleRequest,externalRedirect} from './server/html.js';
import {decorateHtml} from './server/site.js';
function attach(res){res.status=code=>{res.statusCode=code;return res};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res}}
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 const config=readConfig(env);
 const pool=databaseConfigured(config)?createPool(config):null;
 return {server:{allowedHosts:['terminal.local']},plugins:[{name:'local-discovery-api',configureServer(server){
  const discover=createHandler({env});
  const cms=createCmsHandler({env});
  server.middlewares.use('/api/discover',async(req,res)=>{
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){res.statusCode=413;res.end(JSON.stringify({error:'Question is too long.'}));return}}
   req.body=raw;attach(res);await discover(req,res);
  });
  const staff=createApp({config,pool});
  server.middlewares.use(async(req,res,next)=>{
   const path=req.url.split('?')[0];
   if(path.startsWith('/api/staff')||path.startsWith('/api/public')||path==='/api/health'||path==='/robots.txt'||path==='/sitemap.xml'||path.startsWith('/media/'))return staff(req,res);
   const request=articleRequest(path);
   if(request&&pool){
    try{
     const item=await publicItem(pool,request.type,request.slug);
     const redirect=externalRedirect(item);
     if(redirect){res.statusCode=302;res.setHeader('Location',redirect);res.end();return}
    }catch{/* A database miss leaves the React page to show its own error. */}
   }
   next();
  });
  server.middlewares.use('/api/cms',async(req,res)=>{
   const chunks=[];let size=0;
   for await(const chunk of req){chunks.push(chunk);size+=chunk.length;if(size>1500000){res.statusCode=413;res.end(JSON.stringify({error:'That update is too large.'}));return}}
   req.url=`/api/cms${req.url}`;req.body=Buffer.concat(chunks).toString();attach(res);await cms(req,res);
  });
 },transformIndexHtml:{order:'pre',async handler(html,ctx){
  const decorated=await decorateHtml({pool,config,pathname:ctx.originalUrl||ctx.path||'',html});
  return decorated?.body||html;
 }}}]};
});
