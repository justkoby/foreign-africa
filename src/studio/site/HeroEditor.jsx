import React, {useState} from 'react';
import {ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash2} from 'lucide-react';
import {heroLimits} from '../../../server/site-fields.js';
import {Field, ImageField, Problem, TextInput, at} from './Fields.jsx';

const positions = [['center', 'Centre'], ['left', 'Left'], ['right', 'Right'], ['center top', 'Top'], ['center bottom', 'Bottom'], ['65% center', 'Right of centre'], ['35% center', 'Left of centre']];
const newId = () => `slide-${Math.random().toString(36).slice(2, 8)}`;
const move = (items, from, to) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };

const templates = {
  story: () => ({id: newId(), enabled: false, kind: 'story', label: '', title: 'New slide', lines: ['New headline'], emphasis: '', description: 'Describe this slide in a sentence or two.', cta: {label: 'Learn more', href: '/'}, duration: 12000, desktopMedia: null, mobileMedia: null}),
  artwork: () => ({id: newId(), enabled: false, kind: 'artwork', label: '', title: 'New poster slide', cta: {label: 'Find out more', href: '/'}, duration: 15000, desktopMedia: null, mobileMedia: null}),
};

function MediaChoice({label, value, onChange, allowVideo, optional, path, ctx, hint}) {
  const {options, pick, errors, disabled} = ctx;
  const mode = value?.type === 'video' ? 'video' : 'image';
  const set = patch => onChange({...(value ?? {}), ...patch});
  if (optional && !value) return <div className="sf sf-media"><span>{label}</span><p className="sf-hint">{hint}</p><button type="button" disabled={disabled} onClick={() => onChange({type: 'image', src: '', alt: ''})}>Use a different {allowVideo ? 'image or video' : 'image'}</button></div>;
  const currentPosition = value?.position && !positions.some(([key]) => key === value.position) ? [[value.position, `Custom (${value.position})`]] : [];
  return <fieldset className="sf-group sf-media"><legend>{label}</legend>
    {allowVideo && <div className="sf-row" role="radiogroup" aria-label={`${label} type`}><label><input type="radio" checked={mode === 'image'} disabled={disabled} onChange={() => set({type: 'image', src: '', alt: value?.alt ?? '', videoId: undefined, poster: undefined})}/> Image</label><label><input type="radio" checked={mode === 'video'} disabled={disabled} onChange={() => set({type: 'video', videoId: options.approvedVideos[0]?.id, src: undefined, mediaId: undefined, poster: options.approvedVideos[0]?.poster})}/> Video</label></div>}
    {mode === 'image' ? <>
      <ImageField label="Image" value={value} path={at(path, 'src')} errors={errors} disabled={disabled} onPick={() => pick('image', file => set({type: 'image', src: file.url, mediaId: file.id, alt: value?.alt || file.alt || '', panel: undefined}))}/>
      <TextInput label="Image description (for screen readers)" value={value?.alt} max={300} path={at(path, 'alt')} errors={errors} disabled={disabled} onChange={alt => set({alt})}/>
    </> : <>
      <label className="sf"><span>Approved video</span><select value={value?.videoId ?? ''} disabled={disabled} onChange={event => { const video = options.approvedVideos.find(item => item.id === event.target.value); set({videoId: video.id, poster: value?.poster || video.poster}); }}>{options.approvedVideos.map(video => <option key={video.id} value={video.id}>{video.label}</option>)}</select><small>Video comes from an approved list. Ask the developer to add more.</small><Problem errors={errors} path={path}/></label>
      <ImageField label="Poster image (shown while the video loads, and if it cannot play)" value={value?.poster ? {src: value.poster} : null} path={at(path, 'poster')} errors={errors} disabled={disabled} onPick={() => pick('image', file => set({poster: file.url, posterId: file.id}))}/>
    </>}
    <label className="sf"><span>Which part of the picture to keep in view</span><select value={value?.position ?? 'center'} disabled={disabled} onChange={event => set({position: event.target.value})}>{[...positions, ...currentPosition].map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><small>Used when the picture is cropped to fit the screen.</small><Problem errors={errors} path={at(path, 'position')}/></label>
    {optional && <button type="button" disabled={disabled} onClick={() => onChange(null)}>Use the main {allowVideo ? 'image or video' : 'image'} instead</button>}
  </fieldset>;
}

function Featured({value, onChange, path, ctx}) {
  const {options, pick, errors, disabled} = ctx;
  if (!value) return <div className="sf"><span>“Watch” button</span><p className="sf-hint">An optional button on this slide that plays a video in a pop-up.</p><button type="button" disabled={disabled} onClick={() => onChange({label: 'Watch our story', title: '', type: 'video', videoId: options.approvedVideos[0]?.id, thumbnail: options.approvedVideos[0]?.poster ?? ''})}>Add a watch button</button></div>;
  const set = patch => onChange({...value, ...patch});
  return <fieldset className="sf-group"><legend>“Watch” button</legend>
    <TextInput label="Small label" value={value.label} max={40} path={at(path, 'label')} errors={errors} disabled={disabled} onChange={label => set({label})}/>
    <TextInput label="Video title" value={value.title} max={100} path={at(path, 'title')} errors={errors} disabled={disabled} onChange={title => set({title})}/>
    <label className="sf"><span>Video</span><select value={value.type === 'youtube' ? 'youtube' : value.videoId} disabled={disabled} onChange={event => event.target.value === 'youtube' ? set({type: 'youtube', videoId: undefined, src: ''}) : set({type: 'video', videoId: event.target.value, src: undefined})}>{options.approvedVideos.map(video => <option key={video.id} value={video.id}>{video.label}</option>)}<option value="youtube">A YouTube link</option></select></label>
    {value.type === 'youtube' && <TextInput label="YouTube link" value={value.src} path={at(path, 'src')} errors={errors} disabled={disabled} hint="youtube.com or youtu.be links only." onChange={src => set({src})}/>}
    <ImageField label="Thumbnail" value={value.thumbnail ? {src: value.thumbnail} : null} path={at(path, 'thumbnail')} errors={errors} disabled={disabled} onPick={() => pick('image', file => set({thumbnail: file.url, thumbnailId: file.id}))}/>
    <button type="button" disabled={disabled} onClick={() => onChange(null)}>Remove the watch button</button></fieldset>;
}

function Slide({slide, index, count, ctx, update, onMove, onDuplicate, onDelete, open, setOpen}) {
  const {errors, disabled} = ctx;
  const path = `slides[${index}]`;
  const set = patch => update({...slide, ...patch});
  const thumb = slide.desktopMedia?.type === 'video' ? slide.desktopMedia.poster : slide.desktopMedia?.src;
  const problems = Object.keys(errors).filter(key => key.startsWith(path)).length;
  return <li className={`hero-slide-card ${slide.enabled ? '' : 'is-off'}`}>
    <div className="hs-head">
      <button type="button" className="hs-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span className="hs-num">{String(index + 1).padStart(2, '0')}</span>{thumb ? <img src={thumb} alt=""/> : <span className="hs-noimg"/>}<span className="hs-title"><strong>{slide.title || 'Untitled slide'}</strong><small>{slide.kind === 'story' ? 'Text over image or video' : 'Poster image'}{problems ? ` · ${problems} problem${problems === 1 ? '' : 's'}` : ''}</small></span></button>
      <label className="hs-switch"><input type="checkbox" checked={slide.enabled} disabled={disabled} onChange={event => set({enabled: event.target.checked})}/> {slide.enabled ? 'Shown' : 'Hidden'}</label>
      <span className="hs-actions"><button type="button" aria-label="Move slide up" disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUp size={14}/></button><button type="button" aria-label="Move slide down" disabled={disabled || index === count - 1} onClick={() => onMove(1)}><ArrowDown size={14}/></button><button type="button" aria-label="Duplicate slide" disabled={disabled || count >= heroLimits.slides} onClick={onDuplicate}><Copy size={14}/></button><button type="button" aria-label="Delete slide" disabled={disabled || count <= 1} onClick={onDelete}><Trash2 size={14}/></button></span>
    </div>
    {open && <div className="hs-body">
      <TextInput label="Small label above the headline" value={slide.label} max={80} path={at(path, 'label')} errors={errors} disabled={disabled} onChange={label => set({label})}/>
      <TextInput label={slide.kind === 'story' ? 'Slide name (for screen readers and the slide list)' : 'Poster title'} value={slide.title} max={120} path={at(path, 'title')} errors={errors} disabled={disabled} onChange={title => set({title})}/>
      {slide.kind === 'story' && <>
        <fieldset className="sf-group"><legend>Headline</legend>{slide.lines.map((line, i) => <div className="sf-row" key={i}><TextInput label={`Line ${i + 1}`} value={line} max={60} path={at(at(path, 'lines'), i)} errors={errors} disabled={disabled} onChange={text => set({lines: slide.lines.map((entry, at2) => at2 === i ? text : entry)})}/>{slide.lines.length > 1 && <button type="button" aria-label={`Remove line ${i + 1}`} disabled={disabled} onClick={() => set({lines: slide.lines.filter((_, at2) => at2 !== i)})}><Trash2 size={14}/></button>}</div>)}{slide.lines.length < 3 && <button type="button" disabled={disabled} onClick={() => set({lines: [...slide.lines, '']})}><Plus size={14}/> Add a line</button>}<Problem errors={errors} path={at(path, 'lines')}/>
          <TextInput label="Emphasised ending (shown in bold, optional)" value={slide.emphasis} max={40} path={at(path, 'emphasis')} errors={errors} disabled={disabled} onChange={emphasis => set({emphasis})}/></fieldset>
        <TextInput long label="Description" value={slide.description} max={300} path={at(path, 'description')} errors={errors} disabled={disabled} onChange={description => set({description})}/>
      </>}
      <Field descriptor={{type: 'cta', label: 'Button'}} value={slide.cta} path={at(path, 'cta')} ctx={ctx} onChange={cta => set({cta})}/>
      <label className="sf"><span>Time on screen: {slide.duration / 1000} seconds</span><input type="range" min={heroLimits.durationMin / 1000} max={heroLimits.durationMax / 1000} step={1} value={slide.duration / 1000} disabled={disabled} onChange={event => set({duration: Number(event.target.value) * 1000})}/><small>Between {heroLimits.durationMin / 1000} and {heroLimits.durationMax / 1000} seconds.</small><Problem errors={errors} path={at(path, 'duration')}/></label>
      <MediaChoice label="Picture or video on large screens" value={slide.desktopMedia} allowVideo={slide.kind === 'story'} path={at(path, 'desktopMedia')} ctx={ctx} onChange={desktopMedia => set({desktopMedia})}/>
      <MediaChoice label="Picture on phones (optional)" value={slide.mobileMedia} allowVideo={slide.kind === 'story'} optional hint="Phones use the main picture unless you choose another." path={at(path, 'mobileMedia')} ctx={ctx} onChange={mobileMedia => set({mobileMedia})}/>
      {slide.kind === 'story' && <Featured value={slide.featuredMedia} path={at(path, 'featuredMedia')} ctx={ctx} onChange={featuredMedia => set({featuredMedia: featuredMedia ?? undefined})}/>}
    </div>}
  </li>;
}

export default function HeroEditor({doc, setDoc, ctx}) {
  const [openId, setOpenId] = useState(doc.slides[0]?.id);
  const {disabled} = ctx;
  const slides = doc.slides;
  const replace = next => setDoc({...doc, slides: next});
  const add = kind => { const slide = templates[kind](); replace([...slides, slide]); setOpenId(slide.id); };
  return <div className="hero-editor">
    <p className="sf-hint">Slides appear in this order. New and duplicated slides start hidden, so nothing unfinished can appear on the site. The slider's design, transitions and behaviour are fixed.</p>
    <ol className="hero-slides">{slides.map((slide, index) => <Slide key={slide.id} slide={slide} index={index} count={slides.length} ctx={ctx} open={openId === slide.id} setOpen={value => setOpenId(value ? slide.id : null)}
      update={next => replace(slides.map((entry, at2) => at2 === index ? next : entry))}
      onMove={delta => replace(move(slides, index, index + delta))}
      onDuplicate={() => { const copy = {...JSON.parse(JSON.stringify(slide)), id: newId(), enabled: false, title: `${slide.title} (copy)`.slice(0, 120)}; replace([...slides.slice(0, index + 1), copy, ...slides.slice(index + 1)]); setOpenId(copy.id); }}
      onDelete={() => { if (window.confirm(`Delete “${slide.title}”?`)) replace(slides.filter((_, at2) => at2 !== index)); }}/>)}</ol>
    <Problem errors={ctx.errors} path="slides"/>
    {slides.length < heroLimits.slides && <div className="sf-row"><button type="button" disabled={disabled} onClick={() => add('story')}><Plus size={14}/> Add a text-over-image slide</button><button type="button" disabled={disabled} onClick={() => add('artwork')}><Plus size={14}/> Add a poster slide</button></div>}
    <p className="sf-hint">{slides.length} of {heroLimits.slides} slides · {slides.filter(slide => slide.enabled).length} shown</p>
  </div>;
}
