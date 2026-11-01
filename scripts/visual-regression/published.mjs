// Publishes the DEFAULT homepage and hero through the real CMS API on a throwaway database (set EDIT=1 to also change
// one sentence), then captures the public homepage. Compare the result with a baseline captured from the built-in content.
// Usage: [TEST_DB=mariadb] node scripts/visual-regression/published.mjs <outDir>
// Publishes the DEFAULT content through the real CMS API, then captures the public homepage for comparison.
import {createDisposableMysql} from '../../tests/helpers/mysql.js';
import {spawn,spawnSync} from 'node:child_process';
const db=await createDisposableMysql();const port=4185;
const env={...process.env,PORT:String(port),APP_ENV:'development',PUBLIC_SITE_URL:`http://localhost:${port}`,DB_HOST:'127.0.0.1',DB_PORT:String(db.port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:db.dbName,SESSION_SECRET:'vr-secret-vr-secret',PREPARE_DATABASE:'1',BOOTSTRAP_ADMIN_EMAIL:'ada@foreignafrica.org',BOOTSTRAP_ADMIN_PASSWORD:'correct-horse-battery',PASSWORD_COST:'4'};
const srv=spawn('node',['server/index.js'],{cwd:new URL('../..',import.meta.url).pathname,env,stdio:['ignore','pipe','pipe']});
let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
for(let i=0;i<80&&!log.includes('listening');i++)await new Promise(r=>setTimeout(r,500));
const base=`http://localhost:${port}`;
const login=await fetch(base+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:'ada@foreignafrica.org',password:'correct-horse-battery'})});
const cookie=login.headers.get('set-cookie').split(';')[0];
const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:body&&JSON.stringify(body)});return {status:r.status,data:await r.json()}};
for(const key of ['hero','homepage']){
  const got=await call('/api/staff/site/'+key);
  if(process.env.EDIT&&key==='homepage'){got.data.document.about.lead='Africa’s place in the global economy should create opportunity for its people everywhere.'}
  const saved=await call('/api/staff/site/'+key,'PUT',{document:got.data.document,baseVersion:got.data.state.version});
  const pub=await call(`/api/staff/site/${key}/publish`,'POST',{baseVersion:saved.data.state.version});
  console.log(key,'save',saved.status,'publish',pub.status,pub.data.error??'');
}
const html=await (await fetch(base+'/')).text();
console.log('homepage HTML carries published data:',html.includes('fa-site-data'),'size',html.length);
const r=spawnSync('node',[new URL('./capture.mjs',import.meta.url).pathname,base,process.argv[2]],{encoding:'utf8'});console.log(r.stdout.trim().split('\n').slice(-2).join('\n'),r.stderr.slice(0,300));
srv.kill();await db.stop();
