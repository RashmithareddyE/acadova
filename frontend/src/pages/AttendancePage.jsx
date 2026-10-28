import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { academicApi, attendanceApi } from '../lib/api';

const STATUS_OPTIONS = [['present', 'Present'], ['absent', 'Absent'], ['cancelled', 'Cancelled']];
const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const dateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' });
const statusLabel = (value) => STATUS_OPTIONS.find(([key]) => key === value)?.[1] || 'Not recorded';
const idOf = (value) => value?._id || value?.id || value;

export default function AttendancePage() {
  const { user, logout } = useAuth();
  const [date, setDate] = useState(todayString());
  const [subjects, setSubjects] = useState([]);
  const [summary, setSummary] = useState({ target: 75, overall: null, summaries: [] });
  const [classes, setClasses] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [planned, setPlanned] = useState({});
  const [plannedProjection, setPlannedProjection] = useState([]);
  const [records, setRecords] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [manual, setManual] = useState({ subject: '', status: 'present', notes: '' });
  const [edit, setEdit] = useState(null);
  const [projectionInput, setProjectionInput] = useState({ subject: '', attend: 0, miss: 0 });
  const [projection, setProjection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [summaryResult, subjectResult, scheduleResult, recordResult, upcomingResult] = await Promise.all([
        attendanceApi.summary(), academicApi.list('subjects'), attendanceApi.schedule(date), attendanceApi.records(date), attendanceApi.schedule(todayString(), 7),
      ]);
      setSummary(summaryResult); setSubjects(subjectResult.records || []); setClasses(scheduleResult.classes || []);
      setRecords(recordResult.records || []);
      setUpcoming((upcomingResult.classes || []).filter((item) => item.date > todayString()));
      setProjectionInput((old) => ({ ...old, subject: old.subject || (subjectResult.records || [])[0]?._id || '' }));
      setDrafts(Object.fromEntries((scheduleResult.classes || []).map((item) => [idOf(item.timetableEntry), {
        status: item.record?.status || '', notes: item.record?.notes || '', recordId: idOf(item.record),
      }])));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const rowsByStatus = useMemo(() => ({
    below: summary.summaries.filter((item) => item.status === 'below target'),
    risk: summary.summaries.filter((item) => item.status === 'at risk'),
  }), [summary]);

  async function changeTarget(event) {
    const target = Number(event.target.value);
    setError(''); setSuccess(''); setSaving('target');
    try { await attendanceApi.setTarget(target); setSuccess(`Attendance target updated to ${target}%.`); await load(); }
    catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function saveScheduled(item) {
    const key = idOf(item.timetableEntry);
    const draft = drafts[key] || {};
    if (!draft.status) { setError('Choose a status for this scheduled class.'); return; }
    setSaving(key); setError(''); setSuccess('');
    const payload = { subject: idOf(item.subject), timetableEntry: key, date, status: draft.status, notes: draft.notes || '' };
    try {
      if (draft.recordId) await attendanceApi.update(draft.recordId, payload);
      else await attendanceApi.create(payload);
      setSuccess(`Attendance saved for ${item.subject.name}.`); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function addManual(event) {
    event.preventDefault(); setSaving('manual'); setError(''); setSuccess('');
    try {
      await attendanceApi.create({ ...manual, date });
      setManual((prev) => ({ ...prev, notes: '' })); setSuccess('Attendance record added.'); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function saveEdit(event) {
    event.preventDefault(); setSaving(edit.id); setError(''); setSuccess('');
    try {
      await attendanceApi.update(edit.id, { subject: idOf(edit.subject), timetableEntry: idOf(edit.timetableEntry) || null, date: edit.date, status: edit.status, notes: edit.notes || '' });
      setEdit(null); setSuccess('Attendance record updated.'); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function deleteRecord(record) {
    const id = idOf(record);
    setSaving(id); setError(''); setSuccess('');
    try { await attendanceApi.remove(id); setSuccess('Attendance record deleted.'); await load(); }
    catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function runProjection(event) {
    event.preventDefault(); setSaving('projection'); setProjection(null); setError('');
    try { const result = await attendanceApi.project(projectionInput.subject, Number(projectionInput.attend), Number(projectionInput.miss)); setProjection(result.projection); }
    catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function runPlannedProjection() {
    const selected = upcoming.filter((item) => planned[idOf(item.timetableEntry)] && !item.record);
    if (!selected.length) { setError('Select at least one upcoming class to explore as a planned absence.'); return; }
    const counts = selected.reduce((all, item) => { const subject = idOf(item.subject); all[subject] = (all[subject] || 0) + 1; return all; }, {});
    setSaving('planned'); setError(''); setPlannedProjection([]);
    try {
      const results = await Promise.all(Object.entries(counts).map(async ([subjectId, miss]) => {
        const result = await attendanceApi.project(subjectId, 0, miss);
        const subject = subjects.find((entry) => idOf(entry) === subjectId);
        return { subject: subject?.name || 'Subject', miss, ...result.projection };
      }));
      setPlannedProjection(results);
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  function updateDraft(item, key, value) {
    const id = idOf(item.timetableEntry);
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  }

  return <div className="dash attendance-page">
    <header className="dash__bar"><div className="dash__bar-inner"><Link to="/dashboard" aria-label="Acadova dashboard"><Brand /></Link>
      <nav className="dash__nav" aria-label="Main"><Link className="dash__link" to="/dashboard">Dashboard</Link><Link className="dash__link" to="/subjects">Subjects</Link><Link className="dash__link" to="/timetable">Timetable</Link><Link className="dash__link dash__link--active" to="/attendance" aria-current="page">Attendance</Link></nav>
      <div className="dash__user"><span className="dash__email" title={user.email}>{user.email}</span><button className="btn btn--ghost" onClick={logout}>Log out</button></div>
    </div></header>
    <main className="dash__main">
      <div className="academic-heading"><div><p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / Academic data</p><h1 className="dash__title">Attendance</h1><p className="dash__lead">Record classes and understand your attendance against your chosen target.</p></div>
        <label className="target-control">Required attendance target<select value={summary.target} onChange={changeTarget} disabled={saving === 'target'}><option value="75">75%</option><option value="80">80%</option></select></label>
      </div>
      {error && <div className="alert" role="alert">{error}</div>}{success && <div className="success-message" role="status">{success}</div>}
      {loading ? <div className="academic-loading"><Spinner label="Loading attendance" /> Loading attendance data…</div> : <>
        {summary.overall?.conducted ? <section className="attendance-overall card"><div><span>Overall attendance</span><strong>{summary.overall.percentage.toFixed(1)}%</strong><small>{summary.overall.attended} attended of {summary.overall.conducted} conducted</small></div><div className="attendance-target-note">Target: {summary.target}%</div></section> : <section className="empty-state card">Attendance data is unavailable until you record your first class.</section>}
        <section className="attendance-insights"><article className="card"><h2>Below target</h2><p>{rowsByStatus.below.length ? `${rowsByStatus.below.length} subject${rowsByStatus.below.length === 1 ? '' : 's'} below your ${summary.target}% target.` : 'No subjects are below your target.'}</p>{rowsByStatus.below.map((row) => <span className="insight-pill" key={row.subject.id}>{row.subject.name}: attend {row.classesToRecover} consecutive class{row.classesToRecover === 1 ? '' : 'es'} to recover.</span>)}</article><article className="card"><h2>At risk</h2><p>At risk means your target is currently met with 2 or fewer additional absences allowed.</p>{rowsByStatus.risk.length ? rowsByStatus.risk.map((row) => <span className="insight-pill" key={row.subject.id}>{row.subject.name}: {row.additionalAbsencesAllowed} additional absences allowed.</span>) : <p>No subjects are currently at risk.</p>}</article></section>
        <section className="attendance-subjects"><h2>Subject attendance</h2>{summary.summaries.length ? <div className="attendance-grid">{summary.summaries.map((row) => <article className={`attendance-card card attendance-card--${row.status.replaceAll(' ', '-')}`} key={row.subject.id}><div className="attendance-card__heading"><div><h3>{row.subject.name}</h3><p>{row.subject.code}</p></div><span className="attendance-status">{row.status === 'no data' ? 'No data' : row.status}</span></div>{row.percentage === null ? <p className="no-attendance-data">No attendance data recorded yet.</p> : <><strong className="attendance-percent">{row.percentage.toFixed(1)}%</strong><p>{row.attended} attended · {row.missed} missed · {row.conducted} conducted</p><p>Target {summary.target}% · {row.additionalAbsencesAllowed} additional absences allowed</p>{row.classesToRecover > 0 && <p>Attend {row.classesToRecover} consecutive classes to reach target.</p>}</>}<button className="btn btn--ghost" onClick={() => setProjectionInput((prev) => ({ ...prev, subject: row.subject.id }))}>Project this subject</button></article>)}</div> : <div className="empty-state card">Add a subject first, then record attendance for it.</div>}</section>
        <section className="attendance-mark card"><div className="attendance-section-head"><div><h2>Mark attendance</h2><p>Classes from your weekly timetable for the selected date.</p></div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
          {classes.length ? classes.map((item) => { const key = idOf(item.timetableEntry); const draft = drafts[key] || {}; const statusOptions = item.date > todayString() ? STATUS_OPTIONS.filter(([value]) => value === 'cancelled') : STATUS_OPTIONS; return <article className="scheduled-class" key={`${item.date}-${key}`}><div className="scheduled-class__info"><strong>{item.subject.name} ({item.subject.code})</strong><span>{item.timetableEntry.startTime}–{item.timetableEntry.endTime}{item.timetableEntry.location ? ` · ${item.timetableEntry.location}` : ''}</span></div><label>Status<select value={draft.status || ''} onChange={(e) => updateDraft(item, 'status', e.target.value)}><option value="">Choose status</option>{statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="scheduled-notes">Notes<input value={draft.notes || ''} onChange={(e) => updateDraft(item, 'notes', e.target.value)} maxLength="1000" /></label><button className="btn btn--primary" onClick={() => saveScheduled(item)} disabled={saving === key}>{saving === key ? 'Saving…' : draft.recordId ? 'Update' : 'Save'}</button></article>; }) : <p className="empty-state">No timetable classes are scheduled for {dateLabel(date)}. You can still add a manual record below.</p>}
        </section>
        <section className="attendance-manual card"><h2>Add an unscheduled class record</h2><form className="attendance-manual__form" onSubmit={addManual}><label>Subject<select required value={manual.subject} onChange={(e) => setManual((prev) => ({ ...prev, subject: e.target.value }))}><option value="">Select subject</option>{subjects.map((subject) => <option key={subject._id} value={subject._id}>{subject.name} ({subject.code})</option>)}</select></label><label>Status<select value={manual.status} onChange={(e) => setManual((prev) => ({ ...prev, status: e.target.value }))}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Notes<input value={manual.notes} onChange={(e) => setManual((prev) => ({ ...prev, notes: e.target.value }))} maxLength="1000" /></label><button className="btn btn--primary" disabled={saving === 'manual' || !subjects.length}>{saving === 'manual' ? 'Saving…' : 'Add record'}</button></form></section>
        <section className="attendance-records"><h2>Actual records for {dateLabel(date)}</h2>{records.length ? records.map((record) => <article className="attendance-record card" key={idOf(record)}><div className="attendance-record__summary"><strong>{record.subject?.name} ({record.subject?.code})</strong><span>{statusLabel(record.status)}{record.timetableEntry ? ` · ${record.timetableEntry.startTime}–${record.timetableEntry.endTime}` : ' · Unscheduled'}</span>{record.notes && <p>{record.notes}</p>}</div>{edit?.id === idOf(record) ? <form className="attendance-edit" onSubmit={saveEdit}><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{STATUS_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><input value={edit.notes} maxLength="1000" onChange={(e) => setEdit({ ...edit, notes: e.target.value })} aria-label="Attendance notes" /><button className="btn btn--primary" disabled={saving === edit.id}>{saving === edit.id ? 'Saving…' : 'Save'}</button><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button></form> : <div className="academic-record__actions"><button className="btn btn--ghost" onClick={() => setEdit({ id: idOf(record), subject: record.subject, timetableEntry: record.timetableEntry, date: record.date, status: record.status, notes: record.notes || '' })}>Edit</button><button className="btn btn--ghost" disabled={saving === idOf(record)} onClick={() => deleteRecord(record)}>{saving === idOf(record) ? 'Deleting…' : 'Delete'}</button></div>}</article>) : <div className="empty-state card">No attendance records for this date yet.</div>}</section>
        <section className="attendance-projection card"><h2>Future attendance projection</h2><p>Explore a scenario separately from your actual attendance records.</p><form className="attendance-projection__form" onSubmit={runProjection}><label>Subject<select required value={projectionInput.subject} onChange={(e) => setProjectionInput({ ...projectionInput, subject: e.target.value })}><option value="">Select subject</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label><label>Future classes attended<input type="number" min="0" max="1000" value={projectionInput.attend} onChange={(e) => setProjectionInput({ ...projectionInput, attend: e.target.value })} /></label><label>Future classes missed<input type="number" min="0" max="1000" value={projectionInput.miss} onChange={(e) => setProjectionInput({ ...projectionInput, miss: e.target.value })} /></label><button className="btn btn--primary" disabled={!projectionInput.subject || saving === 'projection'}>{saving === 'projection' ? 'Calculating…' : 'Calculate projection'}</button></form>{projection && <div className="projection-result" role="status"><strong>Projected: {projection.percentage === null ? 'No classes' : `${projection.percentage.toFixed(1)}%`}</strong><span>{projection.attended} attended of {projection.conducted} projected classes · Target {projection.target}%</span></div>}</section>
        <section className="upcoming-classes"><h2>Upcoming classes</h2><p className="attendance-projection__help">Select future classes to model planned absences. This changes only the projection and does not create attendance records.</p>{upcoming.length ? <><div className="upcoming-class-list">{upcoming.slice(0, 8).map((item) => { const key = idOf(item.timetableEntry); return <label className="upcoming-class card" key={`${item.date}-${key}`}><input type="checkbox" checked={Boolean(planned[key])} disabled={Boolean(item.record)} onChange={(e) => { setPlanned((old) => ({ ...old, [key]: e.target.checked })); setPlannedProjection([]); }} /><span><strong>{item.subject.name}</strong><small>{dateLabel(item.date)} · {item.timetableEntry.startTime}–{item.timetableEntry.endTime}{item.record ? ` · ${statusLabel(item.record.status)} already recorded` : ''}</small></span></label>; })}</div><button type="button" className="btn btn--primary" onClick={runPlannedProjection} disabled={saving === 'planned' || !Object.values(planned).some(Boolean)}>{saving === 'planned' ? 'Calculating…' : 'Project selected absences'}</button>{plannedProjection.map((result) => <p className="projection-result" role="status" key={result.subject}>{result.subject}: projected {result.percentage === null ? 'no classes' : `${result.percentage.toFixed(1)}%`} after {result.miss} planned absence{result.miss === 1 ? '' : 's'} ({result.attended} attended of {result.conducted} projected).</p>)}</> : <div className="empty-state card">No upcoming timetable classes found for the next week.</div>}</section>
      </>}
    </main>
  </div>;
}
