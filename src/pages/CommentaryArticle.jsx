import React, {useEffect} from 'react';
import {ArrowLeft, ArrowUpRight, Clock3} from 'lucide-react';
import {commentaryUrl} from './commentaries-content.js';
import {commentaryDate} from './commentaries-search.js';
import {useArticle, usePublished} from './use-published.js';
import './commentary-article.css';

function asCommentary(item) {
  return {id: item.slug, slug: item.slug, title: item.title, summary: item.summary, topic: item.category || 'Commentary', authors: item.authorName ? item.authorName.split(' · ') : [], date: String(item.publishedAt || '').slice(0, 10), image: item.image || '', imageAlt: item.imageAlt || '', readMinutes: item.readMinutes || 1, html: item.html || ''};
}

export default function CommentaryArticle({slug, id}) {
  const article = useArticle('commentary', slug || id);
  const archive = usePublished('commentary');
  const item = article.item ? asCommentary(article.item) : null;
  const related = archive.items.map(asCommentary).filter(other => other.slug !== item?.slug).slice(0, 3);
  useEffect(() => {if (item?.title) document.title = `${item.title} — Foreign Africa`;}, [item?.title]);
  if (article.status === 'loading') return <article className="fa-inner-page commentary-reader"><p className="container" role="status">Loading commentary…</p></article>;
  if (article.status === 'error' || !item) return <article className="fa-inner-page commentary-reader"><div className="container" role="alert"><h2>This commentary is not available.</h2><p>{article.error || 'It may be unpublished.'}</p><a className="button gold" href="/blog/">Back to commentaries</a></div></article>;
  return <article className="fa-inner-page commentary-reader"><header className="article-heading"><div className="container"><a className="text-link article-back" href="/blog/"><ArrowLeft size={16} aria-hidden="true"/>All commentaries</a><p className="eyebrow">{item.topic} / COMMENTARY</p><h1>{item.title}</h1><p className="article-deck">{item.summary}</p><div className="article-byline"><p>By <strong>{item.authors.join(' · ')}</strong></p><div><time dateTime={item.date}>{item.date ? commentaryDate(item.date) : ''}</time><span><Clock3 size={15} aria-hidden="true"/>About {item.readMinutes} min read</span></div></div></div></header>{item.image && <div className="container"><figure className="article-cover"><img src={item.image} alt={item.imageAlt} fetchPriority="high"/></figure></div>}<div className="article-reading-layout container"><aside className="article-reading-aside"><p className="eyebrow">FOREIGN AFRICA</p><p>African perspectives.<br/>Global conversations.</p><a className="text-link" href="/policy-briefs/">Explore policy briefs <ArrowUpRight size={15} aria-hidden="true"/></a></aside><div className="article-prose"><div dangerouslySetInnerHTML={{__html: item.html}}/><div className="article-end"><span aria-hidden="true"/><a className="text-link" href="/blog/"><ArrowLeft size={16} aria-hidden="true"/>Back to commentaries</a></div></div></div><section className="article-related container"><p className="eyebrow">CONTINUE THE CONVERSATION</p><h2>More perspectives.</h2><div>{related.map(other => <a key={other.slug} href={commentaryUrl(other)}><span className="eyebrow">{other.topic}</span><h3>{other.title}</h3><span className="text-link">Read commentary <ArrowUpRight size={17} aria-hidden="true"/></span></a>)}</div></section></article>;
}
