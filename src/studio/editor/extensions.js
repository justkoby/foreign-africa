import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import {Node} from '@tiptap/core';

// An image with the attributes the server stores: alt text, caption, optional link.
export const Figure = Image.extend({
  addAttributes() {
    return {src: {default: null}, alt: {default: ''}, caption: {default: ''}, href: {default: null}};
  },
});

// Approved video block. Only a YouTube id is stored; the server rebuilds the embed address, so nothing typed here can
// inject markup. The editor shows a plain card instead of loading the video (no third-party requests while writing).
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {provider: {default: 'youtube'}, videoId: {default: ''}, title: {default: ''}, caption: {default: ''}};
  },
  parseHTML() {
    return [{tag: 'figure[data-video-id]', getAttrs: element => ({videoId: element.getAttribute('data-video-id')})}];
  },
  renderHTML({node}) {
    return ['figure', {class: 'editor-video', 'data-video-id': node.attrs.videoId}, ['div', {class: 'editor-video-card'}, ['strong', {}, 'YouTube video'], ['span', {}, node.attrs.title || node.attrs.videoId]], ['figcaption', {}, node.attrs.caption || '']];
  },
});

export function editorExtensions() {
  return [
    StarterKit.configure({heading: {levels: [2, 3, 4]}}),
    Underline,
    Link.configure({openOnClick: false}),
    Figure,
    Video,
    Table.configure({resizable: false}),
    TableRow,
    TableHeader,
    TableCell,
  ];
}

// Insert a block (image, video) at the document level. When the cursor is inside a table the block goes straight
// after the table, because cells only hold text and lists.
export function insertBlock(editor, node) {
  const {$from} = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') return editor.chain().focus().insertContentAt($from.after(depth), node).run();
  }
  // A selected block (just-inserted image or video) must not be replaced: add the new block after it.
  if (editor.state.selection.node) return editor.chain().focus().insertContentAt(editor.state.selection.to, node).run();
  return editor.chain().focus().insertContent(node).run();
}

// What the publish checklist reads from the document.
export function documentFacts(document) {
  const facts = {images: 0, imagesWithoutAlt: 0, videos: 0, tables: 0, words: 0};
  const walk = node => {
    if (!node) return;
    if (node.type === 'image') { facts.images += 1; if (!String(node.attrs?.alt ?? '').trim()) facts.imagesWithoutAlt += 1; }
    if (node.type === 'video') facts.videos += 1;
    if (node.type === 'table') facts.tables += 1;
    if (node.type === 'text') facts.words += String(node.text).trim().split(/\s+/).filter(Boolean).length;
    (node.content ?? []).forEach(walk);
  };
  walk(document);
  return facts;
}
