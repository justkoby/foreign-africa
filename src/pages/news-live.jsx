import React, {useEffect, useState} from 'react';
import {ArrowUpRight, ArrowRight, Search} from 'lucide-react';
import {Header, NewsImage, NewsCard} from './NewsEventsPages.jsx';
import {filterNews, displayDate} from './news-events-model.js';
import {activities, storyUrl} from '../activities.js';
import {usePublished, useArticle} from './use-published.js';
import './commentary-article.css';

function asNews(item) {
  const date = String(item.publishedAt || '').slice(0, 10);
  return {
    id: String(item.id),
    title: item.title,
    summary: item.summary,
    category: item.category || 'News',
    location: item.location || '',
    publishedOn: date,
    image: item.image,
    imageFit: item.imageFit || 'cover',
    url: item.externalUrl && !item.complete ? item.externalUrl : `/news/${item.slug}/`,
  };
}

export function NewsPage() {
  const published = usePublished('news');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All news');
  const rows = published.items.map(asNews).filter(item => item.publishedOn);
  const categories = ['All news', ...new Set(rows.map(item => item.category))];
  const results = filterNews({query, category, items: rows});
  const featured = !query.trim() && category === 'All news' ? results[0] : null;
  const cards = results.filter(item => item.id !== featured?.id);
  if (published.status === 'loading') return <div className="fa-inner-page news-events-page"><Header page="news" title="News" description="Follow our institutional engagements, programme updates and the people connecting Foreign Africa’s work across borders."/><p className="container" role="status">Loading news…</p></div>;
  if (published.status === 'error') return <div className="fa-inner-page news-events-page"><Header page="news" title="News" description="Follow our institutional engagements, programme updates and the people connecting Foreign Africa’s work across borders."/><div className="container ne-empty" role="alert"><h3>News could not be loaded.</h3><p>{published.error}</p><button className="button gold" onClick={published.retry}>Try again <ArrowRight size={17} aria-hidden="true"/></button></div></div>;
  return <div className="fa-inner-page news-events-page"><Header page="news" title="News" description="Follow our institutional engagements, programme updates and the people connecting Foreign Africa’s work across borders."/>{featured && <section className="container ne-feature"><a href={featured.url}><NewsImage item={featured}/><div><p className="eyebrow">LATEST REPORT / {featured.category}</p><time dateTime={featured.publishedOn}>Published {displayDate(featured.publishedOn)}</time><h2>{featured.title}</h2><p>{featured.summary}</p><span className="text-link">Read the mission report <ArrowUpRight size={19} aria-hidden="true"/></span></div></a></section>}<section className="container ne-archive" id="news-archive"><div className="ne-archive-heading"><h2>{featured ? 'More from Foreign Africa.' : 'News archive.'}</h2><label className="ne-search"><Search size={18} aria-hidden="true"/><span className="ne-sr">Search news</span><input type="search" placeholder="Search a story or place" maxLength={200} value={query} onChange={event => setQuery(event.target.value)}/></label></div><div className="ne-filters" role="group" aria-label="Filter news">{categories.map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div><p className="ne-result-count" role="status">{cards.length} {cards.length === 1 ? 'report' : 'reports'}{query.trim() ? ` matching “${query.trim()}”` : ''}</p>{cards.length ? <div className="ne-news-grid">{cards.map(item => <NewsCard item={item} key={item.id}/>)}</div> : <div className="ne-empty"><Search size={28} aria-hidden="true"/><h3>No matching reports.</h3><p>Try another keyword or category.</p><button className="button gold" onClick={() => {setQuery(''); setCategory('All news');}}>Reset search <ArrowRight size={17} aria-hidden="true"/></button></div>}</section><section className="ne-programme-updates"><div className="container"><div className="section-heading"><div><p className="eyebrow">FROM OUR PROGRAMMES</p><h2>Our work in motion.</h2></div><a className="text-link" href="/events/">Explore event announcements <ArrowUpRight size={17} aria-hidden="true"/></a></div><div className="ne-programme-grid">{['edws-in-numbers', 'beyond-the-logo', 'cohort-completion'].map(id => activities.find(item => item.id === id)).map(item => <a href={storyUrl(item.id)} key={item.id}><p className="eyebrow">{item.category}</p><h3>{item.title}</h3><p>{item.summary}</p><span className="text-link">Read update <ArrowUpRight size={16} aria-hidden="true"/></span></a>)}</div></div></section></div>;
}

export function NewsArticle({slug}) {
  const article = useArticle('news', slug);
  useEffect(() => {if (article.item?.title) document.title = `${article.item.title} — Foreign Africa`;}, [article.item]);
  useEffect(() => {
    const target = article.item?.externalUrl;
    if (article.item && !article.item.complete && target) window.location.replace(target);
  }, [article.item]);
  if (article.status === 'loading') return <div className="fa-inner-page news-events-page"><p className="container" role="status">Loading news…</p></div>;
  if (article.status === 'error' || !article.item) return <div className="fa-inner-page news-events-page"><Header page="news" title="News" description="This report is not available."/><div className="container ne-empty" role="alert"><h3>This report is not available.</h3><p>{article.error || 'It may be unpublished.'}</p><a className="button gold" href="/news/">Back to news</a></div></div>;
  const item = article.item;
  const date = String(item.publishedAt || '').slice(0, 10);
  return <article className="fa-inner-page news-events-page"><section className="ne-event-hero"><div className="container"><a className="ne-back" href="/news/">All news</a><div className="ne-event-hero-grid"><div><p className="eyebrow">{item.category || 'News'} / REPORT</p><h1>{item.title}</h1><p>{item.summary}</p>{item.authorName && <p>By <strong>{item.authorName}</strong></p>}{date && <time dateTime={date}>{displayDate(date)}</time>}</div></div></div></section><section className="container ne-event-body">{item.image && <figure><img src={item.image} alt={item.imageAlt || ''} fetchPriority="high"/><figcaption>{item.imageAlt}</figcaption></figure>}<div className="article-prose" dangerouslySetInnerHTML={{__html: item.html || ''}}/></section></article>;
}
