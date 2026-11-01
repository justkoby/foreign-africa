import React, {useState} from 'react';
import {Eye, EyeOff, LogIn} from 'lucide-react';
import {api} from './api.js';
import {Button, Field, Notice} from './ui/index.jsx';

// Same endpoint and same checks as before. Only the presentation changed.
export default function Login({onSuccess, notice}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const emailBad = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordBad = touched && !password;
  async function submit(event) {
    event.preventDefault();
    setTouched(true); setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) return;
    setBusy(true);
    try { const data = await api('/api/staff/login', {method: 'POST', body: {email, password}}); onSuccess(data.user); }
    catch (reason) { setError(reason.message); setBusy(false); }
  }
  return <main className="fa-app fa-login">
    <div className="fa-login-card">
      <div className="fa-login-brand"><img src="/images/logo-navy.svg" alt=""/><span><strong>Foreign Africa</strong><small>Content studio</small></span></div>
      <h1>Sign in</h1>
      <p className="fa-login-sub">Use your staff account to manage the website.</p>
      {notice && <Notice tone="warning">{notice}</Notice>}
      {error && <Notice tone="danger" title="Could not sign you in">{error}</Notice>}
      <form onSubmit={submit} noValidate>
        <Field label="Email address" error={emailBad ? 'Enter a valid email address.' : ''}><input className="fa-input" type="email" autoComplete="username" autoFocus value={email} aria-invalid={emailBad} onChange={event => setEmail(event.target.value)} placeholder="you@foreignafrica.org"/></Field>
        <Field label="Password" error={passwordBad ? 'Enter your password.' : ''}><span className="fa-pw"><input className="fa-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} aria-invalid={passwordBad} onChange={event => setPassword(event.target.value)}/><button type="button" className="fa-iconbtn" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(value => !value)}>{show ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}</button></span></Field>
        <Button type="submit" variant="primary" icon={LogIn} disabled={busy} className="fa-login-submit">{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      <p className="fa-login-foot">Staff accounts only. If you cannot sign in, ask an administrator to check your account.</p>
    </div>
  </main>;
}
