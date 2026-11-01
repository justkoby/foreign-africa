import React,{useEffect,useMemo,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import './admin.css';

const sections=[
 ['commentaries','Commentaries'],
 ['news','News'],
 ['events','Events'],
 ['people','People'],
 ['engage','Engage'],
 ['forms','Forms'],
 ['submissions','Submissions'],
];
const today=()=>new Date().toISOString().slice(0,10);
const blanks={
 commentaries:{title:'',summary:'',topic:'Diplomacy',date:today(),authors:'',slug:'',image:'',readMinutes:5,status:'draft',tags:[]},
 news:{title:'',summary:'',category:'Community',location:'',publishedOn:today(),image:'',url:'',sourceUrl:'',status:'draft',imageFit:'cover'},
 events:{title:'',summary:'',category:'Workshop',date:today(),timeLabel:'',format:'Online',venue:'',details:'',status:'draft',registrationState:'unavailable',formId:null},
 people:{name:'',role:'',group:'secretariat',intro:'',email:'',location:'',bio:'',image:'',status:'draft'},
 engage:null,
 forms:{title:'New form',purpose:'general_enquiry',status:'draft',success:'Your message has been received.',fields:[{id:'name',label:'Your name',type:'text',required:true},{id:'email',label:'Email address',type:'email',required:true},{id:'message',label:'Message',type:'textarea',required:true}]},
};
const purposes=['fellowship_application','internship_application','paper_submission','volunteer_interest','event_registration','partnership_enquiry','sponsorship_enquiry','speaker_request','general_enquiry','job_application'];
async function api(path,options={}){
 const response=await fetch(`/api/cms${path}`,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Request failed.');
 return data;
}
const textOf=node=>typeof node==='string'?node:(node?.children??[]).map(textOf).join('');
function toBlocks(content){return (content??[]).flatMap(node=>{if(typeof node==='string'||!node?.tag)return [];if(node.tag==='img')return [{kind:'image',text:node.alt||'',node}];return [{kind:'text',tag:node.tag==='h6'?'p':node.tag,text:textOf(node),node}]})}
function titleOf(collection,item){return item.title||item.name||'Untitled'}
function rowsOf(collection,data){if(collection==='people')return data.teamMembers;if(collection==='engage')return data.engageServices;return data}
function publicHref(collection,item){
 if(collection==='commentaries'&&item.slug)return `/${item.slug}/`;
 if(collection==='news')return item.url||'/news/';
 if(collection==='events')return `/events/${item.id}/`;
 if(collection==='people')return `/people/${item.id}/`;
 if(collection==='engage')return item.path;
 return '';
}

function LoginScreen({onSuccess}){
 const [password,setPassword]=useState(''),[show,setShow]=useState(false),[error,setError]=useState('');
 return <main className="cms-login"><p className="cms-login-chip"><img src="/images/logo-navy.svg" alt=""/>foreignafrica.org</p><div className="cms-login-frame"><div className="cms-login-art" aria-hidden="true"><span className="orb orb-stripe"/><span className="orb orb-blue"/><span className="orb orb-gold"/><span className="orb orb-clear"/><span className="bloom"/><span className="orb orb-block"/></div><form onSubmit={async event=>{event.preventDefault();setError('');try{await api('/login',{method:'POST',body:{password}});onSuccess()}catch(reason){setError(reason.message)}}}><div className="cms-login-brand"><img src="/images/logo-navy.svg" alt=""/>Foreign Africa</div><h1>Welcome Back!</h1><p>Enter your details below</p><label>Password<span><input type={show?'text':'password'} autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>{error&&<p className="cms-error" role="alert">{error}</p>}<button className="cms-login-submit" type="submit">Log in</button><p className="cms-login-note">Editor access only.</p></form></div></main>;
}
export default function AdminApp(){
 const [session,setSession]=useState(null),[hash,setHash]=useState(()=>window.location.hash.slice(1)||'/');
 useEffect(()=>{api('/session').then(data=>setSession(data.ok)).catch(()=>setSession(false))},[]);
 useEffect(()=>{const onHash=()=>setHash(window.location.hash.slice(1)||'/');window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[]);
 useEffect(()=>{document.title='Editor — Foreign Africa'},[]);
 if(session===null)return <main className="cms-login"><p className="cms-login-wait">Loading editor…</p></main>;
 if(!session)return <LoginScreen onSuccess={()=>setSession(true)}/>;
 const [section,id]=hash.split('/').filter(Boolean);
 const go=next=>{window.location.hash=next};
 return <div className="cms"><div className="cms-shell"><aside className="cms-side"><strong>Foreign Africa</strong><a href="#/" aria-current={hash==='/'?'page':undefined}>Dashboard</a>{sections.map(([key,label])=><a key={key} href={`#/${key}`} aria-current={section===key?'page':undefined}>{label}</a>)}<button className="cms-out" onClick={async()=>{await api('/logout',{method:'POST'});setSession(false)}}>Log out</button></aside><main className="cms-main">{section?id?<Editor section={section} id={id} back={()=>go(`/${section}`)}/>:<List section={section} open={item=>go(`/${section}/${item}`)}/>:<Dashboard/>}</main></div></div>;
}
function Dashboard(){
 const [counts,setCounts]=useState({});
 useEffect(()=>{Promise.all(['commentaries','news','events','people','engage','forms'].map(async collection=>{const data=await api(`/items?collection=${collection}`);return [collection,collection==='people'?data.teamMembers.length:collection==='engage'?data.engageServices.length:data.length]})).then(entries=>setCounts(Object.fromEntries(entries)))},[]);
 return <><div className="cms-bar"><h1>Dashboard</h1><a href="/">Visit site</a></div><div className="cms-cards">{sections.filter(([key])=>key!=='submissions').map(([key,label])=><a key={key} href={`#/${key}`}><strong>{counts[key]??'—'}</strong>{label}</a>)}</div><p className="cms-note">News and commentaries are published in the staff studio at <a href="/admin">/admin</a>. This editor still updates events, people, engage and forms.</p></>;
}
function List({section,open}){
 const [data,setData]=useState(null),[query,setQuery]=useState(''),[extra,setExtra]=useState([]);
 useEffect(()=>{if(section==='submissions')api('/submissions').then(setData);else api(`/items?collection=${section}`).then(value=>{setData(value);if(section==='people')setExtra(value.additionalTeamMembers)})},[section]);
 const rows=useMemo(()=>data&&section!=='submissions'?rowsOf(section,data).filter(item=>titleOf(section,item).toLowerCase().includes(query.toLowerCase())):[],[data,query,section]);
 if(section==='news'||section==='commentaries')return <><div className="cms-bar"><h1>{sections.find(([key])=>key===section)[1]}</h1></div><p>These articles are edited in the staff studio. This editor no longer publishes them.</p><a className="cms-primary" href="/admin">Open the studio</a></>;
 if(!data)return <p>Loading…</p>;
 if(section==='submissions')return <><div className="cms-bar"><h1>Submissions</h1></div><table className="cms-table"><thead><tr><th>Reference</th><th>Form</th><th>Received</th><th>Answers</th></tr></thead><tbody>{data.map(item=><tr key={item.reference}><td>{item.reference}</td><td>{item.formId}</td><td>{item.submittedAt?.slice(0,16).replace('T',' ')}</td><td>{Object.entries(item.answers).map(([key,value])=><div key={key}><strong>{key}: </strong>{value}</div>)}</td></tr>)}{!data.length&&<tr><td colSpan={4}>No submissions yet.</td></tr>}</tbody></table></>;
 return <><div className="cms-bar"><h1>{sections.find(([key])=>key===section)[1]}</h1><div className="cms-actions"><input className="cms-search" placeholder="Search" value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search"/>{blanks[section]&&<a className="cms-primary" href={`#/${section}/new`} style={{display:'inline-grid',placeItems:'center',textDecoration:'none'}}>Add new</a>}</div></div><table className="cms-table"><thead><tr><th>Title</th><th>Status</th><th>Date</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td><a href={`#/${section}/${item.id}`} onClick={event=>{event.preventDefault();open(item.id)}}>{titleOf(section,item)}</a></td><td className="cms-status">{item.status==='draft'?'Draft':section==='forms'&&item.status!=='publish'?'Draft':'Published'}</td><td>{item.date||item.publishedOn||''}</td></tr>)}</tbody></table>{section==='people'&&<form className="cms-panel" style={{marginTop:16}} onSubmit={async event=>{event.preventDefault();await api('/items?collection=people',{method:'PUT',body:{additional:extra}})}}><h2>Secretariat names</h2><p>Names and roles only. These profiles have no biography.</p>{extra.map((item,index)=><div className="cms-actions" key={index}><input aria-label="Name" value={item.name} onChange={event=>setExtra(current=>current.map((row,i)=>i===index?{...row,name:event.target.value}:row))}/><input aria-label="Role" value={item.role} onChange={event=>setExtra(current=>current.map((row,i)=>i===index?{...row,role:event.target.value}:row))}/></div>)}<button className="cms-primary" type="submit">Save names</button></form>}</>;
}
function Editor({section,id,back}){
 if(section==='news'||section==='commentaries')return <><div className="cms-bar"><h1>Moved</h1><button className="cms-quiet" onClick={back}>Back</button></div><p>News and commentaries are edited in the staff studio.</p><a className="cms-primary" href="/admin">Open the studio</a></>;
 const creating=id==='new';
 const [item,setItem]=useState(null),[blocks,setBlocks]=useState([]),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let gone=false;if(creating){setBlocks([]);setItem({...blanks[section]});return}api(`/items?collection=${section}`).then(async data=>{const found=rowsOf(section,data).find(row=>row.id===id);if(gone||!found)return;const next={...found};if(section==='people')next.bio=(found.bio||[]).join('\n\n');if(section==='events')next.details=(found.details||[]).join('\n');if(section==='commentaries'){next.authors=(found.authors||[]).join(', ');const article=await api(`/article/${id}`);if(gone)return;setBlocks(toBlocks(article.content))}if(!gone)setItem(next)}).catch(reason=>setError(reason.message));return()=>{gone=true}},[section,id,creating]);
 if(!item)return <p>Loading…</p>;
 const set=key=>event=>setItem(current=>({...current,[key]:event.target.value}));
 const save=async()=>{
  setError('');setMessage('');
  try{
   const payload={...item};
   if(section==='commentaries')payload.authors=String(item.authors||'').split(',').map(name=>name.trim()).filter(Boolean);
   const saved=await api('/items',{method:'PUT',body:{collection:section,item:payload,blocks:section==='commentaries'?blocks:undefined}});
   setMessage('Saved.');
   if(creating)window.location.hash=`/${section}/${saved.item.id}`;
  }catch(reason){setError(reason.message)}
 };
 const href=publicHref(section,item);
 return <><div className="cms-bar"><h1>{creating?'Add new':titleOf(section,item)}</h1><button className="cms-quiet" onClick={back}>Back</button></div>{error&&<p className="cms-error" role="alert">{error}</p>}{message&&<p className="cms-ok" role="status">{message}</p>}<div className="cms-editor"><div className="cms-panel"><label className="cms-field">Title<input className="cms-title" value={item.title||item.name||''} onChange={event=>setItem(current=>({...current,title:event.target.value,name:section==='people'?event.target.value:current.name}))}/></label>
  {section==='commentaries'&&<><Field label="Summary"><textarea value={item.summary||''} onChange={set('summary')}/></Field><Field label="Topic"><input value={item.topic||''} onChange={set('topic')}/></Field><Field label="Authors, separated by commas"><input value={item.authors||''} onChange={set('authors')}/></Field><Field label="Slug"><input value={item.slug||''} onChange={set('slug')}/></Field><Field label="Cover image path"><input value={item.image||''} onChange={set('image')}/></Field><h2>Article</h2><p>Editing a paragraph saves that paragraph as plain text. Images stay attached.</p>{blocks.map((block,index)=><div className="cms-block" key={index}>{block.kind==='image'?<p>Image: {block.text||block.node?.src}</p>:<><select aria-label="Paragraph style" value={block.tag} onChange={event=>setBlocks(current=>current.map((row,i)=>i===index?{...row,tag:event.target.value}:row))}><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option><option value="blockquote">Quote</option></select><textarea aria-label="Paragraph text" value={block.text} onChange={event=>setBlocks(current=>current.map((row,i)=>i===index?{...row,text:event.target.value}:row))}/></>}<button className="cms-quiet" type="button" onClick={()=>setBlocks(current=>current.filter((_,i)=>i!==index))}>Remove</button></div>)}<button className="cms-quiet" type="button" onClick={()=>setBlocks(current=>[...current,{kind:'text',tag:'p',text:''}])}>Add paragraph</button></>}
  {section==='news'&&<><Field label="Summary"><textarea value={item.summary||''} onChange={set('summary')}/></Field><Field label="Category"><input value={item.category||''} onChange={set('category')}/></Field><Field label="Place"><input value={item.location||''} onChange={set('location')}/></Field><Field label="Publication date"><input type="date" value={item.publishedOn||''} onChange={set('publishedOn')}/></Field><Field label="Link"><input value={item.url||''} onChange={set('url')}/></Field><Field label="Image path"><input value={item.image||''} onChange={set('image')}/></Field></>}
  {section==='events'&&<><Field label="Summary"><textarea value={item.summary||''} onChange={set('summary')}/></Field><Field label="Category"><input value={item.category||''} onChange={set('category')}/></Field><Field label="Date"><input type="date" value={item.date||''} onChange={set('date')}/></Field><Field label="Time"><input value={item.timeLabel||''} onChange={set('timeLabel')}/></Field><Field label="Venue"><input value={item.venue||''} onChange={set('venue')}/></Field><Field label="Details, one per line"><textarea value={item.details||''} onChange={set('details')}/></Field></>}
  {section==='people'&&<><Field label="Role"><input value={item.role||''} onChange={set('role')}/></Field><Field label="Group"><select value={item.group||'secretariat'} onChange={set('group')}><option value="council">Advisory Council</option><option value="executive">Executive Leadership</option><option value="secretariat">Secretariat</option><option value="associates">Junior Associates</option></select></Field><Field label="Short introduction"><textarea value={item.intro||''} onChange={set('intro')}/></Field><Field label="Email"><input value={item.email||''} onChange={set('email')}/></Field><Field label="Location"><input value={item.location||''} onChange={set('location')}/></Field><Field label="Portrait path"><input value={item.image||''} onChange={set('image')}/></Field><Field label="Biography, one paragraph per block"><textarea value={item.bio||''} onChange={set('bio')} style={{minHeight:220}}/></Field></>}
  {section==='engage'&&<><Field label="Summary"><textarea value={item.summary||''} onChange={set('summary')}/></Field><Field label="Introduction"><textarea value={item.body||''} onChange={set('body')}/></Field><Field label="Button label"><input value={item.cta||''} onChange={set('cta')}/></Field></>}
  {section==='forms'&&<><Field label="Success message"><textarea value={item.success||''} onChange={set('success')}/></Field><Field label="Purpose"><select value={item.purpose} onChange={set('purpose')}>{purposes.map(purpose=><option key={purpose} value={purpose}>{purpose.replaceAll('_',' ')}</option>)}</select></Field>{(item.fields||[]).map((field,index)=><div className="cms-block" key={field.id}><Field label="Label"><input value={field.label} onChange={event=>setItem(current=>({...current,fields:current.fields.map((row,i)=>i===index?{...row,label:event.target.value}:row)}))}/></Field><Field label="Type"><select value={field.type} onChange={event=>setItem(current=>({...current,fields:current.fields.map((row,i)=>i===index?{...row,type:event.target.value}:row)}))}><option value="text">Text</option><option value="email">Email</option><option value="textarea">Paragraph</option><option value="select">Choice</option></select></Field><label><input type="checkbox" checked={Boolean(field.required)} onChange={event=>setItem(current=>({...current,fields:current.fields.map((row,i)=>i===index?{...row,required:event.target.checked}:row)}))}/> Required</label>{field.type==='select'&&<Field label="Choices, separated by commas"><input value={(field.options||[]).join(', ')} onChange={event=>setItem(current=>({...current,fields:current.fields.map((row,i)=>i===index?{...row,options:event.target.value.split(',').map(option=>option.trim()).filter(Boolean)}:row)}))}/></Field>}<button className="cms-quiet" type="button" onClick={()=>setItem(current=>({...current,fields:current.fields.filter((_,i)=>i!==index)}))}>Remove field</button></div>)}<button className="cms-quiet" type="button" onClick={()=>setItem(current=>({...current,fields:[...current.fields,{id:`field-${current.fields.length+1}`,label:'New field',type:'text',required:false}]}))}>Add field</button></>}</div>
  <aside className="cms-panel"><h2>Publish</h2>{section!=='engage'&&<Field label="Status"><select value={item.status==='draft'?'draft':'publish'} onChange={set('status')}><option value="publish">Published</option><option value="draft">Draft</option></select></Field>}{section==='commentaries'&&<Field label="Date"><input type="date" value={item.date||''} onChange={set('date')}/></Field>}{section==='commentaries'&&<Field label="Minutes"><input type="number" min="1" value={item.readMinutes||5} onChange={set('readMinutes')}/></Field>}<button className="cms-primary" type="button" onClick={save}>Save</button>{href&&item.status!=='draft'&&<a href={href}>View on site</a>}{!creating&&section!=='engage'&&<button className="cms-quiet" type="button" onClick={async()=>{if(!confirm('Move this out of the editor? The public page will no longer list it.'))return;await api('/items',{method:'DELETE',body:{collection:section,id:item.id}});back()}}>Delete</button>}</aside></div></>;
}
function Field({label,children}){return <label className="cms-field"><span>{label}</span>{children}</label>}
