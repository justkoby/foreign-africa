import React from 'react';
import {ArrowUpRight,GraduationCap,FileText,HeartHandshake,Building2,Search,Network,MessagesSquare} from 'lucide-react';
import {opportunityPathways} from './pages/opportunities-content.js';
import './pages/opportunities.css';

export function PathwayIcon({name,size=25}){const Icon=({fellowship:GraduationCap,papers:FileText,volunteer:HeartHandshake,enterprise:Building2,research:Search,network:Network,dialogue:MessagesSquare})[name]??FileText;return <Icon size={size} strokeWidth={1.4} aria-hidden="true"/>}

export function PathwayCard({item,index,compact=false}){return <article className={`pathway-card ${compact?'pathway-card--compact':''}`}><a href={item.path}><div className="pathway-card-top"><PathwayIcon name={item.icon}/><span>0{index+1}</span></div><p className="eyebrow">{item.label}</p><h3>{item.shortTitle??item.title}</h3><p className="pathway-summary">{item.summary}</p><span className="pathway-card-link">Explore this pathway <ArrowUpRight size={18} aria-hidden="true"/></span></a></article>}

export default function OpportunitiesSection(){return <section className="home-pathways section-pad container" id="opportunities"><div className="section-heading"><div><p className="eyebrow">05 / OPPORTUNITIES</p><h2>Find your way<br/>to contribute.</h2></div><a className="text-link" href="/opportunities/">Explore all opportunities <ArrowUpRight size={19} aria-hidden="true"/></a></div><p className="home-pathways-intro">Research, share your skills, or connect around enterprise. Start with a pathway that interests you.</p><div className="pathway-grid pathway-grid--home">{opportunityPathways.map((item,index)=><PathwayCard key={item.id} item={item} index={index} compact/>)}</div><div className="home-pathways-note"><p>Programme overviews · Current calls, roles and event dates are not listed here yet.</p><a href="/remote-internship-programme-rip/">Looking for internships? <ArrowUpRight size={15} aria-hidden="true"/></a></div></section>}
