import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './Loaders';
import SubjectPicker from './SubjectPicker';
import { documentImportApi, academicApi } from '../lib/api';
import { TIMETABLE_CSV_COLUMNS, timetableRowsToCanonicalRows, timetableRowsToCsv } from '../lib/timetableCsv';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FILE_ACCEPT = '.pdf,.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,.xlsx,application/pdf,text/csv,text/plain,image/*,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const normalize = (value) => String(value || '').trim().toLowerCase();
const FIELD_ISSUES = new Set([
  'Subject is missing.',
  'Weekday is unclear.',
  'Start/end time is missing or invalid.',
  'Subject is required.',
  'Choose a weekday.',
  'Use a valid time range.',
  'Session type is not supported. Choose Lecture, Lab, Practical, Tutorial, or Other.',
]);

function findSubject(row, subjects) {
  const code = normalize(row.subjectCode);
  const name = normalize(row.subjectName);
  const matches = subjects.filter((subject) => (code && normalize(subject.code) === code) || (name && normalize(subject.name) === name));
  return matches.length === 1 ? String(matches[0]._id || matches[0].id) : '';
}

function validateRows(rows, subjects) {
  const issues = new Map(rows.map((row) => {
    const rowIssues = (row.issues || []).filter((issue) => (
      !FIELD_ISSUES.has(issue) && !/^Class time overlaps row |^Duplicate class row;/i.test(issue)
    ));
    const selected = subjects.find((subject) => String(subject._id || subject.id) === String(row.subjectId));
    if (!selected) rowIssues.push('Select a subject from your Acadova subjects.');
    if (row.weekday == null || row.weekday === '' || !Number.isInteger(Number(row.weekday)) || Number(row.weekday) < 0 || Number(row.weekday) > 6) rowIssues.push('Choose a weekday.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime || '')
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime || '')
      || row.startTime >= row.endTime) rowIssues.push('Enter valid 24-hour start and end times.');
    if (row.sessionType && !['lecture', 'lab', 'practical', 'tutorial', 'other'].includes(String(row.sessionType).toLowerCase())) {
      rowIssues.push('Choose a supported session type.');
    }
    return [row.key, rowIssues];
  }));
  const signatures = new Map();
  rows.forEach((row, index) => {
    if (issues.get(row.key).some((issue) => /subject|weekday|time/i.test(issue))) return;
    const subject = String(row.subjectId || row.subjectCode || row.subjectName).toLowerCase();
    const signature = [row.weekday, subject, row.startTime, row.endTime, row.section || ''].join('|');
    if (signatures.has(signature)) {
      issues.get(row.key).push(`Duplicate class row; it matches row ${signatures.get(signature)}.`);
    } else signatures.set(signature, row.sourceLine || index + 1);
  });
  rows.forEach((row, index) => {
    if (issues.get(row.key).some((issue) => /subject|weekday|time/i.test(issue))) return;
    rows.slice(0, index).forEach((other, otherIndex) => {
      if (row.weekday !== other.weekday) return;
      if (row.section && other.section && row.section !== other.section) return;
      const currentSubject = String(row.subjectId || row.subjectCode || row.subjectName).toLowerCase();
      const otherSubject = String(other.subjectId || other.subjectCode || other.subjectName).toLowerCase();
      const duplicate = row.startTime === other.startTime && row.endTime === other.endTime && currentSubject === otherSubject;
      if (!duplicate && row.startTime < other.endTime && other.startTime < row.endTime) {
        issues.get(row.key).push(`Class time overlaps row ${other.sourceLine || otherIndex + 1}.`);
        issues.get(other.key).push(`Class time overlaps row ${row.sourceLine || index + 1}.`);
      }
    });
  });
  return issues;
}

function getRowClassification(row, rowIssues) {
  const isInvalid = !row.subjectName
    || row.status === 'invalid'
    || row.weekday == null
    || row.weekday === ''
    || !Number.isInteger(Number(row.weekday))
    || Number(row.weekday) < 0
    || Number(row.weekday) > 6
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime || '')
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime || '')
    || row.startTime >= row.endTime
    || rowIssues.some((issue) => (
      issue === 'Subject is missing.'
      || issue === 'Subject is required.'
      || issue === 'Choose a weekday.'
      || issue === 'Enter valid 24-hour start and end times.'
      || issue === 'Start/end time is missing or invalid.'
      || issue.startsWith('Duplicate class row')
    ));
  if (isInvalid) return 'invalid';

  const isReview = (Number.isFinite(row.confidence) && row.confidence < 55)
    || row.status === 'needs-review'
    || !row.subjectId
    || rowIssues.length > 0;
  if (isReview) return 'needs-review';

  return 'valid';
}

