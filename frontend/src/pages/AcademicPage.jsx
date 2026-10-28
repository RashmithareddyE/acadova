import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { PageLoader, Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { academicApi } from '../lib/api';
import TimetableImport from '../components/TimetableImport';
import AcademicImport from '../components/AcademicImport';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CONFIG = {
  subjects: { title: 'Subjects', singular: 'subject', fields: [
    ['name', 'Subject name', 'text', true], ['code', 'Subject code', 'text', true], ['teacher', 'Teacher / instructor', 'text'], ['credits', 'Credits', 'number', true], ['description', 'Description', 'textarea'],
  ] },
  timetable: { title: 'Weekly Timetable', singular: 'class', fields: [
    ['subject', 'Subject', 'subject', true], ['weekday', 'Weekday', 'weekday', true], ['startTime', 'Start time', 'time', true], ['endTime', 'End time', 'time', true], ['location', 'Classroom / location', 'text'], ['sessionType', 'Session type', 'sessionType'],
  ] },
  calendar: { title: 'Academic Calendar', singular: 'event', fields: [
    ['title', 'Title', 'text', true], ['type', 'Event type', 'calendarType', true], ['date', 'Date', 'date', true], ['endDate', 'End date (optional)', 'date'], ['description', 'Description', 'textarea'],
  ] },
  exams: { title: 'Exam Schedule', singular: 'exam', fields: [
    ['title', 'Exam title', 'text', true], ['type', 'Exam type', 'examType', true], ['subject', 'Subject', 'subject', true], ['date', 'Exam date', 'date', true], ['startTime', 'Start time', 'time'], ['endTime', 'End time', 'time'], ['venue', 'Venue', 'text'], ['notes', 'Notes', 'textarea'],
  ] },
  syllabus: { title: 'Syllabus Tracker', singular: 'topic', fields: [
    ['subject', 'Subject', 'subject', true], ['unit', 'Unit', 'text', true], ['topic', 'Topic', 'text', true], ['progress', 'Progress', 'topicProgress', true],
  ] },
};

const OPTIONS = {
  weekday: DAYS.map((label, value) => [value, label]),
  calendarType: [['event', 'Academic event'], ['holiday', 'Holiday'], ['deadline', 'Deadline'], ['college', 'College event']],
  examType: [['midterm', 'Midterm'], ['final', 'Final'], ['quiz', 'Quiz'], ['practical', 'Practical'], ['other', 'Other']],
  sessionType: [['lecture', 'Lecture'], ['lab', 'Lab'], ['practical', 'Practical'], ['tutorial', 'Tutorial'], ['other', 'Other']],
  topicProgress: [['not-started', 'Not Started'], ['in-progress', 'In Progress'], ['completed', 'Completed']],
};

function blank(config) {
  return Object.fromEntries(config.fields.map(([name, , type]) => [name, type === 'checkbox' ? false : type === 'topicProgress' ? 'not-started' : '']));
}

function dateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

export default function AcademicPage({ resource }) {
  const config = CONFIG[resource];
  const { user, logout } = useAuth();
  const [records, setRecords] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [values, setValues] = useState(() => blank(config));
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, subjectResult] = await Promise.all([
        academicApi.list(resource),
        resource === 'subjects' ? Promise.resolve({ records: [] }) : academicApi.list('subjects'),
      ]);
      setRecords(result.records || []);
      setSubjects(subjectResult.records || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [resource]);

  useEffect(() => { load(); }, [load]);

  const titleBySubject = useMemo(() => Object.fromEntries(subjects.map((s) => [s._id || s.id, s.name])), [subjects]);
  const syllabusProgress = useMemo(() => {
    if (resource !== 'syllabus') return [];
    return subjects.map((subject) => {
      const list = records.filter((record) => (record.subject?._id || record.subject) === (subject._id || subject.id));
      const done = list.filter((record) => record.completed || record.progress === 'completed').length;
      const inProgress = list.filter((record) => record.progress === 'in-progress').length;
      return { subject, total: list.length, done, inProgress, percent: list.length ? Math.round(done * 100 / list.length) : 0 };
    });
  }, [records, resource, subjects]);

  function editRecord(record) {
    const next = { ...blank(config) };
    config.fields.forEach(([name, , type]) => {
      let value = record[name];
      if (name === 'subject') value = record.subject?._id || record.subject || '';
      if (resource === 'syllabus' && name === 'progress') value = record.completed || record.progress === 'completed' ? 'completed' : record.progress || 'not-started';
      if (type === 'date') value = dateInput(value);
      next[name] = value ?? next[name];
    });
    setValues(next); setEditing(record._id || record.id); setFieldErrors({}); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() { setValues(blank(config)); setEditing(null); setFieldErrors({}); }

  function validate() {
    const errors = {};
    config.fields.forEach(([name, label, type, required]) => {
      if (required && (values[name] === '' || values[name] == null)) errors[name] = `${label} is required.`;
    });
    if (resource === 'timetable' || resource === 'exams') {
      if (values.startTime && values.endTime && values.startTime >= values.endTime) errors.endTime = 'End time must be after start time.';
      if (resource === 'exams' && Boolean(values.startTime) !== Boolean(values.endTime)) errors.endTime = 'Enter both exam times or leave both blank.';
    }
    if (resource === 'calendar' && values.date && values.endDate && values.endDate < values.date) errors.endDate = 'End date must be on or after the start date.';
    if (resource === 'subjects' && values.credits !== '' && Number(values.credits) < 0) errors.credits = 'Credits cannot be negative.';
    return errors;
  }

  async function submit(event) {
    event.preventDefault(); setError('');
    const errors = validate(); setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const payload = { ...values };
    if (resource === 'subjects') payload.credits = Number(payload.credits);
    if (resource === 'timetable') payload.weekday = Number(payload.weekday);
    Object.keys(payload).forEach((key) => { if (payload[key] === '') payload[key] = null; });
    setSaving(true);
    try {
      if (editing) await academicApi.update(resource, editing, payload);
      else await academicApi.create(resource, payload);
      resetForm(); await load();
    } catch (err) { setError(err.message); setFieldErrors(err.errors || {}); }
    finally { setSaving(false); }
  }

  async function removeRecord(record) {
    const id = record._id || record.id;
    setRemoving(id); setError('');
    try {
      await academicApi.remove(resource, id);
      if (editing === id) resetForm();
      await load();
    } catch (err) { setError(err.message); }
    finally { setRemoving(''); }
  }

  function renderInput([name, label, type, required]) {
    const common = { id: `academic-${name}`, required, value: values[name] ?? '', onChange: (e) => setValues((prev) => ({ ...prev, [name]: e.target.value })) };
    let input;
    if (type === 'textarea') input = <textarea {...common} rows="3" />;
    else if (type === 'checkbox') input = <label className="academic-check"><input type="checkbox" checked={Boolean(values[name])} onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.checked }))} /> Mark topic completed</label>;
    else if (type === 'subject') input = <select {...common}><option value="">Select a subject</option>{subjects.map((s) => <option key={s._id || s.id} value={s._id || s.id}>{s.name} ({s.code})</option>)}</select>;
    else if (OPTIONS[type]) input = <select {...common}><option value="">Select</option>{OPTIONS[type].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>;
    else input = <input {...common} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.5' : undefined} />;
    return <div className="field" key={name}><label htmlFor={`academic-${name}`}>{label}{required ? ' *' : ''}</label>{input}{fieldErrors[name] && <p className="field__error">{fieldErrors[name]}</p>}</div>;
  }

  function recordTitle(record) {
    if (resource === 'subjects') return `${record.name} (${record.code})`;
    if (resource === 'timetable') return `${DAYS[record.weekday]} · ${record.startTime}–${record.endTime}`;
    if (resource === 'calendar' || resource === 'exams') return record.title;
    return `${record.unit} · ${record.topic}`;
  }

  function details(record) {
    if (resource === 'subjects') return `${record.teacher || 'No instructor'} · ${record.credits} credits${record.description ? ` · ${record.description}` : ''}`;
    if (resource === 'timetable') return `${record.subject?.name || titleBySubject[record.subject]}${record.sessionType ? ` · ${record.sessionType}` : ''}${record.location ? ` · ${record.location}` : ''}`;
    if (resource === 'calendar') return `${record.type} · ${displayDate(record.date)}${record.endDate ? ` – ${displayDate(record.endDate)}` : ''}${record.description ? ` · ${record.description}` : ''}`;
    if (resource === 'exams') return `${record.subject?.name || titleBySubject[record.subject]} · ${record.type} · ${displayDate(record.date)} · ${record.startTime}–${record.endTime}${record.venue ? ` · ${record.venue}` : ''}${record.notes ? ` · ${record.notes}` : ''}`;
    const progress = record.completed || record.progress === 'completed' ? 'completed' : record.progress || 'not-started';
    const progressLabel = { 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Completed' }[progress];
    return `${record.subject?.name || titleBySubject[record.subject]} · ${progressLabel}`;
  }

  const orderedRecords = useMemo(() => {
    if (resource === 'timetable') return [...records].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    return records;
  }, [records, resource]);

  return <div className="dash academic">
    <header className="dash__bar"><div className="dash__bar-inner"><Link to="/dashboard" aria-label="Acadova dashboard"><Brand /></Link>
      <nav className="dash__nav" aria-label="Main"><Link className="dash__link" to="/dashboard">Dashboard</Link>{Object.entries(CONFIG).map(([key, item]) => <Link key={key} className={`dash__link${key === resource ? ' dash__link--active' : ''}`} to={`/${key}`}>{item.title.replace('Weekly ', '').replace('Academic ', '').replace(' Schedule', '')}</Link>)}</nav>
      <div className="dash__user"><span className="dash__email" title={user.email}>{user.email}</span><button className="btn btn--ghost" onClick={logout}>Log out</button></div>
    </div></header>
    <main className="dash__main"><div className="academic-heading"><div><p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / Academic data</p><h1 className="dash__title">{config.title}</h1><p className="dash__lead">Create, update, and organize your academic information.</p></div></div>
      {error && <div className="alert" role="alert">{error}</div>}
      {resource === 'timetable' && <TimetableImport subjects={subjects} onImported={load} />}
      {(resource === 'calendar' || resource === 'exams' || resource === 'syllabus') && <AcademicImport kind={resource} subjects={subjects} records={records} onImported={load} />}
      <section className="academic-form card" id="timetable-manual-entry"><h2>{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2>
        {(resource === 'timetable' || resource === 'exams' || resource === 'syllabus') && subjects.length === 0 && <p className="academic-note">Add a subject before creating {resource === 'exams' ? 'an exam' : resource === 'syllabus' ? 'syllabus topics' : 'a class'}.</p>}
        <form onSubmit={submit} className="academic-fields">{config.fields.map(renderInput)}<div className="academic-actions"><button className="btn btn--primary" disabled={saving || ((resource === 'timetable' || resource === 'exams' || resource === 'syllabus') && !subjects.length)}>{saving && <Spinner label="Saving" />}{editing ? 'Save changes' : `Add ${config.singular}`}</button>{editing && <button type="button" className="btn btn--ghost" onClick={resetForm}>Cancel edit</button>}</div></form>
      </section>
      {resource === 'syllabus' && <section className="academic-progress card"><h2>Subject progress</h2>{syllabusProgress.length ? syllabusProgress.map(({ subject, total, done, inProgress, percent }) => <div className="progress-row" key={subject._id || subject.id}><div><strong>{subject.name}</strong><span>{done} completed · {inProgress} in progress · {total} topics</span></div><progress value={percent} max="100">{percent}%</progress><b>{percent}%</b></div>) : <p className="empty-state">Add subjects to track syllabus progress.</p>}</section>}
      <section className="academic-list"><h2>{resource === 'timetable' ? 'Week at a glance' : resource === 'exams' ? 'Upcoming and past exams' : `Your ${config.title.toLowerCase()}`}</h2>
        {loading ? <div className="academic-loading"><Spinner label="Loading" /> Loading your records…</div> : orderedRecords.length === 0 ? <div className="empty-state card">No {config.title.toLowerCase()} yet. Add your first {config.singular} above.</div> : resource === 'timetable' ? DAYS.map((day, index) => { const items = orderedRecords.filter((record) => record.weekday === index); return <div className="week-day" key={day}><h3>{day}</h3>{items.length ? items.map((record) => <RecordCard key={record._id || record.id} record={record} title={recordTitle(record)} detail={details(record)} editing={editing} removing={removing} onEdit={editRecord} onRemove={removeRecord} />) : <p className="day-empty">No classes</p>}</div>; }) : orderedRecords.map((record) => <RecordCard key={record._id || record.id} record={record} title={recordTitle(record)} detail={details(record)} editing={editing} removing={removing} onEdit={editRecord} onRemove={removeRecord} />)}
      </section>
    </main>
  </div>;
}

function RecordCard({ record, title, detail, editing, removing, onEdit, onRemove }) {
  const id = record._id || record.id;
  return <article className="academic-record card"><div><h3>{title}</h3><p>{detail}</p></div><div className="academic-record__actions"><button className="btn btn--ghost" onClick={() => onEdit(record)}>Edit</button><button className="btn btn--ghost" onClick={() => onRemove(record)} disabled={removing === id}>{removing === id ? 'Deleting…' : 'Delete'}</button></div></article>;
}
