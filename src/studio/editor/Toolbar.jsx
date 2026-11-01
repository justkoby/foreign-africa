import React, {useEffect, useState} from 'react';
import {Bold, Heading2, Heading3, Heading4, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Paperclip, Quote, Redo2, Table as TableIcon, Underline as UnderlineIcon, Undo2, Video as VideoIcon} from 'lucide-react';
import {youtubeId} from '../../../server/embeds.js';
import {insertBlock} from './extensions.js';

function Button({label, icon: Icon, active, disabled, onClick, children}) {
  return <button type="button" className="ed-tool" title={label} aria-label={label} aria-pressed={active === undefined ? undefined : Boolean(active)} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={onClick}>{Icon ? <Icon size={17} aria-hidden="true"/> : children}</button>;
}

function LinkForm({editor, onClose}) {
  const [href, setHref] = useState(editor.getAttributes('link').href || 'https://');
  const apply = event => {
    event.preventDefault();
    const clean = href.trim();
    if (!clean || clean === 'https://') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({href: clean}).run();
    onClose();
  };
  return <form className="ed-inline" onSubmit={apply}><label>Link address<input autoFocus value={href} onChange={event => setHref(event.target.value)} placeholder="https://…"/></label><button type="submit">Apply</button>{editor.isActive('link') && <button type="button" onClick={() => {editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose();}}>Remove link</button>}<button type="button" onClick={onClose}>Cancel</button></form>;
}

function VideoForm({editor, onClose}) {
  const current = editor.isActive('video') ? editor.getAttributes('video') : null;
  const [url, setUrl] = useState(current ? `https://youtu.be/${current.videoId}` : '');
  const [title, setTitle] = useState(current?.title || '');
  const [caption, setCaption] = useState(current?.caption || '');
  const id = youtubeId(url);
  const apply = event => {
    event.preventDefault();
    if (!id) return;
    const attrs = {provider: 'youtube', videoId: id, title: title.trim(), caption: caption.trim()};
    if (current) editor.chain().focus().updateAttributes('video', attrs).run();
    else insertBlock(editor, {type: 'video', attrs});
    onClose();
  };
  return <form className="ed-inline ed-inline-wide" onSubmit={apply}>
    <label>YouTube link<input autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={Boolean(url) && !id}/></label>
    <label>Title (for screen readers)<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)}/></label>
    <label>Caption<input value={caption} maxLength={300} onChange={event => setCaption(event.target.value)}/></label>
    <button type="submit" disabled={!id}>{current ? 'Update video' : 'Insert video'}</button><button type="button" onClick={onClose}>Cancel</button>
    {url && !id && <p className="ed-hint is-error" role="alert">Use a youtube.com or youtu.be link. Other video sites are not approved.</p>}
  </form>;
}

export default function Toolbar({editor, onPickImage, onPickDocument}) {
  const [panel, setPanel] = useState('');
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return undefined;
    const update = () => force(value => value + 1);
    editor.on('transaction', update);
    return () => editor.off('transaction', update);
  }, [editor]);
  if (!editor) return null;
  const chain = () => editor.chain().focus();
  const inTable = editor.isActive('table');
  const heading = level => ({label: `Heading ${level}`, icon: {2: Heading2, 3: Heading3, 4: Heading4}[level], active: editor.isActive('heading', {level}), onClick: () => chain().toggleHeading({level}).run()});
  return <div className="ed-toolbar" role="toolbar" aria-label="Formatting">
    <div className="ed-group"><Button label="Undo" icon={Undo2} disabled={!editor.can().undo()} onClick={() => chain().undo().run()}/><Button label="Redo" icon={Redo2} disabled={!editor.can().redo()} onClick={() => chain().redo().run()}/></div>
    <div className="ed-group">{[2, 3, 4].map(level => {const h = heading(level); return <Button key={level} {...h}/>;})}</div>
    <div className="ed-group"><Button label="Bold" icon={Bold} active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}/><Button label="Italic" icon={Italic} active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}/><Button label="Underline" icon={UnderlineIcon} active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}/></div>
    <div className="ed-group"><Button label="Bulleted list" icon={List} active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}/><Button label="Numbered list" icon={ListOrdered} active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}/><Button label="Quote" icon={Quote} active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}/><Button label="Divider" icon={Minus} onClick={() => chain().setHorizontalRule().run()}/></div>
    <div className="ed-group"><Button label="Link" icon={Link2} active={editor.isActive('link') || panel === 'link'} onClick={() => setPanel(panel === 'link' ? '' : 'link')}/><Button label="Insert image from the media library" icon={ImageIcon} onClick={onPickImage}/><Button label="Link a document from the media library" icon={Paperclip} onClick={onPickDocument}/><Button label="Insert YouTube video" icon={VideoIcon} active={editor.isActive('video') || panel === 'video'} onClick={() => setPanel(panel === 'video' ? '' : 'video')}/><Button label="Insert table" icon={TableIcon} active={inTable} disabled={inTable} onClick={() => chain().insertTable({rows: 3, cols: 3, withHeaderRow: true}).run()}/></div>
    {panel === 'link' && <LinkForm editor={editor} onClose={() => setPanel('')}/>}
    {panel === 'video' && <VideoForm editor={editor} onClose={() => setPanel('')}/>}
    {inTable && <div className="ed-context" role="toolbar" aria-label="Table">
      <strong>Table</strong>
      <button type="button" onClick={() => chain().addRowBefore().run()}>Row above</button><button type="button" onClick={() => chain().addRowAfter().run()}>Row below</button><button type="button" onClick={() => chain().deleteRow().run()}>Delete row</button>
      <button type="button" onClick={() => chain().addColumnBefore().run()}>Column left</button><button type="button" onClick={() => chain().addColumnAfter().run()}>Column right</button><button type="button" onClick={() => chain().deleteColumn().run()}>Delete column</button>
      <button type="button" onClick={() => chain().toggleHeaderRow().run()}>Header row</button><button type="button" onClick={() => chain().mergeOrSplit().run()}>Merge / split cells</button>
      <button type="button" className="is-danger" onClick={() => chain().deleteTable().run()}>Delete table</button>
    </div>}
    {editor.isActive('image') && <div className="ed-context" role="group" aria-label="Image details">
      <strong>Image</strong>
      <label>Alt text<input value={editor.getAttributes('image').alt || ''} maxLength={300} onChange={event => editor.commands.updateAttributes('image', {alt: event.target.value})} placeholder="Describe the image for screen readers"/></label>
      <label>Caption<input value={editor.getAttributes('image').caption || ''} maxLength={500} onChange={event => editor.commands.updateAttributes('image', {caption: event.target.value})}/></label>
    </div>}
    {editor.isActive('video') && panel !== 'video' && <div className="ed-context" role="group" aria-label="Video details"><strong>Video</strong><span>{editor.getAttributes('video').title || editor.getAttributes('video').videoId}</span><button type="button" onClick={() => setPanel('video')}>Edit video details</button></div>}
  </div>;
}