export default function TimetableImport({ subjects, onImported }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [method, setMethod] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || !(/\.pdf$/i.test(file.name) || /^image\//.test(file.type))) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function preview(event) {
    event.preventDefault();
    if (!file) { setError('Choose a timetable file first.'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('Files must be 25 MB or smaller.'); return; }
    setError(''); setNotice(''); setRows([]); setWarnings([]); setParsing(true);
    try {
      const result = await documentImportApi.previewTimetable(file);
      setMethod(result.extraction?.method || 'text extraction');
      setWarnings(result.extraction?.warnings || []);
      const extractedRows = result.rows || [];
      const sections = [...new Set(extractedRows.map((row) => row.section).filter(Boolean))];
      setSelectedSection(sections.length > 1 ? sections[0] : '');
      setRows(extractedRows.map((row, index) => ({
        ...row,
        key: `${Date.now()}-${index}`,
        subjectId: findSubject(row, subjects),
        saved: false,
        rawText: row.rawText || row.originalText || row.subjectName,
        confidence: Number.isFinite(row.confidence) ? row.confidence : 100,
      })));
      setNotice(result.message || 'Review every row before saving.');
    } catch (err) { setError(err.message); }
    finally { setParsing(false); }
  }

  function changeRow(key, field, value) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, [field]: value };
      next.issues = (row.issues || []).filter((issue) => !FIELD_ISSUES.has(issue));
      if (field === 'subjectId') {
        const selected = subjects.find((subject) => String(subject._id || subject.id) === String(value));
        if (selected) {
          next.subjectName = selected.name;
          next.subjectCode = selected.code;
        }
      } else if (field === 'subjectName') {
        next.subjectId = '';
      }
      return next;
    }));
  }

  function removeRow(key) { setRows((current) => current.filter((row) => row.key !== key)); }

  function removeInvalidRows() {
    const issues = validateRows(rows.filter((r) => !r.isBreakPeriod && (!selectedSection || !r.section || r.section === selectedSection)), subjects);
    setRows((current) => current.filter((row) => {
      if (row.isBreakPeriod || (selectedSection && row.section && row.section !== selectedSection)) return true;
      const rowIssues = issues.get(row.key) || [];
      return getRowClassification(row, rowIssues) !== 'invalid';
    }));
  }

  function addRow() {
    setRows((current) => [...current, {
      key: `manual-${Date.now()}`,
      subjectName: '',
      subjectCode: '',
      subjectId: '',
      weekday: null,
      startTime: '',
      endTime: '',
      location: '',
      teacher: '',
      sessionType: '',
      section: selectedSection,
      sourceLine: 'manual',
      issues: [],
      saved: false,
      rawText: '',
      confidence: 100,
      status: 'invalid',
    }]);
  }

  async function confirmSave() {
    const pending = visibleRows.filter((row) => !row.saved);
    if (!pending.length) return;
    const validationIssues = validateRows(pending, subjects);
    const hasInvalid = pending.some((row) => getRowClassification(row, validationIssues.get(row.key) || []) === 'invalid');
    if (hasInvalid) {
      setError('Cannot import: some rows have missing or invalid required fields. Please correct or remove all invalid rows first.');
      return;
    }
    const invalid = pending.find((row) => validationIssues.get(row.key)?.some((issue) => (
      /^(Select a subject|Choose a weekday|Enter valid 24-hour|Choose a supported session type|Duplicate class row|Class time overlaps)/i.test(issue)
    )));
    if (invalid) {
      const blocking = validationIssues.get(invalid.key).filter((issue) => (
        /^(Select a subject|Choose a weekday|Enter valid 24-hour|Choose a supported session type|Duplicate class row|Class time overlaps)/i.test(issue)
      ));
      setError(`Correct row ${invalid.sourceLine || 'unknown'}: ${blocking.join(' ')}`);
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
  const validationIssues = validateRows(visibleRows.filter((row) => !row.saved), subjects);
  const canonicalRows = timetableRowsToCanonicalRows(visibleRows, subjects);
  const csvPreview = timetableRowsToCsv(visibleRows, subjects);

  const classifiedRows = visibleRows.map((row) => {
    const rowIssues = [...new Set([...(row.issues || []), ...(validationIssues.get(row.key) || [])])];
    const classification = getRowClassification(row, rowIssues);
    return { row, rowIssues, classification };
  });

  const validCount = classifiedRows.filter((item) => item.classification === 'valid').length;
  const reviewCount = classifiedRows.filter((item) => item.classification === 'needs-review').length;
  const invalidCount = classifiedRows.filter((item) => item.classification === 'invalid').length;

  function downloadCsv() {
    const blob = new Blob([csvPreview], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'acadova-timetable.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="timetable-import card" aria-labelledby="timetable-import-title">
      <div className="timetable-import__heading">
        <div>
          <h2 id="timetable-import-title">Upload Timetable</h2>
          <p>Upload an image, PDF, CSV, TSV, plain-text file, or XLSX spreadsheet. Review and correct the conversion before anything is saved.</p>
        </div>
      </div>
      <ol className="timetable-import__steps" aria-label="Timetable import steps">
        <li>Extracting timetable</li>
        <li>Converting to CSV</li>
        <li>Review timetable</li>
        <li>Import to Acadova</li>
      </ol>
      <form className="timetable-import__upload" onSubmit={preview}>
        <label className="field">Choose a timetable file
          <input type="file" accept={FILE_ACCEPT} capture="environment" onChange={(event) => { setFile(event.target.files?.[0] || null); setRows([]); setWarnings([]); setError(''); setNotice(''); }} />
        </label>
        <p className="upload-hint">Maximum 25 MB. Images and scanned PDFs use local OCR; digital PDFs and spreadsheets are read directly. No paid vision API is used. Uploaded documents are not stored.</p>
        <button className="btn btn--primary" disabled={parsing || !file}>
          {parsing && <Spinner label="Extracting" />}
          {parsing ? 'Extracting timetable → Converting to CSV…' : 'Extract preview'}
        </button>
      </form>
      {error && <div className="alert" role="alert">{error}</div>}
      {error && !rows.length && (
        <button type="button" className="btn btn--ghost" onClick={() => { setError(''); setNotice('Add the classes you can read, correct each field, then confirm to save.'); setMethod('Manual entry'); addRow(); }}>
          Start manual timetable preview
        </button>
      )}
      {notice && <p className="import-notice" role="status">{notice}{method ? ` · Extraction: ${method}` : ''}</p>}
      {file && (
        <div className="timetable-original">
          <h3>Original timetable</h3>
          {previewUrl ? (
            /\.pdf$/i.test(file.name) ? <iframe src={previewUrl} title="Original timetable PDF" /> : <img src={previewUrl} alt="Original uploaded timetable" />
          ) : (
            <p>{file.name} · Uploaded file preview is available in the extracted timetable below.</p>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="import-preview-heading">
            <h3>Extracted timetable</h3>
            <p>Correct uncertain values below. The official timetable is unchanged until you confirm the import.</p>
          </div>
          {warnings.length > 0 && (
            <div className="import-warning" role="status">
              <strong>Extraction warnings</strong>
              <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
          {breakPeriods.length > 0 && (
            <div className="import-notice">
              <strong>Non-class periods detected:</strong> {breakPeriods.map((row) => `${DAYS[row.weekday] || 'Unknown day'} ${row.startTime || 'time unclear'}–${row.endTime || 'time unclear'} ${row.subjectName}`).join('; ')}. These will not be saved as classes.
            </div>
          )}
          {sections.length > 1 && (
            <label className="field">
              Timetable section
              <select value={selectedSection} onChange={(event) => setSelectedSection(event.target.value)}>
                <option value="">All sections</option>
                {sections.map((section) => <option key={section} value={section}>{section}</option>)}
              </select>
              <small>Choose a section to import only its entries, or keep all sections selected.</small>
            </label>
          )}
          {!subjects.length && <p className="academic-note">Create subjects first in <Link to="/subjects">Subject management</Link>, then select them here.</p>}

          <div className="import-summary-bar">
            <div className="import-summary-bar__stats">
              <span><strong>{visibleRows.length}</strong> classes extracted:</span>
              <span className="badge badge--valid">{validCount} valid</span>
              <span className="badge badge--review">{reviewCount} needs review</span>
              <span className="badge badge--invalid">{invalidCount} invalid</span>
            </div>
            {invalidCount > 0 && (
              <button type="button" className="btn btn--ghost import-summary-bar__clean" onClick={removeInvalidRows} disabled={saving}>
                Remove invalid rows ({invalidCount})
              </button>
            )}
          </div>

          {invalidCount > 0 && (
            <div className="alert" role="alert">
              {invalidCount} row(s) contain invalid or missing required fields. Correct them below or click "Remove invalid rows" before confirming.
            </div>
          )}

          <div className="import-rows">
            {classifiedRows.map(({ row, rowIssues, classification }) => (
              <article
                className={`import-row card${classification === 'invalid' ? ' import-row--invalid' : classification === 'needs-review' ? ' import-row--needs-review' : ''}${row.saved ? ' import-row--saved' : ''}`}
                key={row.key}
              >
                <div className="import-row__meta">
                  <strong>{row.sourceLine === 'manual' ? 'Added entry' : `Extracted row ${row.sourceLine}`}</strong>
                  {row.saved ? (
                    <span className="badge badge--valid">Saved</span>
                  ) : classification === 'valid' ? (
                    <span className="badge badge--valid">Successfully recognized</span>
                  ) : classification === 'needs-review' ? (
                    <span className="badge badge--review">Needs review</span>
                  ) : (
                    <span className="badge badge--invalid">Invalid · Missing required fields</span>
                  )}
                  {Number.isFinite(row.confidence) && (
                    <span className={`confidence-pill ${row.confidence >= 75 ? 'confidence-pill--high' : row.confidence >= 55 ? 'confidence-pill--mid' : 'confidence-pill--low'}`}>
                      {row.confidence}% confidence
                    </span>
                  )}
                  {!row.saved && (
                    <button type="button" className="btn btn--ghost import-row__remove" onClick={() => removeRow(row.key)} disabled={saving}>
                      Remove row
                    </button>
                  )}
                </div>
                <div className="import-row__raw-text">
                  <small>Detected text: </small>
                  <code>{row.rawText || row.originalText || row.subjectName || '(empty)'}</code>
                </div>
                <SubjectPicker
                  subjects={subjects}
                  value={row.subjectId}
                  detectedName={row.subjectName}
                  detectedCode={row.subjectCode}
                  disabled={saving || row.saved}
                  onChange={(value) => changeRow(row.key, 'subjectId', value)}
                  onCreated={onImported}
                />
                <label>
                  Subject name
                  <input value={row.subjectName || ''} onChange={(event) => changeRow(row.key, 'subjectName', event.target.value)} disabled={saving || row.saved} />
                </label>
                <label>
                  Subject code
                  <input value={row.subjectCode || ''} onChange={(event) => changeRow(row.key, 'subjectCode', event.target.value)} disabled={saving || row.saved} placeholder="e.g. CS101" />
                </label>
                <label>
                  Weekday
                  <select value={row.weekday ?? ''} onChange={(event) => changeRow(row.key, 'weekday', event.target.value === '' ? null : Number(event.target.value))} disabled={saving || row.saved}>
                    <option value="">Choose day</option>
                    {DAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}
                  </select>
                </label>
                <label>
                  Start
                  <input type="time" value={row.startTime || ''} onChange={(event) => changeRow(row.key, 'startTime', event.target.value)} disabled={saving || row.saved} />
                </label>
                <label>
                  End
                  <input type="time" value={row.endTime || ''} onChange={(event) => changeRow(row.key, 'endTime', event.target.value)} disabled={saving || row.saved} />
                </label>
                <label>
                  Faculty / instructor
                  <input value={row.teacher || ''} onChange={(event) => changeRow(row.key, 'teacher', event.target.value)} disabled={saving || row.saved} />
                </label>
                <label>
                  Classroom / location
                  <input value={row.location || ''} onChange={(event) => changeRow(row.key, 'location', event.target.value)} disabled={saving || row.saved} />
                </label>
                <label>
                  Session type
                  <select value={row.sessionType || ''} onChange={(event) => changeRow(row.key, 'sessionType', event.target.value)} disabled={saving || row.saved}>
                    <option value="">Unspecified</option>
                    {['lecture', 'lab', 'practical', 'tutorial', 'other'].map((type) => (
                      <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </label>
                {rowIssues.length > 0 && !row.saved && (
                  <p className="field__error import-row__issues">Review: {rowIssues.join(' ')}</p>
                )}
              </article>
            ))}
          </div>

          <section className="timetable-csv-preview" aria-labelledby="timetable-csv-heading">
            <div className="timetable-csv-preview__heading">
              <div>
                <h3 id="timetable-csv-heading">Standardized CSV preview</h3>
                <p>All extraction methods use the same eight-column format.</p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={downloadCsv} disabled={!visibleRows.length}>Download CSV</button>
            </div>
            <div className="timetable-csv-preview__table">
              <table>
                <thead>
                  <tr>{TIMETABLE_CSV_COLUMNS.map((column) => <th key={column}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  {canonicalRows.map((row, index) => (
                    <tr key={`${visibleRows[index]?.key || index}-csv`}>
                      {TIMETABLE_CSV_COLUMNS.map((column) => <td key={column}>{row[column]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="import-confirm-actions">
            <button type="button" className="btn btn--ghost" onClick={addRow} disabled={saving}>Add missed class</button>
            <button className="btn btn--primary" onClick={confirmSave} disabled={saving || !pendingRows.length || !subjects.length || invalidCount > 0}>
              {saving && <Spinner label="Saving imported rows" />}
              {saving ? 'Importing confirmed timetable…' : `Confirm and import ${pendingRows.length} row(s) to Acadova`}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => { setRows([]); setMethod(''); setWarnings([]); setNotice(''); setError(''); }} disabled={saving}>Discard preview</button>
          </div>
        </>
      )}
      <details className="import-format-help">
        <summary>CSV format</summary>
        <p><code>subject,subject_code,day,start_time,end_time,faculty,location,session_type</code></p>
        <p>CSV downloads use UTF-8 with a BOM for spreadsheet compatibility. Optional fields may be blank.</p>
      </details>
    </section>
  );
}
