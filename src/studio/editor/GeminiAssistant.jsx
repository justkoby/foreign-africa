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
  ShieldCheck,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {api} from '../api.js';

export default function GeminiAssistant({
  editor,
  item,
  touch,
  addTag,
  onClose,
  isExpanded,
  onToggleExpand,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Read current selection from Tiptap
  const selection = editor ? editor.state.selection : null;
  const selectedText = selection && !selection.empty
    ? editor.state.doc.textBetween(selection.from, selection.to, ' ')
    : '';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, busy]);

  const runAction = async (action, customPrompt = '') => {
    if (busy) return;
    setError('');
    setBusy(true);

    const promptText = customPrompt || input.trim();
    if (customPrompt || input.trim()) setInput('');

    const userMessageId = `msg-${Date.now()}`;
    const userMsg = {
      id: userMessageId,
      role: 'user',
      action,
      text: promptText || getActionLabel(action),
      selectedSnippet: selectedText ? selectedText.slice(0, 150) : null,
      time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
    };

    setMessages(prev => [...prev, userMsg]);

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

      const assistantMsg = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        action,
        hadSelection: Boolean(selectedText),
        text: response.result,
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.message || 'Gemini could not process your request.');
    } finally {
      setBusy(false);
    }
  };

  const getActionLabel = action => {
    const labels = {
      improve: 'Improve writing',
      shorten: 'Shorten',
      expand: 'Expand',
      tone_institutional: 'Institutional tone',
      simplify: 'Simplify',
      rewrite: 'Rewrite',
      headlines: 'Suggest alternative headlines',
      excerpt: 'Generate summary / excerpt',
      seo: 'Suggest SEO title & description',
      tags: 'Suggest categories & tags',
      social: 'Create LinkedIn & social caption',
      grammar: 'Review grammar & readability',
      factcheck: 'Flag unverified claims',
      draft: 'Generate draft from title',
      custom: 'Custom query',
    };
    return labels[action] || action;
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInsert = text => {
    if (!editor) return;
    editor.chain().focus().insertContent(text).run();
  };

  const handleReplace = text => {
    if (!editor) return;
    editor.chain().focus().deleteSelection().insertContent(text).run();
  };

  const handleApplyExcerpt = text => {
    // Strip markdown quotes or headers
    const cleaned = text.replace(/^["']|["']$/g, '').trim().slice(0, 500);
    touch({summary: cleaned});
  };

  const handleApplyTitle = text => {
    const firstLine = text.split('\n')[0].replace(/^\d+[\.\)]\s*|^["']|["']$/g, '').trim();
    touch({title: firstLine});
  };

  const handleApplySeo = text => {
    const lines = text.split('\n').filter(Boolean);
    let title = '';
    let desc = '';
    for (const line of lines) {
      if (/title/i.test(line) && !title) title = line.replace(/^[^:]*:\s*/, '').replace(/^["']|["']$/g, '').trim();
      else if (/description|meta/i.test(line) && !desc) desc = line.replace(/^[^:]*:\s*/, '').replace(/^["']|["']$/g, '').trim();
    }
    if (title) touch({seoTitle: title.slice(0, 60)});
    if (desc) touch({seoDescription: desc.slice(0, 160)});
  };

  const handleAddTags = text => {
    const items = text.split(/[,;\n]/).map(t => t.replace(/^[-*•\d\.\s]+/, '').replace(/^["']|["']$/g, '').trim()).filter(Boolean);
    for (const tag of items) {
      if (tag.length <= 160) addTag(tag);
    }
  };

  return (
    <div className={`ed-gemini-panel ${isExpanded ? 'is-expanded' : ''}`} aria-label="Gemini Editorial Assistant">
      {/* Top Header */}
      <header className="ed-gemini-header">
        <div className="ed-gemini-brand">
          <span className="ed-gemini-sparkle">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Gemini</strong>
            <span className="ed-gemini-sub">Editorial Assistant</span>
          </div>
        </div>
        <div className="ed-gemini-controls">
          <button
            type="button"
            className="fa-iconbtn"
            title={isExpanded ? 'Collapse panel width' : 'Expand panel width'}
            aria-label={isExpanded ? 'Collapse panel width' : 'Expand panel width'}
            onClick={onToggleExpand}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="fa-iconbtn"
            title="Close Gemini"
            aria-label="Close Gemini"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Context indicator */}
      <div className="ed-gemini-context-banner">
        {selectedText ? (
          <div className="ed-gemini-context-tag is-selection" title={selectedText}>
            <span className="ed-gemini-dot" />
            <span>Working with <strong>selected text</strong> ({selectedText.slice(0, 45)}…)</span>
          </div>
        ) : (
          <div className="ed-gemini-context-tag">
            <FileText size={12} />
            <span>Context: <strong>{item.title || 'Entire article'}</strong></span>
          </div>
        )}
      </div>

      {/* Main chat & suggestions scroll area */}
      <div className="ed-gemini-body">
        {messages.length === 0 && (
          <div className="ed-gemini-welcome">
            <div className="ed-gemini-welcome-icon">
              <Sparkles size={28} />
            </div>
            <h3>How can Gemini assist your story?</h3>
            <p>
              Select text in the editor for instant rewrites, or choose a document-level action below.
            </p>
          </div>
        )}

        {/* Quick action chips */}
        <div className="ed-gemini-suggestions-wrap">
          <span className="ed-gemini-section-title">
            {selectedText ? 'Selection actions' : 'Suggested actions'}
          </span>
          <div className="ed-gemini-chips">
            {selectedText ? (
              <>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('improve')}>
                  ✨ Improve writing
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('shorten')}>
                  ✂️ Shorten
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('expand')}>
                  📖 Expand
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('tone_institutional')}>
                  🏛️ Institutional tone
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('simplify')}>
                  💡 Simplify
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('rewrite')}>
                  🔄 Rewrite
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('excerpt')}>
                  📝 Generate excerpt
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('headlines')}>
                  📰 Alternative headlines
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('seo')}>
                  🔍 Suggest SEO description
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('tags')}>
                  🏷️ Suggest tags & category
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('social')}>
                  📱 LinkedIn caption
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('grammar')}>
                  🔎 Review grammar & readability
                </button>
                <button type="button" className="ed-gemini-chip" onClick={() => runAction('factcheck')}>
                  🛡️ Flag unverified claims
                </button>
                {!item.title.trim() ? null : (
                  <button type="button" className="ed-gemini-chip" onClick={() => runAction('draft')}>
                    ✍️ Draft from title
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Message history */}
        <div className="ed-gemini-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`ed-gemini-msg is-${msg.role}`}>
              {msg.role === 'user' ? (
                <div className="ed-gemini-user-bubble">
                  <p>{msg.text}</p>
                  {msg.selectedSnippet && (
                    <blockquote className="ed-gemini-quote">
                      "{msg.selectedSnippet}…"
                    </blockquote>
                  )}
                  <span className="ed-gemini-time">{msg.time}</span>
                </div>
              ) : (
                <div className="ed-gemini-card">
                  <div className="ed-gemini-card-header">
                    <span className="ed-gemini-card-title">
                      <Sparkles size={14} /> {getActionLabel(msg.action)}
                    </span>
                    <span className="ed-gemini-time">{msg.time}</span>
                  </div>
                  <div className="ed-gemini-card-content">
                    <pre className="ed-gemini-pre">{msg.text}</pre>
                  </div>
                  <div className="ed-gemini-card-actions">
                    {msg.hadSelection && (
                      <button
                        type="button"
                        className="ed-gemini-btn is-primary"
                        onClick={() => handleReplace(msg.text)}
                        title="Replace current selection in editor"
                      >
                        <Replace size={13} /> Replace selection
                      </button>
                    )}
                    <button
                      type="button"
                      className="ed-gemini-btn is-secondary"
                      onClick={() => handleInsert(msg.text)}
                      title="Insert at cursor in editor"
                    >
                      <Plus size={13} /> Insert into article
                    </button>
                    {msg.action === 'excerpt' && (
                      <button
                        type="button"
                        className="ed-gemini-btn"
                        onClick={() => handleApplyExcerpt(msg.text)}
                        title="Apply as article excerpt"
                      >
                        <FileText size={13} /> Apply as Excerpt
                      </button>
                    )}
                    {msg.action === 'headlines' && (
                      <button
                        type="button"
                        className="ed-gemini-btn"
                        onClick={() => handleApplyTitle(msg.text)}
                        title="Apply first headline as title"
                      >
                        Apply as Title
                      </button>
                    )}
                    {msg.action === 'seo' && (
                      <button
                        type="button"
                        className="ed-gemini-btn"
                        onClick={() => handleApplySeo(msg.text)}
                        title="Apply SEO metadata"
                      >
                        Apply SEO
                      </button>
                    )}
                    {msg.action === 'tags' && (
                      <button
                        type="button"
                        className="ed-gemini-btn"
                        onClick={() => handleAddTags(msg.text)}
                        title="Add these tags"
                      >
                        <Tag size={13} /> Add Tags
                      </button>
                    )}
                    <button
                      type="button"
                      className="ed-gemini-btn is-icon"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      title="Copy to clipboard"
                    >
                      {copiedId === msg.id ? <Check size={14} className="is-success" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="ed-gemini-msg is-assistant is-loading">
              <div className="ed-gemini-card is-pulse">
                <div className="ed-gemini-card-header">
                  <span className="ed-gemini-card-title">
                    <Loader2 size={14} className="fa-spin" /> Gemini is thinking…
                  </span>
                </div>
                <div className="ed-gemini-shimmer-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
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
      </div>

      {/* Bottom input bar */}
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
            placeholder={selectedText ? 'Ask Gemini about selected text…' : 'Ask Gemini anything about this story…'}
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
            aria-label="Send to Gemini"
          >
            <ArrowUp size={16} />
          </button>
        </form>
        <p className="ed-gemini-disclaimer">
          Gemini in Foreign Africa CMS · Verify important facts before publishing.
        </p>
      </footer>
    </div>
  );
}
