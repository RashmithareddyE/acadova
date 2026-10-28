import { useState } from 'react';
import { academicApi, documentImportApi } from '../lib/api';
import { Spinner } from './Loaders';
import SubjectPicker from './SubjectPicker';

const ACCEPT = '.pdf,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,text/csv,text/plain,image/*';
const norm = (value) => String(value || '').trim().toLowerCase();

function subjectMatch(item, subjects) {
  const matches = subjects.filter((subject) => (item.subjectCode && norm(subject.code) === norm(item.subjectCode)) || (item.subjectName && norm(subject.name) === norm(item.subjectName)));
  return matches.length === 1 ? String(matches[0]._id || matches[0].id) : '';
}

export default function AcademicImport({ kind, subjects, records = [], onImported }) {
  const syllabus = kind === 'syllabus';
  const calendar = kind === 'calendar';
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [subjectInfo, setSubjectInfo] = useState({ name: '', code: '' });
  const [method, setMethod] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = calendar ? 'Import academic calendar' : syllabus ? 'Import syllabus' : 'Import exam schedule';

  async function preview(event) {
    event.preventDefault();
    if (!file) { setError(`Choose a ${calendar ? 'calendar' : syllabus ? 'syllabus' : 'schedule'} file first.`); return; }
    if (file.size > 12 * 1024 * 1024) { setError('Files must be 12 MB or smaller.'); return; }
    setBusy(true); setError(''); setNotice(''); setRows([]);
    try {
      const result = await documentImportApi.preview(kind, file);
      setMethod(result.extraction?.method || 'text extraction');
      if (syllabus) {
        setSubjectInfo({ name: result.subjectName || '', code: result.subjectCode || '' });
        setRows((result.topics || []).map((row, index) => ({ ...row, key: `${Date.now()}-${index}`, subjectId: subjectMatch(result, subjects), saved: false })));
      } else setRows((result.rows || []).map((row, index) => ({ ...row, key: `${Date.now()}-${index}`, subjectId: calendar ? '' : subjectMatch(row, subjects), saved: false })));
      setNotice(result.message || 'Review and correct every entry before confirming.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function change(key, field, value) { setRows((all) => all.map((row) => row.key === key ? { ...row, [field]: value } : row)); }

  function isDuplicate(row) {
    return records.some((record) => {
      if (calendar) return norm(record.title) === norm(row.title) && String(record.date || '').slice(0, 10) === row.date;
      const subject = String(record.subject?._id || record.subject || '');
      if (subject !== String(row.subjectId)) return false;
      if (syllabus) return norm(record.unit) === norm(`${row.unit}${row.unitTitle ? `: ${row.unitTitle}` : ''}`) && norm(record.topic) === norm(row.topic);
      return norm(record.title) === norm(row.title) && String(record.date || '').slice(0, 10) === row.date;
    });
  }

  function addRow() {
    const key = `${Date.now()}-${Math.random()}`;
    const row = calendar
      ? { key, title: '', type: 'event', date: '', endDate: '', description: '', issues: [], saved: false }
      : syllabus
        ? { key, unit: 'Unit 1', unitTitle: '', topic: '', issues: [], subjectId: '', saved: false }
        : { key, title: 'Exam', type: 'other', subjectName: '', subjectCode: '', date: '', startTime: '', endTime: '', venue: '', notes: '', issues: [], subjectId: '', saved: false };
    setRows((all) => [...all, row]);
  }

  async function save() {
    const pending = rows.filter((row) => !row.saved);
    const invalid = pending.find((row) => {
      if (calendar) return !row.title?.trim() || !row.date || (row.endDate && row.endDate < row.date);
      if (!row.subjectId) return true;
      if (syllabus) return !row.unit?.trim() || !row.topic?.trim();
      return !row.title?.trim() || !row.date || (Boolean(row.startTime) !== Boolean(row.endTime)) || (row.startTime && row.endTime && row.startTime >= row.endTime);
    });
    if (invalid) {
      setError(calendar ? 'Enter an event title and valid date range.' : !invalid.subjectId ? `Select or create a subject for ${invalid.subjectName || subjectInfo.name || 'this entry'}.` : 'Complete the required fields and correct invalid dates or times.');
      return;
    }
    setBusy(true); setError(''); let saved = 0; const failures = [];
    for (const row of pending) {
      try {
        if (calendar) await academicApi.create('calendar', { title: row.title.trim(), type: row.type || 'event', date: row.date, endDate: row.endDate || null, description: row.description || '' });
        else if (syllabus) await academicApi.create('syllabus', { subject: row.subjectId, unit: `${row.unit}${row.unitTitle ? `: ${row.unitTitle}` : ''}`, topic: row.topic });
        else await academicApi.create('exams', { subject: row.subjectId, title: row.title, type: row.type, date: row.date, startTime: row.startTime || '', endTime: row.endTime || '', venue: row.venue || '', notes: row.notes || '' });
        setRows((all) => all.map((item) => item.key === row.key ? { ...item, saved: true } : item)); saved += 1;
      } catch (err) { failures.push(`${row.sourceLine ? `Line ${row.sourceLine}: ` : ''}${err.message}`); }
    }
    await onImported(); setBusy(false);
    if (failures.length) setError(`${saved} saved. ${failures.join(' ')}`);
    else setNotice(`${saved} ${calendar ? 'event(s)' : syllabus ? 'topic(s)' : 'exam(s)'} saved${calendar ? '.' : ' and linked to subjects.'}`);
  }

  return <section className="timetable-import card" aria-label={title}>
    <div className="timetable-import__heading"><div><h2>{title}</h2><p>{calendar ? 'Extract holidays, deadlines, semester dates, and academic events.' : syllabus ? 'Extract unit headings and topic text.' : 'Extract examination titles, subjects, dates, times, and venues.'} Upload a searchable PDF, image, CSV, TSV, or text file. Scanned PDFs without selectable text are not supported yet.</p></div></div>
    <form className="timetable-import__upload" onSubmit={preview}><label className="field">Choose a document<input type="file" accept={ACCEPT} capture="environment" onChange={(event) => { setFile(event.target.files?.[0] || null); setRows([]); setError(''); setNotice(''); }} /></label><p className="upload-hint">Maximum 12 MB. Images are processed temporarily; documents are not stored.</p><button className="btn btn--primary" disabled={busy || !file}>{busy && <Spinner label="Extracting" />}Extract preview</button></form>
    {error && <div className="alert" role="alert">{error}</div>}{notice && <p className="import-notice" role="status">{notice}{method ? ` · Extraction: ${method}` : ''}</p>}
    {!!rows.length && <>
      {!calendar && !subjects.length && <p className="academic-note">Create or match a subject below. Subject details are saved only when you explicitly create one.</p>}
      {syllabus && <p className="import-notice">Detected subject: {subjectInfo.name || 'not identified'} {subjectInfo.code && `(${subjectInfo.code})`}. Verify each topic before confirming.</p>}
      <div className="import-preview-heading"><h3>Review extracted {calendar ? 'events' : syllabus ? 'topics' : 'exams'}</h3><p>Correct uncertain values, remove unwanted rows, and confirm only the entries you want to save.</p></div>
      <div className="import-rows">{rows.map((row, index) => <article className={`import-row card${row.saved ? ' import-row--saved' : ''}`} key={row.key}>
        <div className="import-row__meta"><strong>{calendar ? `Event ${row.sourceLine || index + 1}` : syllabus ? `Topic ${index + 1}` : `Exam ${row.sourceLine || index + 1}`}</strong><span>{row.saved ? 'Saved' : 'Review before saving'}</span>{!row.saved && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRows((all) => all.filter((item) => item.key !== row.key))}>Remove</button>}</div>
        {!calendar && <SubjectPicker subjects={subjects} value={row.subjectId} detectedName={row.subjectName || subjectInfo.name} detectedCode={row.subjectCode || subjectInfo.code} disabled={busy || row.saved} onChange={(value) => change(row.key, 'subjectId', value)} onCreated={onImported} />}
        {calendar ? <><label>Event title<input value={row.title || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'title', event.target.value)} /></label><label>Type<select value={row.type || 'event'} disabled={busy || row.saved} onChange={(event) => change(row.key, 'type', event.target.value)}>{['event', 'holiday', 'deadline', 'college'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Start date<input type="date" value={row.date || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'date', event.target.value)} /></label><label>End date<input type="date" value={row.endDate || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'endDate', event.target.value)} /></label><label>Description<input value={row.description || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'description', event.target.value)} /></label></>
          : syllabus ? <><label>Unit<input value={row.unit || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'unit', event.target.value)} /></label><label>Unit title<input value={row.unitTitle || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'unitTitle', event.target.value)} /></label><label>Topic<input value={row.topic || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'topic', event.target.value)} /></label></>
            : <><label>Exam title<input value={row.title || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'title', event.target.value)} /></label><label>Type<select value={row.type || 'other'} disabled={busy || row.saved} onChange={(event) => change(row.key, 'type', event.target.value)}>{['midterm', 'final', 'quiz', 'practical', 'other'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Date<input type="date" value={row.date || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'date', event.target.value)} /></label><label>Start<input type="time" value={row.startTime || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'startTime', event.target.value)} /></label><label>End<input type="time" value={row.endTime || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'endTime', event.target.value)} /></label><label>Venue<input value={row.venue || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'venue', event.target.value)} /></label><label>Instructions / notes<input value={row.notes || ''} disabled={busy || row.saved} onChange={(event) => change(row.key, 'notes', event.target.value)} /></label></>}
        {!row.saved && isDuplicate(row) && <p className="field__error import-row__issues">This resembles an existing record. Remove it if it is a duplicate.</p>}
        {!row.saved && row.issues?.length > 0 && <p className="field__error import-row__issues">Review: {row.issues.join(' ')}</p>}
      </article>)}</div>
      <div className="import-confirm-actions"><button type="button" className="btn btn--ghost" onClick={addRow} disabled={busy}>Add {calendar ? 'event' : syllabus ? 'topic' : 'exam'}</button><button type="button" className="btn btn--primary" onClick={save} disabled={busy || rows.every((row) => row.saved)}>{busy && <Spinner label="Saving" />}Confirm and save {rows.filter((row) => !row.saved).length}</button><button type="button" className="btn btn--ghost" onClick={() => { setRows([]); setNotice(''); setError(''); }} disabled={busy}>Discard preview</button></div>
    </>}
  </section>;
}
