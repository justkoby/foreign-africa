import React,{useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowUpRight,Search,X,LoaderCircle,BookOpen} from 'lucide-react';
import {categories,discover,suggestions} from './discovery.js';
import {page} from './content.js';
export default function DiscoveryDialog({close}){
 const [query,setQuery]=useState('');const [filter,setFilter]=useState('All');const [submitted,setSubmitted]=useState('');
 const [response,setResponse]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const dialog=useRef(null),input=useRef(null),pending=useRef(null),sequence=useRef(0);
 useEffect(()=>{dialog.current.showModal();input.current.focus();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{pending.current?.abort();document.body.style.overflow=before}},[]);
 async function run(question=query,category=filter){
  const text=question.trim();if(!text)return;
  pending.current?.abort();const controller=new AbortController();pending.current=controller;const request=++sequence.current;
  setQuery(text);setFilter(category);setSubmitted(text);setError('');setBusy(true);
  setResponse({...discover(text,category),mode:'directory',answer:null});
  try{
   const timer=setTimeout(()=>controller.abort(),14000);
   let reply;try{reply=await fetch('/api/discover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:text,category}),signal:controller.signal})}finally{clearTimeout(timer)}
   if(!reply.ok){if(reply.status===429)throw new Error('Please wait a minute before asking again. Matching pages are still shown below.');throw new Error('AI answers are unavailable right now. Matching pages are shown below.')}
   const data=await reply.json();if(!Array.isArray(data.results))throw new Error('AI answers are unavailable right now. Matching pages are shown below.');
   if(request===sequence.current)setResponse(data);
  }catch(e){if(request===sequence.current)setError(e.name==='AbortError'?'The answer took too long. You can still explore the matching pages below.':e.message)}finally{if(request===sequence.current)setBusy(false)}
 }
 const shown=response??{...discover('',filter),mode:'directory',answer:null};
 return <dialog ref={dialog} aria-labelledby="discovery-title" className="search-dialog discovery-dialog" onCancel={close} onClick={e=>{if(e.target===e.currentTarget)close()}}><div className="search-inner">
  <div className="search-top"><span className="eyebrow">FOREIGN AFRICA / DISCOVER</span><button className="icon-button" aria-label="Close search" onClick={close}><X/></button></div>
  <h2 id="discovery-title">What would you<br/>like to explore?</h2><p className="discovery-description">Find research, programmes and opportunities in your own words.</p>
  <form onSubmit={e=>{e.preventDefault();run()}}><div className="search-input"><Search size={21} aria-hidden="true"/><input ref={input} maxLength={500} required placeholder="Ask a question or search a topic" aria-label="Search research, programmes and opportunities" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" className="discovery-submit" disabled={!query.trim()} aria-label="Explore your question"><ArrowRight size={20}/></button></div></form>
  <p className="discovery-privacy">Questions may be processed by Google AI when AI answers are enabled. Please leave out personal details.</p>
  {!submitted&&<div className="discovery-suggestions">{suggestions.map(s=><button key={s} onClick={()=>run(s)}>{s}<ArrowUpRight size={14}/></button>)}</div>}
  <div className="filters" role="group" aria-label="Filter content">{categories.map(c=><button key={c} className={filter===c?'selected':''} aria-pressed={filter===c} onClick={()=>{setFilter(c);if(submitted)run(submitted,c)}}>{c==='All'?'Everything':c==='Programme'?'Programmes':c==='Opportunity'?'Opportunities':c==='Update'?'Updates':c}</button>)}</div>
  {submitted&&<div className="discovery-answer" aria-live="polite" aria-busy={busy}><div className="answer-label">{busy?<LoaderCircle size={16} className="spin"/>:<BookOpen size={16}/>}<span>{busy?'Finding your way in…':shown.mode==='ai'?'AI DIRECTORY GUIDE':'DIRECTORY RESULTS'}</span></div><p>{shown.answer?.text??shown.message}</p>{shown.answer&&<div className="answer-sources">{shown.answer.sources.map((s,i)=><a href={s.url} key={s.id}>[{i+1}] {s.title}<ArrowUpRight size={13}/></a>)}</div>}{shown.reason==='not-configured'&&<p className="answer-footnote">AI answers are not enabled yet. You’re viewing directory matches.</p>}{!error&&['provider-unavailable','invalid-answer'].includes(shown.reason)&&<p className="answer-footnote">AI answers are unavailable right now. You can still explore the matching pages below.</p>}{error&&<p className="answer-footnote" role="status">{error}</p>}{shown.mode==='ai'&&<p className="answer-footnote">Based on directory summaries. Check the original pages for full details.</p>}</div>}
  {shown.notice&&submitted&&<p className="discovery-notice">{shown.notice}</p>}
  <p className="result-count" role="status">{shown.results.length} {shown.results.length===1?'page':'pages'}{submitted?` for “${submitted}”`: ' to explore'}</p>
  <div className="search-results">{shown.results.map(r=><a key={r.id} href={r.url}><div><span className="eyebrow">{r.type}</span><h3>{r.title}</h3><p>{r.description}</p></div><ArrowUpRight size={20}/></a>)}{!shown.results.length&&<p>Try “trade”, “enterprise” or “internship”, or <a className="text-link" href={page('contact')}>contact the team <ArrowUpRight size={14}/></a>.</p>}</div>
 </div></dialog>
}
