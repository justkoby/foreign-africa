import React, {useState, useRef, useEffect} from 'react';
import {
  Sparkles,
  ArrowUp,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  RotateCcw,
  Plus,
  Replace,
  FileText,
  Tag,
  AlertCircle,
  Loader2,
  Trash2,
  Code2,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import {api} from '../api.js';
import {useFeedback} from '../ui/index.jsx';
import {
  parseAiContentToTiptapNodes,
  aiNodesToPlainText,
  aiNodesToSafeHtml,
  classifyResponseKind,
  extractStructuredMetadata,
} from './gemini-format.js';

// Render validated Tiptap AST nodes directly as safe React elements (no raw HTML or Markdown syntax)
function FormattedInline({nodes = []}) {
  return nodes.map((node, index) => {
    if (node.type === 'hardBreak') return <br key={index} />;
    if (node.type !== 'text') return null;
    let element = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') element = <strong key={`b-${index}`}>{element}</strong>;
      else if (mark.type === 'italic') element = <em key={`i-${index}`}>{element}</em>;
      else if (mark.type === 'underline') element = <u key={`u-${index}`}>{element}</u>;
      else if (mark.type === 'link' && mark.attrs?.href) {
        element = (
          <a
            key={`a-${index}`}
            href={mark.attrs.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {element}
          </a>
        );
      }
    }
    return <React.Fragment key={index}>{element}</React.Fragment>;
  });
}

export function FormattedNodes({nodes = []}) {
  if (!nodes.length) return null;
  return (
    <div className="ed-gemini-formatted">
      {nodes.map((block, idx) => {
        if (block.type === 'heading') {
          const level = block.attrs?.level || 3;
          const TagName = level === 2 ? 'h3' : level === 3 ? 'h4' : 'h5';
          return (
            <TagName key={idx} className={`ed-gemini-h ed-gemini-h${level}`}>
              <FormattedInline nodes={block.content} />
            </TagName>
          );
        }
        if (block.type === 'paragraph') {
          return (
            <p key={idx} className="ed-gemini-p">
              <FormattedInline nodes={block.content} />
            </p>
          );
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote key={idx} className="ed-gemini-blockquote">
              {(block.content ?? []).map((child, cIdx) => (
                <p key={cIdx} className="ed-gemini-p">
                  <FormattedInline nodes={child.content} />
                </p>
              ))}
            </blockquote>
          );
        }
        if (block.type === 'bulletList') {
          return (
            <ul key={idx} className="ed-gemini-list ed-gemini-ul">
              {(block.content ?? []).map((item, iIdx) => (
                <li key={iIdx}>
                  {(item.content ?? []).map((child, cIdx) => (
                    <FormattedInline key={cIdx} nodes={child.content} />
                  ))}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'orderedList') {
          return (
            <ol key={idx} className="ed-gemini-list ed-gemini-ol">
              {(block.content ?? []).map((item, iIdx) => (
                <li key={iIdx}>
                  {(item.content ?? []).map((child, cIdx) => (
                    <FormattedInline key={cIdx} nodes={child.content} />
                  ))}
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === 'horizontalRule') {
          return <hr key={idx} className="ed-gemini-hr" />;
        }
        return null;
      })}
    </div>
  );
}

const ACTION_LABELS = {
  improve: 'Improve writing',
  shorten: 'Shorten selection',
  expand: 'Expand section',
  tone_institutional: 'Institutional tone',
  simplify: 'Simplify language',
  rewrite: 'Rewrite passage',
  headlines: 'Alternative headlines',
  excerpt: 'Summary / excerpt',
  seo: 'SEO title & description',
  tags: 'Categories & tags',
  social: 'LinkedIn & social post',
  grammar: 'Grammar & readability review',
  factcheck: 'Fact-check & claim verification',
  draft: 'Article draft',
  custom: 'Editorial response',
};

export default function GeminiAssistant({
  editor,
  item,
  touch,
  addTag,
  onClose,
  isExpanded,
  onToggleExpand,
}) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [appliedBadge, setAppliedBadge] = useState(null);
  const [sourceViewId, setSourceViewId] = useState(null);
  const [selectionState, setSelectionState] = useState({from: 0, to: 0, text: ''});

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const {confirm} = useFeedback();

  // Subscribe to Tiptap selection changes in real time
  useEffect(() => {
    if (!editor) return undefined;
    const syncSelection = () => {
      const {from, to, empty} = editor.state.selection;
      if (!empty && to > from) {
        const text = editor.state.doc.textBetween(from, to, '\n\n').trim();
        if (text) {
          setSelectionState({from, to, text});
          return;
        }
      }
      setSelectionState({from: 0, to: 0, text: ''});
    };
    syncSelection();
    editor.on('selectionUpdate', syncSelection);
    editor.on('update', syncSelection);
    return () => {
      editor.off('selectionUpdate', syncSelection);
      editor.off('update', syncSelection);
    };
  }, [editor]);

  useEffect(() => {
    if (!regeneratingId) {
      chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }
  }, [turns.length, busy, regeneratingId]);

  const showAppliedFeedback = key => {
    setAppliedBadge(key);
    setTimeout(() => setAppliedBadge(current => (current === key ? null : current)), 2200);
  };

  const runAction = async (action, customPrompt = '', existingTurnId = null, savedSelection = null) => {
    if (busy) return;
    setError('');
    setBusy(true);
    if (existingTurnId) setRegeneratingId(existingTurnId);

    const activeSelection = savedSelection || selectionState;
    const selectedText = activeSelection.text || '';
    const promptText = customPrompt !== undefined ? customPrompt : input.trim();

    if (!existingTurnId && (customPrompt || input.trim())) {
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }

    const turnId = existingTurnId || `turn-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});

    if (!existingTurnId) {
      const pendingTurn = {
        id: turnId,
        action,
        promptText,
        userLabel: promptText || ACTION_LABELS[action] || action,
        selectionRange: selectedText ? {...activeSelection} : null,
        selectedSnippet: selectedText ? selectedText.slice(0, 160) : null,
        time: timestamp,
        status: 'loading',
        rawResult: '',
        nodes: [],
        plainText: '',
        safeHtml: '',
        responseKind: classifyResponseKind(action, promptText),
        structured: {},
      };
      setTurns(prev => [...prev, pendingTurn]);
    }

    const contextPayload = {
      id: item.id,
      title: item.title,
      summary: item.summary,
      category: item.category,
      tags: item.tags,
      type: item.type,
      body: editor ? editor.getText() : '',
    };

    try {
      const response = await api('/api/staff/gemini/assist', {
        method: 'POST',
        body: {
          action,
          prompt: promptText,
          selectedText,
          context: contextPayload,
        },
      });

      const rawResult = response.result || '';
      const nodes = parseAiContentToTiptapNodes(rawResult);
      const plainText = aiNodesToPlainText(nodes);
      const safeHtml = aiNodesToSafeHtml(nodes);
      const responseKind = response.responseKind || classifyResponseKind(action, promptText);
      const structured = extractStructuredMetadata(action, rawResult);

      setTurns(prev =>
        prev.map(t =>
          t.id === turnId
            ? {
                ...t,
                status: 'ready',
                rawResult,
                nodes,
                plainText,
                safeHtml,
                responseKind,
                structured,
                time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
              }
            : t
        )
      );
    } catch (err) {
      const message = err.message || 'Gemini could not process your request.';
      setError(message);
      if (!existingTurnId) {
        setTurns(prev => prev.filter(t => t.id !== turnId));
      }
    } finally {
      setBusy(false);
      setRegeneratingId(null);
    }
  };

  const handleCopy = (id, plainText) => {
    navigator.clipboard.writeText(plainText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(current => (current === id ? null : current)), 2000);
  };

  // Insert valid Tiptap document nodes at cursor (or at end of document) without overwriting existing content
  const handleInsertNodes = (turnId, nodes) => {
    if (!editor || !nodes?.length) return;
    const {empty, to} = editor.state.selection;
    if (!empty) {
      // If text is currently highlighted, insert AFTER the selection so we never overwrite without confirmation
      editor.chain().focus().insertContentAt(to, nodes).run();
    } else {
      editor.chain().focus().insertContent(nodes).run();
    }
    showAppliedFeedback(`insert-${turnId}`);
  };

  // Replace selected text using valid Tiptap nodes with confirmation safeguard
  const handleReplaceSelection = async turn => {
    if (!editor || !turn.nodes?.length) return;

    const liveSel = editor.state.selection;
    let range = null;
    let targetPreview = '';

    if (!liveSel.empty && liveSel.to > liveSel.from) {
      range = {from: liveSel.from, to: liveSel.to};
      targetPreview = editor.state.doc.textBetween(liveSel.from, liveSel.to, ' ').trim();
    } else if (turn.selectionRange) {
      const docSize = editor.state.doc.content.size;
      const {from, to, text} = turn.selectionRange;
      if (from >= 0 && to <= docSize && to > from) {
        const currentSlice = editor.state.doc.textBetween(from, to, '\n\n').trim();
        if (currentSlice === text) {
          range = {from, to};
          targetPreview = currentSlice;
        }
      }
    }

    if (!range) {
      setError('Select the text in the editor that you want to replace, or choose "Insert into article".');
      return;
    }

    if (targetPreview.length > 350) {
      const ok = await confirm({
        title: 'Replace selected passage?',
        message: `This will replace "${targetPreview.slice(0, 90)}…" with the Gemini suggestion. You can undo this at any time with Ctrl+Z.`,
        confirm: 'Replace selection',
      });
      if (!ok) return;
    }

    // If replacing within a single paragraph with a single paragraph node, insert inline content cleanly
    const isSingleParagraph = turn.nodes.length === 1 && turn.nodes[0].type === 'paragraph';
    const contentToInsert = isSingleParagraph ? (turn.nodes[0].content ?? []) : turn.nodes;

    editor
      .chain()
      .focus()
      .insertContentAt({from: range.from, to: range.to}, contentToInsert)
      .run();

    showAppliedFeedback(`replace-${turn.id}`);
  };

  const handleDiscard = turnId => {
    setTurns(prev => prev.filter(t => t.id !== turnId));
  };

  const handleApplyHeadline = async (turnId, headline, index) => {
    const clean = String(headline || '').trim();
    if (!clean) return;
    if (item.title && item.title.trim() && item.title.trim() !== clean) {
      const ok = await confirm({
        title: 'Replace current article title?',
        message: `Replace "${item.title}" with "${clean}"?`,
        confirm: 'Replace title',
      });
      if (!ok) return;
    }
    touch({title: clean});
    showAppliedFeedback(`headline-${turnId}-${index}`);
  };

  const handleApplyExcerpt = async (turnId, text) => {
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean) return;
    if (item.summary && item.summary.trim() && item.summary.trim() !== clean) {
      const ok = await confirm({
        title: 'Replace existing excerpt?',
        message: 'Your article already has an excerpt. Replace it with this Gemini suggestion?',
        confirm: 'Replace excerpt',
      });
      if (!ok) return;
    }
    touch({summary: clean});
    showAppliedFeedback(`excerpt-${turnId}`);
  };

  const handleApplySeo = async (turnId, seoTitle, seoDescription) => {
    if (!seoTitle && !seoDescription) return;
    if ((item.seoTitle && seoTitle) || (item.seoDescription && seoDescription)) {
      const ok = await confirm({
        title: 'Update SEO metadata?',
        message: 'Replace your current SEO title and meta description with these suggestions?',
        confirm: 'Update SEO',
      });
      if (!ok) return;
    }
    const patch = {};
    if (seoTitle) patch.seoTitle = seoTitle.slice(0, 60);
    if (seoDescription) patch.seoDescription = seoDescription.slice(0, 160);
    touch(patch);
    showAppliedFeedback(`seo-${turnId}`);
  };

  const handleApplyTags = (turnId, category, tags = []) => {
    if (category && !item.category) {
      touch({category});
    }
    tags.forEach(t => addTag(t));
    showAppliedFeedback(`tags-${turnId}`);
  };

  const selectedText = selectionState.text;

  return (
    <div className={`ed-gemini-panel ${isExpanded ? 'is-expanded' : ''}`} aria-label="Gemini Editorial Assistant">
      {/* Panel Header */}
      <header className="ed-gemini-header">
        <div className="ed-gemini-brand">
          <span className="ed-gemini-sparkle">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <strong>Gemini</strong>
            <span className="ed-gemini-sub">Editorial Assistant</span>
          </div>
        </div>
        <div className="ed-gemini-controls">
          <button
            type="button"
            className="ed-gemini-mode-btn"
            title={isExpanded ? 'Standard panel width' : 'Widen panel for comfortable reading'}
            aria-label={isExpanded ? 'Standard panel width' : 'Widen panel for comfortable reading'}
            onClick={onToggleExpand}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isExpanded ? 'Compact' : 'Expand'}</span>
          </button>
          <button
            type="button"
            className="fa-iconbtn"
            title="Close Gemini panel"
            aria-label="Close Gemini panel"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Context Banner */}
      <div className="ed-gemini-context-banner">
        {selectedText ? (
          <div className="ed-gemini-context-tag is-selection" title={selectedText}>
            <span className="ed-gemini-dot" />
            <span>
              Selected ({selectedText.split(/\s+/).filter(Boolean).length} words):{' '}
              <strong>“{selectedText.slice(0, 52)}{selectedText.length > 52 ? '…' : ''}”</strong>
            </span>
          </div>
        ) : (
          <div className="ed-gemini-context-tag">
            <FileText size={13} />
            <span>
              Article context: <strong>{item.title ? item.title.slice(0, 48) : 'Untitled draft'}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Independent Scrollable Workspace Body */}
      <div className="ed-gemini-body">
        {turns.length === 0 && (
          <div className="ed-gemini-welcome">
            <div className="ed-gemini-welcome-icon">
              <Sparkles size={24} />
            </div>
            <h3>Editorial Writing & Research Partner</h3>
            <p>
              Highlight any paragraph in the editor to refine, condense, or rewrite it, or select a document action below.
            </p>
          </div>
        )}

        {/* Quick Action Suggestions */}
        <div className="ed-gemini-suggestions-wrap">
          <span className="ed-gemini-section-title">
            {selectedText ? 'Selected text actions' : 'Document actions'}
          </span>
          <div className="ed-gemini-chips">
            {selectedText ? (
              <>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('improve')}>
                  Improve writing
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('shorten')}>
                  Shorten
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('expand')}>
                  Expand
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('tone_institutional')}>
                  Institutional tone
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('simplify')}>
                  Simplify
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('rewrite')}>
                  Rewrite
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('excerpt')}>
                  Generate excerpt
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('headlines')}>
                  Suggest headlines
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('seo')}>
                  SEO description
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('tags')}>
                  Categories & tags
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('grammar')}>
                  Review grammar
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('factcheck')}>
                  Flag unverified claims
                </button>
                <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('social')}>
                  LinkedIn caption
                </button>
                {Boolean(item.title?.trim()) && (
                  <button type="button" className="ed-gemini-chip" disabled={busy} onClick={() => runAction('draft')}>
                    Draft from title
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Conversation Turns Stream */}
        {turns.length > 0 && (
          <div className="ed-gemini-turns" role="log" aria-live="polite">
            {turns.map(turn => {
              const isTurnLoading = turn.status === 'loading' || regeneratingId === turn.id;
              const canReplace = Boolean(selectedText || turn.selectionRange);
              const showSource = sourceViewId === turn.id;

              return (
                <article key={turn.id} className="ed-gemini-turn">
                  {/* User Prompt Bubble */}
                  <div className="ed-gemini-user-row">
                    <div className="ed-gemini-user-bubble">
                      <div className="ed-gemini-user-head">
                        <span className="ed-gemini-user-label">{turn.userLabel}</span>
                        <time className="ed-gemini-time">{turn.time}</time>
                      </div>
                      {turn.selectedSnippet && (
                        <blockquote className="ed-gemini-quote">
                          “{turn.selectedSnippet}{turn.selectedSnippet.length >= 160 ? '…' : ''}”
                        </blockquote>
                      )}
                    </div>
                  </div>

                  {/* Assistant Response Card */}
                  {isTurnLoading ? (
                    <div className="ed-gemini-card is-loading" aria-busy="true">
                      <div className="ed-gemini-card-header">
                        <span className="ed-gemini-card-title">
                          <Loader2 size={14} className="fa-spin" />
                          {regeneratingId === turn.id ? 'Regenerating suggestion…' : 'Gemini is preparing a response…'}
                        </span>
                      </div>
                      <div className="ed-gemini-shimmer-lines">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  ) : (
                    <div className={`ed-gemini-card is-kind-${turn.responseKind}`}>
                      {/* Card Header */}
                      <div className="ed-gemini-card-header">
                        <span className="ed-gemini-card-title">
                          {turn.responseKind === 'article_content' ? (
                            <Sparkles size={14} />
                          ) : turn.responseKind === 'metadata' ? (
                            <Tag size={14} />
                          ) : (
                            <MessageSquare size={14} />
                          )}
                          <span>
                            {turn.responseKind === 'article_content'
                              ? `Suggested passage · ${ACTION_LABELS[turn.action] || 'Draft'}`
                              : ACTION_LABELS[turn.action] || 'Editorial response'}
                          </span>
                        </span>
                        <div className="ed-gemini-card-meta">
                          {turn.responseKind === 'article_content' && (
                            <button
                              type="button"
                              className={`ed-gemini-source-toggle ${showSource ? 'is-active' : ''}`}
                              title="Toggle HTML source view"
                              aria-pressed={showSource}
                              onClick={() => setSourceViewId(showSource ? null : turn.id)}
                            >
                              <Code2 size={12} />
                              <span>Source</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="ed-gemini-discard-top"
                            title="Discard this suggestion"
                            aria-label="Discard this suggestion"
                            onClick={() => handleDiscard(turn.id)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Card Body: Structured Metadata vs Formatted Content */}
                      <div className="ed-gemini-card-content">
                        {showSource ? (
                          <pre className="ed-gemini-source-code">{turn.safeHtml}</pre>
                        ) : turn.action === 'headlines' && turn.structured?.headlines?.length > 0 ? (
                          <ul className="ed-gemini-headline-list">
                            {turn.structured.headlines.map((hl, idx) => (
                              <li key={idx} className="ed-gemini-headline-item">
                                <span>{hl}</span>
                                <button
                                  type="button"
                                  className="ed-gemini-inline-apply"
                                  onClick={() => handleApplyHeadline(turn.id, hl, idx)}
                                >
                                  {appliedBadge === `headline-${turn.id}-${idx}` ? (
                                    <>
                                      <Check size={12} /> Applied
                                    </>
                                  ) : (
                                    'Use as title'
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : turn.action === 'seo' && (turn.structured?.seoTitle || turn.structured?.seoDescription) ? (
                          <div className="ed-gemini-seo-box">
                            {turn.structured.seoTitle && (
                              <div className="ed-gemini-seo-field">
                                <div className="ed-gemini-seo-label">
                                  <span>SEO Title</span>
                                  <small>{turn.structured.seoTitle.length}/60</small>
                                </div>
                                <strong>{turn.structured.seoTitle}</strong>
                              </div>
                            )}
                            {turn.structured.seoDescription && (
                              <div className="ed-gemini-seo-field">
                                <div className="ed-gemini-seo-label">
                                  <span>Meta Description</span>
                                  <small>{turn.structured.seoDescription.length}/160</small>
                                </div>
                                <p>{turn.structured.seoDescription}</p>
                              </div>
                            )}
                            <button
                              type="button"
                              className="ed-gemini-btn is-primary"
                              onClick={() => handleApplySeo(turn.id, turn.structured.seoTitle, turn.structured.seoDescription)}
                            >
                              {appliedBadge === `seo-${turn.id}` ? (
                                <>
                                  <Check size={13} /> SEO metadata applied
                                </>
                              ) : (
                                'Apply SEO title & description'
                              )}
                            </button>
                          </div>
                        ) : turn.action === 'tags' && (turn.structured?.tags?.length > 0 || turn.structured?.category) ? (
                          <div className="ed-gemini-tags-box">
                            {turn.structured.category && (
                              <p className="ed-gemini-suggested-cat">
                                Suggested category: <strong>{turn.structured.category}</strong>
                              </p>
                            )}
                            {turn.structured.tags?.length > 0 && (
                              <div className="ed-gemini-tag-pills">
                                {turn.structured.tags.map(t => (
                                  <button
                                    key={t}
                                    type="button"
                                    className="ed-gemini-tag-pill"
                                    title={`Click to add tag "${t}"`}
                                    onClick={() => addTag(t)}
                                  >
                                    <Plus size={11} /> {t}
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              className="ed-gemini-btn is-primary"
                              onClick={() => handleApplyTags(turn.id, turn.structured.category, turn.structured.tags)}
                            >
                              {appliedBadge === `tags-${turn.id}` ? (
                                <>
                                  <Check size={13} /> Added to article
                                </>
                              ) : (
                                <>
                                  <Tag size={13} /> Apply all tags
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <FormattedNodes nodes={turn.nodes} />
                        )}

                        {turn.action === 'excerpt' && (
                          <div className="ed-gemini-excerpt-bar">
                            <small>{(turn.structured?.excerpt || turn.plainText).length}/500 characters</small>
                            <button
                              type="button"
                              className="ed-gemini-btn is-primary"
                              onClick={() => handleApplyExcerpt(turn.id, turn.structured?.excerpt || turn.plainText)}
                            >
                              {appliedBadge === `excerpt-${turn.id}` ? (
                                <>
                                  <Check size={13} /> Applied as excerpt
                                </>
                              ) : (
                                <>
                                  <FileText size={13} /> Apply as Excerpt
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions: Insert, Replace, Copy, Regenerate, Discard */}
                      <div className="ed-gemini-card-actions" role="group" aria-label="Suggestion actions">
                        <button
                          type="button"
                          className="ed-gemini-btn is-primary"
                          onClick={() => handleInsertNodes(turn.id, turn.nodes)}
                          title="Insert formatted content into article at cursor"
                        >
                          {appliedBadge === `insert-${turn.id}` ? (
                            <>
                              <CheckCircle2 size={13} /> Inserted
                            </>
                          ) : (
                            <>
                              <Plus size={13} /> Insert into article
                            </>
                          )}
                        </button>

                        {canReplace && (
                          <button
                            type="button"
                            className="ed-gemini-btn is-secondary"
                            onClick={() => handleReplaceSelection(turn)}
                            title="Replace the selected passage in the editor"
                          >
                            {appliedBadge === `replace-${turn.id}` ? (
                              <>
                                <CheckCircle2 size={13} /> Replaced
                              </>
                            ) : (
                              <>
                                <Replace size={13} /> Replace selected text
                              </>
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          className="ed-gemini-btn"
                          onClick={() => handleCopy(turn.id, turn.plainText)}
                          title="Copy clean text to clipboard"
                        >
                          {copiedId === turn.id ? (
                            <>
                              <Check size={13} className="is-success" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={13} /> Copy
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="ed-gemini-btn"
                          disabled={busy}
                          onClick={() => runAction(turn.action, turn.promptText, turn.id, turn.selectionRange)}
                          title="Regenerate this suggestion"
                        >
                          <RotateCcw size={13} /> Regenerate
                        </button>

                        <button
                          type="button"
                          className="ed-gemini-btn is-ghost-danger"
                          onClick={() => handleDiscard(turn.id)}
                          title="Discard this suggestion"
                        >
                          <Trash2 size={13} /> Discard
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {error && (
          <div className="ed-gemini-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Fixed Prompt Footer */}
      <footer className="ed-gemini-footer">
        <form
          className="ed-gemini-input-box"
          onSubmit={e => {
            e.preventDefault();
            if (input.trim() && !busy) runAction('custom', input);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={
              selectedText
                ? 'Ask Gemini to edit or analyse the selected text…'
                : 'Ask Gemini to draft, refine, or analyse this article…'
            }
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !busy) runAction('custom', input);
              }
            }}
          />
          <button
            type="submit"
            className="ed-gemini-send-btn"
            disabled={!input.trim() || busy}
            aria-label="Send instruction to Gemini"
          >
            <ArrowUp size={16} />
          </button>
        </form>
        <p className="ed-gemini-disclaimer">
          Gemini Editorial Assistant · Verify facts and sources before publishing.
        </p>
      </footer>
    </div>
  );
}
