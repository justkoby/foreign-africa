import React, {useCallback, useEffect, useState} from 'react';
import {CheckCircle2, FileText, Pencil, Plus, Trash2} from 'lucide-react';
import {allows} from '../../server/permissions.js';
import {api} from './api.js';
import {Button, Card, Chip, EmptyState, Notice, PageHeader, Skeleton, StatusChip, useFeedback} from './ui/index.jsx';

const blankField = () => ({
  id: '',
  name: '',
  label: '',
  type: 'text',
  required: false,
  maxLength: 240,
});

export default function FormsManager({user}) {
  const {toast} = useFeedback();
  const [forms, setForms] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const canPublish = allows(user.roles, 'content.publish');

  const load = useCallback(() => {
    return api('/api/staff/forms')
      .then(data => {
        setForms(data.forms ?? []);
        setError('');
      })
      .catch(reason => setError(reason.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStatus(form) {
    if (!canPublish) return;
    const nextStatus = form.status === 'published' ? 'draft' : 'published';
    setBusy(true);
    try {
      await api(`/api/staff/forms/${encodeURIComponent(form.formKey)}`, {
        method: 'PATCH',
        body: {...form, status: nextStatus},
      });
      toast(nextStatus === 'published' ? `"${form.title}" published.` : `"${form.title}" moved to draft.`);
      await load();
    } catch (reason) {
      toast(reason.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const payload = {
        ...editing,
        fields: (editing.fields ?? []).map(f => ({
          ...f,
          id: f.id || f.name,
          name: f.name || f.id,
        })),
      };
      if (editing.dbId) {
        await api(`/api/staff/forms/${encodeURIComponent(editing.formKey)}`, {method: 'PATCH', body: payload});
      } else {
        await api('/api/staff/forms', {method: 'POST', body: payload});
      }
      toast('Form saved to database.');
      setEditing(null);
      await load();
    } catch (reason) {
      toast(reason.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return <div className="fa-page">
    <PageHeader
      title="Form definitions"
      subtitle="Database-backed registration and enquiry forms. Published forms can be attached to Events or public pages."
      actions={
        <div style={{display: 'flex', gap: 10}}>
          <Button variant="secondary" onClick={() => { window.location.hash = '#/events'; }}>Events</Button>
          <Button variant="secondary" onClick={() => { window.location.hash = '#/submissions'; }}>View submissions</Button>
          {canPublish && !editing && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setEditing({
                formKey: '',
                purpose: 'event_registration',
                title: 'New Event Registration Form',
                description: 'Register to attend this Foreign Africa event.',
                successMessage: 'Thank you for registering. Foreign Africa has received your registration details.',
                consentLabel: 'I agree that Foreign Africa may process these details to manage event attendance and send joining instructions.',
                status: 'published',
                fields: [
                  {id: 'full_name', name: 'full_name', label: 'Full name', type: 'text', required: true, maxLength: 160},
                  {id: 'email', name: 'email', label: 'Email address', type: 'email', required: true, maxLength: 160},
                  {id: 'organisation', name: 'organisation', label: 'Organisation or affiliation', type: 'text', required: false, maxLength: 180},
                  {id: 'role', name: 'role', label: 'Role or title', type: 'text', required: false, maxLength: 160},
                ],
              })}
            >
              New form
            </Button>
          )}
        </div>
      }
    />

    {error && <Notice tone="danger" title="Could not load forms">{error}</Notice>}

    {editing && (
      <Card style={{padding: 22, marginBottom: 20}}>
        <form onSubmit={saveForm} style={{display: 'grid', gap: 16}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{margin: 0}}>{editing.dbId ? `Edit form: ${editing.title}` : 'Create new form'}</h3>
            <div style={{display: 'flex', gap: 8}}>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={busy}>Save form</Button>
            </div>
          </div>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12}}>
            <label className="fa-field">
              <span className="fa-label">Form title *</span>
              <input
                className="fa-input"
                required
                value={editing.title || ''}
                onChange={e => setEditing(c => ({...c, title: e.target.value}))}
              />
            </label>
            <label className="fa-field">
              <span className="fa-label">Form key (ID) *</span>
              <input
                className="fa-input"
                required
                disabled={Boolean(editing.dbId)}
                value={editing.formKey || ''}
                onChange={e => setEditing(c => ({...c, formKey: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_')}))}
                placeholder="e.g. event_registration_ada"
              />
            </label>
            <label className="fa-field">
              <span className="fa-label">Status</span>
              <select
                className="fa-select"
                value={editing.status || 'published'}
                onChange={e => setEditing(c => ({...c, status: e.target.value}))}
              >
                <option value="published">Published (Active)</option>
                <option value="draft">Draft (Disabled)</option>
              </select>
            </label>
          </div>

          <label className="fa-field">
            <span className="fa-label">Introduction text</span>
            <input
              className="fa-input"
              value={editing.description || ''}
              onChange={e => setEditing(c => ({...c, description: e.target.value}))}
            />
          </label>

          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12}}>
            <label className="fa-field">
              <span className="fa-label">Confirmation message</span>
              <input
                className="fa-input"
                value={editing.successMessage || ''}
                onChange={e => setEditing(c => ({...c, successMessage: e.target.value}))}
              />
            </label>
            <label className="fa-field">
              <span className="fa-label">Consent label</span>
              <input
                className="fa-input"
                value={editing.consentLabel || ''}
                onChange={e => setEditing(c => ({...c, consentLabel: e.target.value}))}
              />
            </label>
          </div>

          <div style={{display: 'grid', gap: 10}}>
            <strong>Form fields</strong>
            {(editing.fields ?? []).map((f, idx) => (
              <div key={idx} style={{display: 'grid', gridTemplateColumns: '1fr 1fr 130px auto auto', gap: 8, alignItems: 'center'}}>
                <input
                  className="fa-input"
                  placeholder="Field label *"
                  required
                  value={f.label || ''}
                  onChange={e => {
                    const next = [...editing.fields];
                    const label = e.target.value;
                    const autoKey = !next[idx].id ? label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : next[idx].id;
                    next[idx] = {...next[idx], label, id: autoKey, name: autoKey};
                    setEditing(c => ({...c, fields: next}));
                  }}
                />
                <input
                  className="fa-input"
                  placeholder="Field key (e.g. full_name) *"
                  required
                  value={f.id || f.name || ''}
                  onChange={e => {
                    const next = [...editing.fields];
                    const key = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_');
                    next[idx] = {...next[idx], id: key, name: key};
                    setEditing(c => ({...c, fields: next}));
                  }}
                />
                <select
                  className="fa-select"
                  value={f.type || 'text'}
                  onChange={e => {
                    const next = [...editing.fields];
                    next[idx] = {...next[idx], type: e.target.value};
                    setEditing(c => ({...c, fields: next}));
                  }}
                >
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="tel">Phone</option>
                  <option value="url">URL</option>
                  <option value="textarea">Long text</option>
                </select>
                <label style={{display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13}}>
                  <input
                    type="checkbox"
                    checked={Boolean(f.required)}
                    onChange={e => {
                      const next = [...editing.fields];
                      next[idx] = {...next[idx], required: e.target.checked};
                      setEditing(c => ({...c, fields: next}));
                    }}
                  />
                  Required
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setEditing(c => ({...c, fields: c.fields.filter((_, i) => i !== idx)}))}
                />
              </div>
            ))}
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Plus}
                onClick={() => setEditing(c => ({...c, fields: [...(c.fields ?? []), blankField()]}))}
              >
                Add field
              </Button>
            </div>
          </div>
        </form>
      </Card>
    )}

    <Card>
      <div className="fa-tablewrap">
        <table className="fa-table">
          <thead>
            <tr>
              <th>Form</th>
              <th>Key</th>
              <th>Fields</th>
              <th>Status</th>
              <th className="is-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!forms && !error && [0, 1, 2].map(r => (
              <tr key={r}>
                <td><Skeleton width={180} height={14}/></td>
                <td><Skeleton width={120} height={14}/></td>
                <td><Skeleton width={160} height={14}/></td>
                <td><Skeleton width={80} height={22}/></td>
                <td/>
              </tr>
            ))}
            {(forms ?? []).map(f => (
              <tr key={f.formKey}>
                <td>
                  <div className="fa-title-text">
                    <strong>{f.title}</strong>
                    <small>{f.description}</small>
                  </div>
                </td>
                <td><code>{f.formKey}</code></td>
                <td>
                  <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                    {(f.fields ?? []).map(field => (
                      <Chip key={field.id || field.name} tone="outline">
                        {field.label}{field.required ? ' *' : ''}
                      </Chip>
                    ))}
                  </div>
                </td>
                <td><StatusChip status={f.status}/></td>
                <td className="is-actions">
                  <div style={{display: 'flex', gap: 6, justifyContent: 'flex-end'}}>
                    {canPublish && (
                      <>
                        <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(f)}>Edit</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleStatus(f)}>
                          {f.status === 'published' ? 'Unpublish' : 'Publish'}
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {forms && !forms.length && (
          <EmptyState icon={FileText} title="No forms defined">
            Create a registration or enquiry form to collect submissions in the database.
          </EmptyState>
        )}
      </div>
    </Card>
  </div>;
}
