import { useEffect, useState } from 'react';
import { academicApi } from '../lib/api';

export default function SubjectPicker({ subjects, value, onChange, detectedName = '', detectedCode = '', disabled = false, onCreated }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(detectedName);
  const [code, setCode] = useState(detectedCode);
  const [credits, setCredits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!creating) { setName(detectedName); setCode(detectedCode); }
  }, [detectedName, detectedCode, creating]);

  async function create(event) {
    event.preventDefault(); setError('');
    if (!name.trim() || !code.trim() || credits === '') { setError('Enter the subject name, code, and credits.'); return; }
    setBusy(true);
    try {
      const result = await academicApi.create('subjects', { name: name.trim(), code: code.trim(), credits: Number(credits) });
      const subject = result.record;
      onChange(String(subject._id || subject.id));
      await onCreated?.(subject);
      setCreating(false);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="subject-picker">
    <label>Subject<select value={creating ? '__create__' : value} disabled={disabled || busy} onChange={(event) => {
      if (event.target.value === '__create__') { setError(''); setCreating(true); }
      else { setCreating(false); onChange(event.target.value); }
    }}><option value="">Select a subject</option>{subjects.map((subject) => <option key={subject._id || subject.id} value={subject._id || subject.id}>{subject.name} ({subject.code})</option>)}<option value="__create__">Create a new subject…</option></select>
    </label>
    {(detectedName || detectedCode) && <small>Detected: {detectedName || 'unknown'}{detectedCode ? ` · ${detectedCode}` : ''}</small>}
    {creating && <form className="subject-picker__create" onSubmit={create}>
      <label>New subject name<input value={name} onChange={(event) => setName(event.target.value)} maxLength="100" required /></label>
      <label>Subject code<input value={code} onChange={(event) => setCode(event.target.value)} maxLength="30" required /></label>
      <label>Credits<input type="number" min="0" max="60" step="0.5" value={credits} onChange={(event) => setCredits(event.target.value)} required /></label>
      {error && <p className="field__error" role="alert">{error}</p>}
      <div className="subject-picker__actions"><button className="btn btn--ghost" type="button" disabled={busy} onClick={() => { setCreating(false); setError(''); }}>Cancel</button><button className="btn btn--primary" disabled={busy}>{busy ? 'Creating…' : 'Create and link subject'}</button></div>
    </form>}
  </div>;
}
