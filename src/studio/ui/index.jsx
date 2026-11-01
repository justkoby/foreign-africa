import React, {createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Search, X, XCircle} from 'lucide-react';
import './ui.css';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function Button({variant, size, icon: Icon, children, className, ...props}) {
  return <button type="button" {...props} className={cx('fa-btn', variant && `is-${variant}`, size && `is-${size}`, className)}>{Icon && <Icon aria-hidden="true"/>}{children}</button>;
}
export function IconButton({icon: Icon, label, outline, className, ...props}) {
  return <button type="button" aria-label={label} title={label} {...props} className={cx('fa-iconbtn', outline && 'is-outline', className)}><Icon aria-hidden="true"/></button>;
}

// Content status vocabulary shared by every listing, the dashboard and the editor.
export const statuses = {
  published: {label: 'Published', tone: 'success'}, draft: {label: 'Draft', tone: ''}, scheduled: {label: 'Scheduled', tone: 'info'},
  archived: {label: 'Archived', tone: 'outline'}, in_review: {label: 'In review', tone: 'violet'}, changes_requested: {label: 'Changes requested', tone: 'warning'},
  approved: {label: 'Approved', tone: 'success'}, rejected: {label: 'Rejected', tone: 'danger'},
  new: {label: 'New', tone: 'info'}, actioned: {label: 'Actioned', tone: 'success'}, active: {label: 'Active', tone: 'success'}, disabled: {label: 'Disabled', tone: 'danger'},
};
export function Chip({tone, dot, children, className}) { return <span className={cx('fa-chip', tone && `is-${tone}`, dot && 'has-dot', className)}>{children}</span>; }
export function StatusChip({status}) { const s = statuses[status] ?? {label: String(status).replaceAll('_', ' '), tone: ''}; return <Chip tone={s.tone} dot>{s.label}</Chip>; }

