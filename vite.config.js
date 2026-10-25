import {defineConfig,loadEnv} from 'vite';
import {createHandler} from './api/discover.js';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 return {server:{allowedHosts:['terminal.local']},plugins:[{name:'local-discovery-api',configureServer(server){
  const handler=createHandler({env});
  server.middlewares.use('/api/discover',async(req,res)=>{
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){res.statusCode=413;res.end(JSON.stringify({error:'Question is too long.'}));return}}
   req.body=raw;res.status=code=>{res.statusCode=code;return res};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res};
   await handler(req,res);
  });
 }}]};
});
