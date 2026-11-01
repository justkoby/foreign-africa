import React from 'react';
import {ArrowDown, ArrowUp, ImageIcon, Plus, Trash2} from 'lucide-react';

// Every control here is generated from a field definition in server/site-fields.js, the same definition the server
// validates against. There is no control for layout, styling or behaviour, because there is no such field.
export const at = (path, key) => (path ? (typeof key === 'number' ? `${path}[${key}]` : `${path}.${key}`) : String(key));

export function Problem({errors, path}) {
  const list = errors[path];
  return list ? <span className="sf-error" role="alert">{list.join(' ')}</span> : null;
}

function Counter({value, max}) {
  const used = String(value ?? '').length;
  return <small className={used > max ? 'is-warn' : ''}>{used}/{max}</small>;
}

export function TextInput({label, value, onChange, max, path, errors, long, hint, disabled}) {
  const Tag = long ? 'textarea' : 'input';
  return <label className="sf"><span>{label}</span><Tag value={value ?? ''} rows={long ? 3 : undefined} disabled={disabled} aria-invalid={Boolean(errors[path])} onChange={event => onChange(event.target.value)}/>{hint && <small>{hint}</small>}{max ? <Counter value={value} max={max}/> : null}<Problem errors={errors} path={path}/></label>;
}

export function ImageField({label, value, onPick, onClear, path, errors, disabled}) {
  return <div className="sf sf-image"><span>{label}</span>
    {value?.src ? <img src={value.src} alt=""/> : <div className="sf-noimage"><ImageIcon size={22} aria-hidden="true"/> No image chosen</div>}
    <div className="sf-row"><button type="button" disabled={disabled} onClick={onPick}>{value?.src ? 'Replace from library' : 'Choose from library'}</button>{onClear && value?.src && <button type="button" disabled={disabled} onClick={onClear}>Remove</button>}</div>
    <Problem errors={errors} path={path}/></div>;
}

const move = (items, from, to) => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; };

export function Field({descriptor, value, onChange, path, ctx}) {
  const {errors, options, pick, disabled} = ctx;
  switch (descriptor.type) {
    case 'text': return <TextInput label={descriptor.label} value={value} max={descriptor.max} path={path} errors={errors} disabled={disabled} onChange={onChange}/>;
    case 'longtext': return <TextInput long label={descriptor.label} value={value} max={descriptor.max} path={path} errors={errors} disabled={disabled} onChange={onChange}/>;
    case 'link': return <TextInput label={descriptor.label} value={value} path={path} errors={errors} disabled={disabled} hint="A page such as /who-we-are/, a #section, mailto:, or an approved https:// address." onChange={onChange}/>;
    case 'lines': return <fieldset className="sf-group"><legend>{descriptor.label}</legend>{Array.from({length: descriptor.count}, (_, i) => <TextInput key={i} label={`Line ${i + 1}`} value={value?.[i]} max={descriptor.max} path={at(path, i)} errors={errors} disabled={disabled} onChange={text => onChange(Object.assign([...(value ?? [])], {[i]: text}))}/>)}<Problem errors={errors} path={path}/></fieldset>;
    case 'texts': return <fieldset className="sf-group"><legend>{descriptor.label}</legend>{Array.from({length: descriptor.count}, (_, i) => <TextInput long key={i} label={`Paragraph ${i + 1}`} value={value?.[i]} max={descriptor.max} path={at(path, i)} errors={errors} disabled={disabled} onChange={text => onChange(Object.assign([...(value ?? [])], {[i]: text}))}/>)}</fieldset>;
    case 'cta': return <fieldset className="sf-group"><legend>{descriptor.label}</legend><TextInput label="Text" value={value?.label} max={40} path={at(path, 'label')} errors={errors} disabled={disabled} onChange={label => onChange({...value, label})}/><TextInput label="Goes to" value={value?.href} path={at(path, 'href')} errors={errors} disabled={disabled} hint="A page such as /who-we-are/, a #section, mailto:, or an approved https:// address." onChange={href => onChange({...value, href})}/></fieldset>;
    case 'image': return <ImageField label={descriptor.label} value={value} path={path} errors={errors} disabled={disabled} onPick={() => pick('image', file => onChange({mediaId: file.id, src: file.url}))}/>;
    case 'story': return <label className="sf"><span>{descriptor.label}</span><select value={value ?? ''} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select><Problem errors={errors} path={path}/></label>;
    case 'stories': return <fieldset className="sf-group"><legend>{descriptor.label}</legend>{Array.from({length: descriptor.count}, (_, i) => <label className="sf" key={i}><span>Story {i + 1}</span><select value={value?.[i] ?? ''} disabled={disabled} onChange={event => onChange(Object.assign([...(value ?? [])], {[i]: event.target.value}))}>{options.stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select><Problem errors={errors} path={at(path, i)}/></label>)}<Problem errors={errors} path={path}/></fieldset>;
    case 'partners': return <fieldset className="sf-group"><legend>{descriptor.label}</legend><p className="sf-hint">Choose which partners appear and in what order. Logos and names are managed with the partners themselves.</p><ul className="sf-partners">{(value ?? []).map((item, i) => <li key={item.id}><label><input type="checkbox" checked={item.visible} disabled={disabled} onChange={event => onChange(value.map((entry, at2) => at2 === i ? {...entry, visible: event.target.checked} : entry))}/> {options.partners.find(partner => partner.id === item.id)?.name ?? item.id}</label><span><button type="button" aria-label="Move up" disabled={disabled || i === 0} onClick={() => onChange(move(value, i, i - 1))}><ArrowUp size={14}/></button><button type="button" aria-label="Move down" disabled={disabled || i === value.length - 1} onClick={() => onChange(move(value, i, i + 1))}><ArrowDown size={14}/></button></span></li>)}</ul><Problem errors={errors} path={path}/></fieldset>;
    case 'list': {
      const items = value ?? [];
      const blank = () => Object.fromEntries(Object.entries(descriptor.item).map(([key, d]) => [key, d.type === 'lines' ? Array(d.count).fill('') : d.type === 'cta' ? {label: '', href: ''} : '']));
      return <fieldset className="sf-group"><legend>{descriptor.label}</legend>
        {items.map((item, i) => <div className="sf-item" key={i}><div className="sf-item-head"><strong>{descriptor.label.replace(/s$/, '')} {i + 1}</strong>{!descriptor.fixed && <span><button type="button" aria-label="Move up" disabled={disabled || i === 0} onClick={() => onChange(move(items, i, i - 1))}><ArrowUp size={14}/></button><button type="button" aria-label="Move down" disabled={disabled || i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))}><ArrowDown size={14}/></button><button type="button" aria-label="Remove" disabled={disabled || items.length <= descriptor.min} onClick={() => onChange(items.filter((_, at2) => at2 !== i))}><Trash2 size={14}/></button></span>}</div>
          {Object.entries(descriptor.item).map(([key, d]) => <Field key={key} descriptor={d} value={item[key]} path={at(at(path, i), key)} ctx={ctx} onChange={next => onChange(items.map((entry, at2) => at2 === i ? {...entry, [key]: next} : entry))}/>)}</div>)}
        {!descriptor.fixed && items.length < descriptor.max && <button type="button" disabled={disabled} onClick={() => onChange([...items, blank()])}><Plus size={14} aria-hidden="true"/> Add</button>}
        <Problem errors={errors} path={path}/></fieldset>;
    }
    default: return null;
  }
}