const palette = ['#0F2A4A', '#7A5C1E', '#0F766E', '#7C3AED', '#B4234F', '#2563EB', '#B45309', '#475467'];
export function Avatar({name = '?', size}) {
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
  const colour = palette[[...String(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
  return <span className={cx('fa-avatar', size && `is-${size}`)} style={{background: colour}} aria-hidden="true">{initials}</span>;
}

export const Card = ({children, className, pad, as: Tag = 'section', ...props}) => <Tag {...props} className={cx('fa-card', pad && 'fa-card-pad', className)}>{children}</Tag>;
export const CardHeader = ({title, subtitle, action}) => <div className="fa-card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="fa-card-action">{action}</div>}</div>;
export function KpiCard({label, value, note, icon: Icon, tone, href}) {
  const Tag = href ? 'a' : 'div';
  return <Tag className={cx('fa-card fa-kpi', tone && `is-${tone}`)} {...(href ? {href} : {})}><div className="fa-kpi-top"><span className="fa-kpi-label">{label}</span>{Icon && <span className="fa-kpi-icon"><Icon aria-hidden="true"/></span>}</div><div className="fa-kpi-value">{value}</div>{note && <div className="fa-kpi-note">{note}</div>}</Tag>;
}
export const PageHeader = ({title, subtitle, actions}) => <div className="fa-ph"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="fa-ph-actions">{actions}</div>}</div>;

export function SearchField({value, onChange, placeholder = 'Search', label = 'Search', ...props}) {
  return <label className="fa-search"><Search aria-hidden="true"/><span className="fa-sr">{label}</span><input type="search" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} {...props}/></label>;
}
export const Select = ({pill, className, children, ...props}) => <select {...props} className={cx('fa-select', pill && 'is-pill', className)}>{children}</select>;
export function Field({label, hint, error, children}) { return <label className="fa-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}{error && <span className="fa-err" role="alert">{error}</span>}</label>; }
export function Switch({checked, onChange, label, disabled}) { return <button type="button" role="switch" aria-checked={Boolean(checked)} aria-label={label} disabled={disabled} className="fa-switch" onClick={() => onChange(!checked)}/>; }

export function Tabs({tabs, value, onChange, label = 'Sections'}) {
  return <div className="fa-tabs" role="tablist" aria-label={label}>{tabs.map(tab => <button key={tab.id} type="button" role="tab" className="fa-tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}>{tab.icon && <tab.icon size={16} aria-hidden="true"/>}{tab.label}{tab.count != null && <span className="fa-count">{tab.count}</span>}</button>)}</div>;
}

export function Pagination({page, pageSize, total, onPage, onPageSize, sizes = [10, 20, 50]}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const window = [];
  for (let n = 1; n <= pages; n += 1) if (n === 1 || n === pages || Math.abs(n - page) <= 1) window.push(n); else if (window[window.length - 1] !== '…') window.push('…');
  return <div className="fa-pager">
    {onPageSize && <label>Rows per page<select className="fa-select is-pill" value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>{sizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>}
    <span>{total ? `${from}–${to} of ${total}` : 'No results'}</span>
    <div className="fa-pages" role="navigation" aria-label="Pages"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16}/></button>
      {window.map((n, i) => n === '…' ? <span key={`gap${i}`} aria-hidden="true">…</span> : <button key={n} type="button" aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>)}
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={16}/></button></div>
  </div>;
}

export const EmptyState = ({icon: Icon = Inbox, title, children, action}) => <div className="fa-empty"><span className="fa-empty-icon"><Icon aria-hidden="true"/></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
export const Skeleton = ({width = '100%', height = 14, style}) => <span className="fa-skel" aria-hidden="true" style={{width, height, ...style}}/>;
export const Notice = ({tone = 'info', title, children, icon}) => { const Icon = icon ?? (tone === 'danger' ? XCircle : tone === 'success' ? CheckCircle2 : AlertTriangle); return <div className={cx('fa-notice', `is-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}><Icon aria-hidden="true"/><div>{title && <strong>{title}</strong>}{children}</div></div>; };

// A dropdown that closes on outside click and Escape, and whose items are real buttons or links.
export function Menu({trigger, children, align = 'right', label}) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    const key = event => { if (event.key === 'Escape') { setOpen(false); box.current?.querySelector('[aria-haspopup]')?.focus(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);
  return <div className="fa-menu-wrap" ref={box}>{trigger({open, toggle: () => setOpen(value => !value), props: {'aria-haspopup': 'menu', 'aria-expanded': open}})}
    {open && <div className={cx('fa-menu', align === 'left' && 'is-left')} role="menu" aria-label={label} onClick={() => setOpen(false)}>{children}</div>}</div>;
}
export const MenuItem = ({icon: Icon, danger, children, ...props}) => { const Tag = props.href ? 'a' : 'button'; return <Tag role="menuitem" type={props.href ? undefined : 'button'} {...props} className={cx('fa-menu-item', danger && 'is-danger')}>{Icon && <Icon aria-hidden="true"/>}{children}</Tag>; };
export const MenuSeparator = () => <div className="fa-menu-sep" role="separator"/>;
export const MenuHeading = ({children}) => <div className="fa-menu-head">{children}</div>;

// ---- modal, confirmation, toasts
export function Modal({title, onClose, children, icon: Icon}) {
  const id = useId();
  const box = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    box.current?.querySelector('button.is-primary, button.is-danger-solid, input, button')?.focus();
    const key = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onClose]);
  return <div className="fa-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="fa-modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={box}>{Icon && <span className="fa-modal-icon"><Icon aria-hidden="true"/></span>}<h2 id={id}>{title}</h2>{children}</div></div>;
}
const FeedbackContext = createContext(null);
export function FeedbackProvider({children}) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const dismiss = useCallback(id => setToasts(list => list.filter(item => item.id !== id)), []);
  const toast = useCallback((message, tone = 'success') => {
    const id = `${Date.now()}${Math.random()}`;
    setToasts(list => [...list.slice(-3), {id, message, tone}]);
    setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
  }, [dismiss]);
  const confirm = useCallback(options => new Promise(resolve => setDialog({...options, resolve})), []);
  const api = useMemo(() => ({toast, confirm}), [toast, confirm]);
  const close = answer => { dialog.resolve(answer); setDialog(null); };
  return <FeedbackContext.Provider value={api}>{children}
    <div className="fa-toasts" aria-live="polite">{toasts.map(item => <div key={item.id} className={cx('fa-toast', `is-${item.tone}`)} role={item.tone === 'error' ? 'alert' : 'status'}>{item.tone === 'error' ? <XCircle/> : <CheckCircle2/>}<span>{item.message}</span><button type="button" aria-label="Dismiss" onClick={() => dismiss(item.id)}><X size={16}/></button></div>)}</div>
    {dialog && <Modal title={dialog.title} icon={dialog.danger ? AlertTriangle : undefined} onClose={() => close(false)}>{dialog.message && <p>{dialog.message}</p>}<div className="fa-modal-actions"><Button onClick={() => close(false)}>{dialog.cancel ?? 'Cancel'}</Button><Button variant={dialog.danger ? 'danger-solid' : 'primary'} onClick={() => close(true)}>{dialog.confirm ?? 'Confirm'}</Button></div></Modal>}
  </FeedbackContext.Provider>;
}
export const useFeedback = () => useContext(FeedbackContext) ?? {toast: () => {}, confirm: async () => window.confirm('Continue?')};

export const initials = name => String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
// Readable dates for people: "1 Nov 2026" and a relative hint such as "2 days ago".
export const fmtDate = value => (value ? new Date(value).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '');
export const fmtDateTime = value => (value ? new Date(value).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '');
export function ago(value, now = Date.now()) {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 0) { const days = Math.ceil(-seconds / 86400); return days <= 1 ? 'tomorrow' : `in ${days} days`; }
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  const days = Math.floor(seconds / 86400);
  return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : fmtDate(value);
}
