// Runtime access to CMS-managed site content. The server embeds the PUBLISHED document in the page, so the first
// render already uses it (no flash of old content). Anything missing or malformed falls back to the built-in
// defaults, which are the content the site launched with.
import {heroSlides} from './hero-content.js';
import {homepageDefaults} from './homepage-defaults.js';

let injected;
function readInjected(){
 if(injected!==undefined)return injected;
 injected=null;
 try{const node=typeof document!=='undefined'&&document.getElementById('fa-site-data');if(node)injected=JSON.parse(node.textContent||'null')}catch{injected=null}
 return injected;
}
export function resetSiteContent(){injected=undefined}

const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
// Fill gaps in `data` from `fallback`. Arrays are taken whole from `data` when present (their length is content).
export function withDefaults(fallback,data){
 if(Array.isArray(fallback))return Array.isArray(data)?data:fallback;
 if(isObject(fallback)){const out={};for(const key of Object.keys(fallback))out[key]=withDefaults(fallback[key],isObject(data)?data[key]:undefined);return out}
 return data===undefined||data===null?fallback:data;
}
export function getHomepage(){const site=readInjected();return withDefaults(homepageDefaults,site?.homepage)}

// The editor stores a slide without the three display-derived fields; add them back so Hero sees its usual shape.
export function slideFromDocument(slide,index){
 const {enabled,...rest}=slide;
 return {...rest,published:enabled!==false,order:index,...(slide.kind==='story'&&slide.desktopMedia?.type==='image'?{photoLayout:true}:{})};
}
export function getHeroSlides(){
 const site=readInjected();
 const slides=site?.hero?.slides;
 if(Array.isArray(slides)&&slides.length)return slides.map(slideFromDocument);
 return heroSlides;
}
export function isPreview(){return Boolean(readInjected()?.preview)}
