import React,{useState} from 'react';
import {ArrowUpRight,Pause,Play} from 'lucide-react';
import {partners} from './partners.js';
import './partners-policy.css';

export default function PartnerStrip(){
  const [paused,setPaused]=useState(false);
  return <section id="partners" className="partner-band" aria-labelledby="partner-band-title">
    <div className="container partner-band-heading"><div><p className="eyebrow">CONNECTED BY A SHARED PURPOSE</p><h2 id="partner-band-title">Our partners.</h2></div><div className="partner-band-actions"><a className="text-link" href="/partners/">Explore our network <ArrowUpRight size={18}/></a><button className="partner-pause" onClick={()=>setPaused(p=>!p)} aria-label={paused?'Play partner logos':'Pause partner logos'} aria-pressed={paused}>{paused?<Play size={17}/>:<Pause size={17}/>}</button></div></div>
    <div className={`partner-marquee ${paused?'is-paused':''}`}>
      <div className="partner-track">{[0,1].map(copy=><div className="partner-sequence" key={copy} aria-hidden={copy===1?true:undefined}>{partners.map(partner=><a href={`/partners/#${partner.id}`} key={partner.id} tabIndex={copy===1?-1:undefined} className="partner-mark"><img src={partner.logo} alt={copy===1?'':partner.name} loading="lazy" width="240" height="100"/></a>)}</div>)}</div>
    </div>
  </section>;
}
