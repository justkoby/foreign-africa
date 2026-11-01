import React,{useState,useRef,useEffect} from 'react';
import {ArrowUpRight,ArrowDown,Search,ArrowRight,Plus,Clock3} from 'lucide-react';
import {commentaryUrl} from './commentaries-content.js';
import {commentaryTopics,commentaryDate,findCommentaries} from './commentaries-search.js';
import {usePublished} from './use-published.js';
import './commentaries.css';

function ArticleMeta({item}){return <div className="commentary-meta"><time dateTime={item.date}>{commentaryDate(item.date)}</time><span><Clock3 size={13} aria-hidden="true"/>About {item.readMinutes} min read</span></div>}
function ArticleCard({item}){return <article className="commentary-card"><a id={`commentary-${item.id}`} href={commentaryUrl(item)} className="commentary-card-link"><div className="commentary-card-image"><img src={item.image} alt="" loading="lazy" width="800" height="500"/><span className="commentary-card-arrow"><ArrowUpRight size={20} aria-hidden="true"/></span></div><div className="commentary-card-copy"><p className="eyebrow commentary-topic">{item.topic}</p><h3>{item.title}</h3><p className="commentary-card-summary">{item.summary}</p><div className="commentary-card-bottom"><p className="commentary-byline">{item.authors.join(' · ')}</p><ArticleMeta item={item}/></div></div></a></article>}

function asCommentary(item){
  return {id:item.slug,slug:item.slug,title:item.title,summary:item.summary,topic:item.category||'Commentary',tags:item.tags||[],authors:item.authorName?item.authorName.split(' · '):[],date:String(item.publishedAt||'').slice(0,10),image:item.image||'',readMinutes:item.readMinutes||1};
}
export default function CommentariesPage(){
  const published=usePublished('commentary');
  const commentaries=published.items.map(asCommentary).filter(item=>item.date);
  const commentaryYears=[...new Set(commentaries.map(item=>item.date.slice(0,4)))].sort().reverse();
  const [query,setQuery]=useState(''),[topic,setTopic]=useState('All topics'),[year,setYear]=useState('All years'),[sort,setSort]=useState('newest'),[limit,setLimit]=useState(6);
  const nextFocus=useRef(null);
  useEffect(()=>{if(nextFocus.current){document.getElementById(nextFocus.current)?.focus({preventScroll:true});nextFocus.current=null}},[limit]);
  const browsing=!query.trim()&&topic==='All topics'&&year==='All years'&&sort==='newest';
  const lead=browsing?commentaries[0]:null;
  const matches=findCommentaries({query,topic,year,sort,items:commentaries}).filter(item=>item.id!==lead?.id);
  const shown=matches.slice(0,limit);
  const reset=()=>{setQuery('');setTopic('All topics');setYear('All years');setSort('newest');setLimit(6)};
  const hero=<section className="commentaries-hero"><div className="container"><nav className="commentaries-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>Commentaries</span></nav><div className="commentaries-heading"><div><p className="eyebrow">RESEARCH & POLICY</p><h1>Commentaries<span>.</span></h1></div><div><p>African perspectives on a changing world. Explore the ideas connecting policy, enterprise and international affairs.</p><a className="text-link" href="#commentary-archive">Find your next read <ArrowDown size={16} aria-hidden="true"/></a></div></div></div></section>;
  if(published.status==='loading')return <div className="fa-inner-page commentaries-page">{hero}<p className="container" role="status">Loading commentaries…</p></div>;
  if(published.status==='error')return <div className="fa-inner-page commentaries-page">{hero}<div className="container commentary-empty" role="alert"><h3>Commentaries could not be loaded.</h3><p>{published.error}</p><button className="button gold" onClick={published.retry}>Try again</button></div></div>;
  return <div className="fa-inner-page commentaries-page">
    {hero}

    {lead&&<section className="container commentary-feature" aria-labelledby="latest-commentary-title"><a href={commentaryUrl(lead)} className="commentary-feature-link"><div className="commentary-feature-image"><img src={lead.image} alt="" fetchPriority="high" width="1280" height="720"/><span className="commentary-feature-label"><span/>LATEST COMMENTARY</span></div><div className="commentary-feature-copy"><p className="eyebrow commentary-topic">{lead.topic}</p><ArticleMeta item={lead}/><h2 id="latest-commentary-title">{lead.title}</h2><p className="commentary-feature-summary">{lead.summary}</p><p className="commentary-byline">By {lead.authors.join(' · ')}</p><span className="text-link">Read commentary <ArrowUpRight size={19} aria-hidden="true"/></span></div></a></section>}

    <section className="container commentary-archive" id="commentary-archive" aria-labelledby="commentary-archive-title"><div className="commentary-archive-heading"><div><p className="eyebrow">EXPLORE THE CONVERSATION</p><h2 id="commentary-archive-title">{browsing?'More perspectives.':'Commentary archive.'}</h2></div><a className="text-link commentary-briefs-link" href="/policy-briefs/">Looking for policy briefs? <ArrowUpRight size={16} aria-hidden="true"/></a></div>
      <div className="commentary-toolbar"><label className="commentary-search"><Search size={20} aria-hidden="true"/><span className="commentary-sr-only">Search commentaries</span><input type="search" placeholder="Search a topic, place or author" value={query} maxLength={200} onChange={e=>{setQuery(e.target.value);setLimit(6)}}/></label><div className="commentary-selects"><label>Year<select value={year} onChange={e=>{setYear(e.target.value);setLimit(6)}}><option>All years</option>{commentaryYears.map(value=><option key={value}>{value}</option>)}</select></label><label>Sort by<select value={sort} onChange={e=>{setSort(e.target.value);setLimit(6)}}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div></div>
      <div className="commentary-topics" role="group" aria-label="Filter by topic">{commentaryTopics.map(value=><button key={value} onClick={()=>{setTopic(value);setLimit(6)}} aria-pressed={topic===value}>{value}</button>)}</div>
      <div className="commentary-result-bar"><p role="status">{matches.length?`${shown.length} of ${matches.length} ${matches.length===1?'commentary':'commentaries'}`:'No commentaries found'}{query.trim()?` for “${query.trim()}”`:''}</p>{!browsing&&<button onClick={reset}>Reset filters <ArrowRight size={14} aria-hidden="true"/></button>}</div>
      {shown.length?<div className="commentary-grid">{shown.map(item=><ArticleCard item={item} key={item.id}/>)}</div>:<div className="commentary-empty"><Search size={30} strokeWidth={1.25} aria-hidden="true"/><h3>No matches this time.</h3><p>Try a broader keyword, another year or a different topic.</p><button className="button gold" onClick={reset}>Show all commentaries <ArrowRight size={18} aria-hidden="true"/></button></div>}
      {limit<matches.length&&<div className="commentary-load-more"><button className="button commentary-more" onClick={()=>{nextFocus.current=`commentary-${matches[limit].id}`;setLimit(value=>value+6)}}>More commentaries <Plus size={18} aria-hidden="true"/></button><p>{matches.length-limit} more to explore</p></div>}
    </section>
    <section className="commentary-research-note"><div className="container"><div><p className="eyebrow">TAKE A CLOSER LOOK</p><h2>From perspectives<br/>to policy.</h2></div><div><p>Explore the policy brief series for focused analysis of the decisions shaping Africa’s future.</p><a className="button gold" href="/policy-briefs/">Explore policy briefs <ArrowUpRight size={18} aria-hidden="true"/></a></div></div></section>
  </div>;
}
