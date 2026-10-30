import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './Loaders';
import SubjectPicker from './SubjectPicker';
import { documentImportApi, academicApi } from '../lib/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FILE_ACCEPT = '.pdf,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,text/csv,text/plain,image/*';
const normalize = (value) => String(value || '').trim().toLowerCase();

function findSubject(row, subjects) {
  const code = normalize(row.subjectCode);
  const name = normalize(row.subjectName);
  const matches = subjects.filter((subject) => (code && normalize(subject.code) === code) || (name && normalize(subject.name) === name));
  return matches.length === 1 ? String(matches[0]._id || matches[0].id) : '';
}

export default function TimetableImport({ subjects, onImported }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [method, setMethod] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function preview(event) {
    event.preventDefault();
    if (!file) { setError('Choose a timetable file first.'); return; }
    if (file.size > 12 * 1024 * 1024) { setError('Files must be 12 MB or smaller.'); return; }
    setError(''); setNotice(''); setRows([]); setParsing(true);
    try {
      const result = await documentImportApi.previewTimetable(file);
      setMethod(result.extraction?.method || 'text extraction');
      const extractedRows = result.rows || [];
      const sections = [...new Set(extractedRows.map((row) => row.section).filter(Boolean))];
      setSelectedSection(sections.length > 1 ? sections[0] : '');
      setRows(extractedRows.map((row, index) => ({ ...row, key: `${Date.now()}-${index}`, subjectId: findSubject(row, subjects), saved: false })));
      setNotice(result.message || 'Review every row before saving.');
    } catch (err) { setError(err.message); }
    finally { setParsing(false); }
  }

  function changeRow(key, field, value) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, [field]: value };
      const issues = [];
      const selected = subjects.find((subject) => String(subject._id || subject.id) === String(next.subjectId));
      if (!next.subjectName.trim() && !selected) issues.push('Subject is required.');
      if (next.weekday === null || next.weekday === '') issues.push('Choose a weekday.');
      if (!next.startTime || !next.endTime || next.startTime >= next.endTime) issues.push('Use a valid time range.');
      return { ...next, issues };
    }));
  }

  function removeRow(key) { setRows((current) => current.filter((row) => row.key !== key)); }

  function addRow() {
    setRows((current) => [...current, { key: `manual-${Date.now()}`, subjectName: '', subjectCode: '', subjectId: '', weekday: null, startTime: '', endTime: '', location: '', teacher: '', sessionType: '', section: selectedSection, sourceLine: 'manual', issues: ['Complete this entry before saving.'], saved: false }]);
  }

  async function confirmSave() {
    const pending = visibleRows.filter((row) => !row.saved);
    if (!pending.length) return;
    const invalid = pending.find((row) => row.issues.length || !row.subjectId);
    if (invalid) {
      setError(!invalid.subjectId ? `Select a subject for “${invalid.subjectName || 'unnamed row'}” before saving.` : `Correct row ${invalid.sourceLine} before saving.`);
      return;
    }
    setSaving(true); setError(''); setNotice('');
    let count = 0; const failures = [];
    for (const row of pending) {
      try {
        await academicApi.create('timetable', { subject: row.subjectId, weekday: Number(row.weekday), startTime: row.startTime, endTime: row.endTime, location: row.location || '', teacher: row.teacher || '', sessionType: row.sessionType || '' });
        setRows((current) => current.map((item) => item.key === row.key ? { ...item, saved: true } : item));
        count += 1;
      } catch (err) { failures.push(`Row ${row.sourceLine}: ${err.message}`); }
    }
    await onImported();
    if (failures.length) {
      setError(`${count} row(s) saved. ${failures.join(' ')}`);
      setNotice('You can correct or retry the rows that did not save. Already-saved rows will not be submitted again.');
    } else {
      setNotice(`${count} timetable row(s) saved and linked to their subjects.`);
    }
    setSaving(false);
  }

  const breakPeriods = rows.filter((row) => row.isBreakPeriod);
  const visibleRows = rows.filter((row) => !row.isBreakPeriod && (!selectedSection || !row.section || row.section === selectedSection));
  const pendingRows = visibleRows.filter((row) => !row.saved);
  const sections = [...new Set(rows.map((row) => row.section).filter(Boolean))];
  return <section className="timetable-import card" aria-labelledby="timetable-import-title">
    <div className="timetable-import__heading"><div><h2 id="timetable-import-title">Import a timetable</h2><p>Upload a searchable PDF, timetable photo, CSV, TSV, or text file. Check and correct the preview before anything is saved.</p></div></div>
    <form className="timetable-import__upload" onSubmit={preview}>
      <label className="field">Choose a timetable file
        <input type="file" accept={FILE_ACCEPT} capture="environment" onChange={(event) => { setFile(event.target.files?.[0] || null); setRows([]); setError(''); setNotice(''); }} />
      </label>
      <p className="upload-hint">Maximum 12 MB. Images are processed with local, offline OCR; no paid vision API is used. On supported phones, the file chooser may offer camera or gallery options. Uploaded documents are not stored.</p>
      <button className="btn btn--primary" disabled={parsing || !file}>{parsing && <Spinner label="Extracting" />}{parsing ? 'Extracting timetable…' : 'Extract preview'}</button>
    </form>
    {error && <div className="alert" role="alert">{error}</div>}
    {error && !rows.length && <button type="button" className="btn btn--ghost" onClick={() => { setError(''); setNotice('Add the classes you can read, correct each field, then confirm to save.'); setMethod('Manual entry'); addRow(); }}>Start manual timetable preview</button>}
    {notice && <p className="import-notice" role="status">{notice}{method ? ` · Extraction: ${method}` : ''}</p>}
    {rows.length > 0 && <>
      <div className="import-preview-heading"><h3>Review extracted rows</h3><p>Confirm the subject, weekday, and times for each class. Uncertain rows are called out for review.</p></div>
      {breakPeriods.length > 0 && <div className="import-notice"><strong>Non-class periods detected:</strong> {breakPeriods.map((row) => `${DAYS[row.weekday] || 'Unknown day'} ${row.startTime || 'time unclear'}–${row.endTime || 'time unclear'} ${row.subjectName}`).join('; ')}. These will not be saved as classes.</div>}
      {sections.length > 1 && <label className="field">Timetable section<select value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)}><option value="">All sections</option>{sections.map((section) => <option key={section} value={section}>{section}</option>)}</select><small>Choose a section to import only its entries, or keep all sections selected.</small></label>}
      {!subjects.length && <p className="academic-note">Create subjects first in <Link to="/subjects">Subject management</Link>, then select them here.</p>}
      <div className="import-rows">{visibleRows.map((row) => <article className={`import-row card${row.issues.length ? ' import-row--needs-review' : ''}${row.saved ? ' import-row--saved' : ''}`} key={row.key}>
        <div className="import-row__meta"><strong>{row.sourceLine === 'manual' ? 'Added entry' : `Extracted row ${row.sourceLine}`}</strong><span>{row.saved ? 'Saved' : row.issues.length ? 'Needs review' : 'Review before saving'}</span>{!row.saved && <button type="button" className="btn btn--ghost import-row__remove" onClick={() => removeRow(row.key)} disabled={saving}>Remove row</button>}</div>
        <SubjectPicker subjects={subjects} value={row.subjectId} detectedName={row.subjectName} detectedCode={row.subjectCode} disabled={saving || row.saved} onChange={(value) => changeRow(row.key, 'subjectId', value)} onCreated={onImported} />
        <label>Weekday<select value={row.weekday ?? ''} onChange={(event) => changeRow(row.key, 'weekday', event.target.value === '' ? null : Number(event.target.value))} disabled={saving || row.saved}><option value="">Choose day</option>{DAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
        <label>Start<input type="time" value={row.startTime || ''} onChange={(event) => changeRow(row.key, 'startTime', event.target.value)} disabled={saving || row.saved} /></label>
        <label>End<input type="time" value={row.endTime || ''} onChange={(event) => changeRow(row.key, 'endTime', event.target.value)} disabled={saving || row.saved} /></label>
        <label>Faculty / instructor<input value={row.teacher || ''} onChange={(event) => changeRow(row.key, 'teacher', event.target.value)} disabled={saving || row.saved} /></label>
        <label>Classroom / location<input value={row.location || ''} onChange={(event) => changeRow(row.key, 'location', event.target.value)} disabled={saving || row.saved} /></label>
        <label>Session type<select value={row.sessionType || ''} onChange={(event) => changeRow(row.key, 'sessionType', event.target.value)} disabled={saving || row.saved}><option value="">Unspecified</option>{['lecture', 'lab', 'practical', 'tutorial', 'other'].map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
        {row.issues.length > 0 && !row.saved && <p className="field__error import-row__issues">Review: {row.issues.join(' ')}</p>}
      </article>)}</div>
      <div className="import-confirm-actions"><button type="button" className="btn btn--ghost" onClick={addRow} disabled={saving}>Add missed class</button><button className="btn btn--primary" onClick={confirmSave} disabled={saving || !pendingRows.length || !subjects.length}>{saving && <Spinner label="Saving imported rows" />}{saving ? 'Saving confirmed rows…' : `Confirm and save ${pendingRows.length} row(s)`}</button><button type="button" className="btn btn--ghost" onClick={() => { setRows([]); setMethod(''); setNotice(''); setError(''); }} disabled={saving}>Discard preview</button></div>
    </>}
    <details className="import-format-help"><summary>CSV format help</summary><p>Use a header row such as <code>subject,code,day,start,end,location</code>. Example: <code>Mathematics,MATH101,Monday,09:00,10:00,Room 4</code>. You can still edit every extracted value before saving.</p></details>
  </section>;
}
