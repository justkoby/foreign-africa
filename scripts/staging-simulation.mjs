// Simulates the Hostinger temporary-domain staging deployment on a throwaway database: staging mode, an https address
// delivered through proxy headers, the password gate, secure cookies, uploads, preview, cron, and a restart to prove the
// upload folder persists. Usage: [TEST_DB=mariadb] node scripts/staging-simulation.mjs (needs a built site: npm run build)
import {createDisposableMysql} from '../tests/helpers/mysql.js';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';const sharp=createRequire(new URL('../package.json', import.meta.url))('sharp');
const db=await createDisposableMysql();const media=mkdtempSync(join(tmpdir(),'fa-stage-media-'));
const TEMP='https://fa-staging-123.hostingersite.com';const port=4186;const base=`http://127.0.0.1:${port}`;
const CRON='c'.repeat(40);const basic='Basic '+Buffer.from('preview:a-long-staging-password').toString('base64');
const baseEnv={...process.env,PORT:String(port),APP_ENV:'staging',PUBLIC_SITE_URL:TEMP,SESSION_SECRET:'s'.repeat(40),STAGING_USER:'preview',STAGING_PASSWORD:'a-long-staging-password',DB_HOST:'127.0.0.1',DB_PORT:String(db.port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:db.dbName,DB_CONNECTION_LIMIT:'3',MEDIA_ROOT:media,CRON_SECRET:CRON,PASSWORD_COST:'4'};
const out=[];const ok=(n,c,x='')=>out.push(`${c?'PASS':'FAIL'}  ${n}${x?'  — '+x:''}`);
async function boot(extra){const env={...baseEnv,...extra};const p=spawn('node',['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env,stdio:['ignore','pipe','pipe']});let log='';p.stdout.on('data',d=>log+=d);p.stderr.on('data',d=>log+=d);for(let i=0;i<80&&!log.includes('ready');i++)await new Promise(r=>setTimeout(r,500));return {p,log:()=>log}}
const hdr=(h={})=>({'X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.9',Origin:TEMP,...h});
const call=async(path,{method='GET',body,cookie,auth=true,headers={},form}={})=>{const r=await fetch(base+path,{method,headers:{...hdr(),...(auth?{Authorization:basic}:{}),...(form?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},body:form??(body&&JSON.stringify(body))});const buf=Buffer.from(await r.arrayBuffer());let data={};try{data=JSON.parse(buf.toString())}catch{}return {status:r.status,data,headers:r.headers,buf}};
try{
let A=await boot({PREPARE_DATABASE:'1',BOOTSTRAP_ADMIN_EMAIL:'ada@foreignafrica.org',BOOTSTRAP_ADMIN_PASSWORD:'correct-horse-battery'});
ok('first start: migrations, admin, seed, ready',/Applied 001_identity.*007_site_content/.test(A.log())&&/Super administrator created/.test(A.log())&&/ready/.test(A.log()),A.log().split('\n').filter(l=>/\[(warn|fail)\]/.test(l)).join(' | ').slice(0,120));
const noAuth=await call('/',{auth:false});ok('no staging password: 401 + noindex',noAuth.status===401&&/noindex/.test(noAuth.headers.get('x-robots-tag')));
const login=await call('/api/staff/login',{method:'POST',body:{email:'ada@foreignafrica.org',password:'correct-horse-battery'}});
const sc=login.headers.get('set-cookie')||'';ok('login over the temporary https address',login.status===200);
ok('session cookie is HttpOnly, Secure, SameSite=Lax and has no Domain',/HttpOnly/.test(sc)&&/Secure/.test(sc)&&/SameSite=Lax/.test(sc)&&!/Domain=/i.test(sc),sc.replace(/fa_staff=[^;]+/,'fa_staff=…'));
const cookie=sc.split(';')[0];
const sess=await call('/api/staff/session',{cookie});ok('session persists across requests',sess.data.user?.email==='ada@foreignafrica.org');
ok('writes from the real domain are refused',(await call('/api/staff/users',{method:'POST',cookie,headers:{Origin:'https://foreignafrica.org'},body:{name:'x',email:'x@y.co',role:'editor',password:'correct-horse-battery'}})).status===403);
ok('settings checklist has no failures',(await call('/api/staff/settings',{cookie})).data.checks.every(c=>c.status!=='fail'));
const h1=await call('/api/staff/health',{cookie});ok('uploads: writable but persistence NOT yet proven',h1.data.media.status==='ok'&&h1.data.media.persistence==='unverified',h1.data.media.detail.slice(0,80));
const png=await sharp({create:{width:50,height:40,channels:3,background:'#888'}}).png().toBuffer();const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'t.png');
const up=await call('/api/staff/media',{method:'POST',cookie,form});ok('upload works outside the deployment folder',up.status===201&&existsSync(join(media,'files')),`${up.data.asset?.url}`);
const id=up.data.asset.id;const file=await call(`/media/${id}`);ok('uploaded file is served',file.status===200&&file.headers.get('etag'));
const pre=await call('/api/staff/site/preview',{cookie});ok('preview works under the temporary domain',pre.status===200&&/noindex/.test(pre.headers.get('x-robots-tag'))&&/fa-site-data/.test(pre.buf.toString()));
ok('preview HTML needs login',(await call('/api/staff/site/preview')).status===401);
const cron=await call('/api/cron/publish',{method:'POST',auth:false,headers:{Authorization:`Bearer ${CRON}`}});ok('cron endpoint reachable without the staging password',cron.status===200&&cron.data.ok===true,JSON.stringify(cron.data).slice(0,60));
const cronHttp=await fetch(base+'/api/cron/publish',{method:'POST',headers:{Authorization:`Bearer ${CRON}`}});ok('cron over plain http is refused',cronHttp.status===400);
const art=await call('/api/staff/content',{method:'POST',cookie,body:{type:'news',title:'Staging article',summary:'s',body:'b'}});await call(`/api/staff/content/${art.data.item.id}/state`,{method:'POST',cookie,body:{status:'published'}});
const pubPage=await call('/api/public/content/news/staging-article?format=html');ok('article page: canonical uses the temporary domain, noindex',pubPage.buf.toString().includes(`${TEMP}/news/staging-article/`)&&/noindex/.test(pubPage.buf.toString()));
A.p.kill();await new Promise(r=>setTimeout(r,1500));
// restart = a new process (what a redeploy does), same upload folder and database
const B=await boot({});
ok('second start (no PREPARE_DATABASE): ready',/ready/.test(B.log()));
const login2=await call('/api/staff/login',{method:'POST',body:{email:'ada@foreignafrica.org',password:'correct-horse-battery'}});const cookie2=login2.headers.get('set-cookie').split(';')[0];
const h2=await call('/api/staff/health',{cookie:cookie2});ok('after a restart: upload folder proven persistent',h2.data.media.persistence==='verified'&&/survived/.test(h2.data.media.detail),h2.data.media.detail.slice(0,70));
ok('the uploaded file is still served after the restart',(await call(`/media/${id}`)).status===200);
ok('the published article survives the restart',(await call('/api/public/content/news/staging-article')).status===200);
B.p.kill();
}catch(e){out.push('ERROR '+e.message)}
console.log(out.join('\n'));await db.stop();
