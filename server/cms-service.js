import {createHmac,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const tags=new Set('p h2 h3 h4 h5 h6 strong em b i a img br hr figure figcaption blockquote ul ol li sup sub table thead tbody tr td th'.split(' '));
const lists={commentaries:'commentaries.json',news:'news.json',events:'events.json',forms:'forms.json'};
export const projectRoot=join(dirname(fileURLToPath(import.meta.url)),'..');

const textOf=node=>typeof node==='string'?node:(node?.children??[]).map(textOf).join('');
function cleanNodes(nodes){
 if(!Array.isArray(nodes))return [];
 return nodes.flatMap(node=>{
  if(typeof node==='string')return node.slice(0,20000);
  if(!node||typeof node!=='object'||!tags.has(node.tag))return [];
  if(node.tag==='img'){const out={tag:'img',alt:String(node.alt??'').slice(0,300)};if(typeof node.src==='string'&&node.src.startsWith('/'))out.src=node.src.slice(0,500);return out}
  if(node.tag==='br'||node.tag==='hr')return {tag:node.tag};
  const out={tag:node.tag};
  if(node.tag==='a'){const href=String(node.href??'');if(/^(https?:\/\/|mailto:|\/|#)/.test(href))out.href=href.slice(0,500)}
  if(Array.isArray(node.children))out.children=cleanNodes(node.children);
  return out;
 });
}
export function blocksFromContent(content){
 return (Array.isArray(content)?content:[]).flatMap(node=>{
  if(typeof node==='string'||!node?.tag)return [];
  if(node.tag==='img')return [{kind:'image',text:node.alt||'',node}];
  if(!tags.has(node.tag))return [];
  return [{kind:'text',tag:node.tag==='h6'?'p':node.tag,text:textOf(node),node}];
 });
}
export function contentFromBlocks(blocks){
 return cleanNodes((blocks??[]).map(block=>{
  if(block.kind==='image')return block.node?.tag==='img'?block.node:{tag:'img',alt:String(block.text??'')};
  const text=String(block.text??'');
  if(block.node&&text===textOf(block.node))return block.node;
  return {tag:tags.has(block.tag)?block.tag:'p',children:[text]};
 }));
}
function slugify(value){return String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)}
function same(a,b){const left=Buffer.from(String(a)),right=Buffer.from(String(b));const size=Math.max(left.length,right.length,1);const x=Buffer.alloc(size),y=Buffer.alloc(size);left.copy(x);right.copy(y);return left.length===right.length&&timingSafeEqual(x,y)}

export function createCms({root=projectRoot,env=process.env,clock=Date.now}={}){
 const dir=join(root,'data','cms');
 const articles=join(dir,'articles');
 const password=()=>env.CMS_PASSWORD||'';
 const readJson=(path,fallback)=>{try{return JSON.parse(readFileSync(path,'utf8'))}catch{return fallback}};
 const writeJson=(path,data)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(data,null,2)+'\n')};
 const file=name=>join(dir,name);
 const sign=exp=>{const payload=Buffer.from(JSON.stringify({exp})).toString('base64url');const sig=createHmac('sha256',password()).update(payload).digest('base64url');return `${payload}.${sig}`};
 const session=cookie=>{
  const token=/fa_editor=([^;]+)/.exec(cookie||'')?.[1];
  if(!token||!password())return false;
  const [payload,sig]=token.split('.');
  if(!payload||!sig)return false;
  const expect=createHmac('sha256',password()).update(payload).digest('base64url');
  if(!same(sig,expect))return false;
  try{return JSON.parse(Buffer.from(payload,'base64url').toString()).exp>clock()}catch{return false}
 };
 const cookie=()=>`fa_editor=${sign(clock()+7*864e5)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
 const list=collection=>{
  if(collection==='people')return readJson(file('people.json'),{teamMembers:[],additionalTeamMembers:[]});
  if(collection==='engage')return readJson(file('engage.json'),{engageServices:[]});
  if(!lists[collection])return null;
  return readJson(file(lists[collection]),[]);
 };
 const itemsOf=collection=>{const data=list(collection);if(collection==='people')return data.teamMembers;if(collection==='engage')return data.engageServices;return data};
 const saveItem=(collection,item)=>{
  if(collection==='news'||collection==='commentaries')return {error:'News and commentaries are edited in the staff studio.',status:409};
  if(!item||typeof item!=='object')return {error:'Nothing to save.'};
  const data=list(collection);
  if(!data)return {error:'Unknown section.'};
  const rows=itemsOf(collection);
  const id=String(item.id||slugify(item.title||item.name)||`item-${clock()}`).slice(0,80);
  if(!/^[a-z0-9_-]+$/.test(id))return {error:'Use a short id made of letters, numbers and hyphens.'};
  const next={...rows.find(row=>row.id===id),...item,id};
  if(collection==='commentaries'){
   next.slug=slugify(next.slug||next.title)||id;
   if(rows.some(row=>row.id!==id&&row.slug===next.slug))next.slug=`${next.slug}-${id.slice(0,8)}`;
   next.authors=Array.isArray(next.authors)?next.authors.map(name=>String(name).trim()).filter(Boolean):String(next.authors??'').split(',').map(name=>name.trim()).filter(Boolean);
   next.tags=Array.isArray(next.tags)?next.tags:[];
   next.status=next.status==='draft'?'draft':'publish';
  }
  if(collection==='people')next.bio=Array.isArray(next.bio)?next.bio.map(part=>String(part).trim()).filter(Boolean):String(next.bio??'').split(/\n{2,}/).map(part=>part.trim()).filter(Boolean);
  if(collection==='events')next.details=Array.isArray(next.details)?next.details:String(next.details??'').split('\n').map(part=>part.trim()).filter(Boolean);
  if(collection==='forms'){
   next.fields=(next.fields??[]).filter(field=>field&&field.id&&field.label).map(field=>({id:slugify(field.id),label:String(field.label).slice(0,120),type:['text','email','textarea','select'].includes(field.type)?field.type:'text',required:Boolean(field.required),...(field.type==='select'?{options:(field.options??[]).map(option=>String(option).slice(0,80)).filter(Boolean)}:{})}));
   if(!next.fields.some(field=>field.type==='email'&&field.required))return {error:'Add a required email field before saving this form.'};
   next.status=next.status==='publish'?'publish':'draft';
  }
  const saved=[...rows.filter(row=>row.id!==id),next];
  if(collection==='people')writeJson(file('people.json'),{...data,teamMembers:saved});
  else if(collection==='engage')writeJson(file('engage.json'),{...data,engageServices:saved});
  else writeJson(file(lists[collection]),collection==='commentaries'?[...saved].sort((a,b)=>String(b.date).localeCompare(String(a.date))):saved);
  return {item:next};
 };
 const removeItem=(collection,id)=>{
  if(collection==='news'||collection==='commentaries')return {error:'News and commentaries are edited in the staff studio.',status:409};
  const data=list(collection);if(!data)return {error:'Unknown section.'};
  const rows=itemsOf(collection).filter(row=>row.id!==id);
  if(collection==='people')writeJson(file('people.json'),{...data,teamMembers:rows});
  else if(collection==='engage')writeJson(file('engage.json'),{...data,engageServices:rows});
  else writeJson(file(lists[collection]),rows);
  return {ok:true};
 };
 const saveAdditional=rows=>{
  const data=list('people');
  const additional=rows.map(row=>({name:String(row.name??'').trim(),role:String(row.role??'').trim(),group:'secretariat'})).filter(row=>row.name&&row.role);
  writeJson(file('people.json'),{...data,additionalTeamMembers:additional});
  return {additionalTeamMembers:additional};
 };
 const articlePath=(id,pub)=>join(pub?join(root,'public','content','commentaries'):articles,`${id}.json`);
 const readArticle=id=>{
  const over=articlePath(id,false),pub=articlePath(id,true);
  return readJson(existsSync(over)?over:pub,null);
 };
 const saveArticle=(id,blocks,status)=>{
  const current=readArticle(id)??{id,sourceUrl:null,content:[]};
  const content=contentFromBlocks(blocks);
  const payload={id,sourceUrl:current.sourceUrl??null,content};
  writeJson(articlePath(id,false),payload);
  if(status!=='draft')writeJson(articlePath(id,true),payload);
  return {content};
 };
 const publicForm=id=>{
  const form=(list('forms')??[]).find(item=>item.id===id&&item.status==='publish');
  if(!form)return null;
  return {id:form.id,purpose:form.purpose,title:form.title,success:form.success,fields:form.fields};
 };
 const submit=(id,answers,key)=>{
  const form=(list('forms')??[]).find(item=>item.id===id);
  if(!form||form.status!=='publish')return {error:'This form is not open.',status:404};
  const errors={};
  for(const field of form.fields){
   const value=String(answers?.[field.id]??'').trim();
   if(field.required&&!value)errors[field.id]=`Enter ${field.label.toLowerCase()}.`;
   else if(field.type==='email'&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))errors[field.id]='Enter a valid email address.';
   else if(field.type==='select'&&value&&!(field.options??[]).includes(value))errors[field.id]='Choose one of the listed options.';
   else if(value.length>5000)errors[field.id]='Shorten this answer.';
  }
  if(Object.keys(errors).length)return {error:'Check the highlighted fields.',errors,status:400};
  const path=file('submissions.json');
  const all=readJson(path,[]);
  if(key&&all.some(item=>item.key===key))return {ok:true,reference:all.find(item=>item.key===key).reference,duplicate:true};
  const reference=`FA-${clock().toString(36).toUpperCase()}`;
  const stored={reference,formId:form.id,key:String(key||reference),submittedAt:new Date(clock()).toISOString(),answers:Object.fromEntries(form.fields.map(field=>[field.id,String(answers[field.id]??'').trim()]))};
  try{writeJson(path,[stored,...all].slice(0,1000))}catch{return {error:'The enquiry could not be saved.',status:503}}
  return {ok:true,reference,success:form.success};
 };
 return {session,cookie,password,same,list,saveItem,removeItem,saveAdditional,readArticle,saveArticle,publicForm,submit,submissions:()=>readJson(file('submissions.json'),[])};
}
