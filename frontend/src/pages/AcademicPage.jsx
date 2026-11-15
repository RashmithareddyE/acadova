import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { PageLoader, Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { academicApi } from '../lib/api';
import TimetableImport from '../components/TimetableImport';
import AcademicImport from '../components/AcademicImport';
import { timetableRowsToCsv } from '../lib/timetableCsv';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CONFIG = {
  subjects: { title: 'Subjects', singular: 'subject', fields: [
    ['name', 'Subject name', 'text', true], ['code', 'Subject code', 'text', true], ['teacher', 'Teacher / instructor', 'text'], ['credits', 'Credits', 'number', true], ['initialConducted', 'Initial conducted classes (optional)', 'number'], ['initialAttended', 'Initial attended classes (optional)', 'number'], ['description', 'Description', 'textarea'],
  ] },
  timetable: { title: 'Weekly Timetable', singular: 'class', fields: [
    ['subject', 'Subject', 'subject', true], ['weekday', 'Weekday', 'weekday', true], ['startTime', 'Start time', 'time', true], ['endTime', 'End time', 'time', true], ['teacher', 'Faculty / instructor', 'text'], ['location', 'Classroom / location', 'text'], ['sessionType', 'Session type', 'sessionType'],
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
  calendarType: [
    ['holiday', 'College Holiday'],
    ['working-saturday', 'Working Saturday'],
    ['special-working-day', 'Special Working Day'],
    ['cancelled-class', 'Cancelled Class'],
    ['semester-start', 'Semester Start Date'],
    ['semester-end', 'Semester End Date'],
    ['exam', 'Examination Date'],
    ['deadline', 'Academic Deadline'],
    ['college', 'College Event'],
    ['event', 'Academic Event'],
  ],
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
  const [calendarViewMode, setCalendarViewMode] = useState('monthly');
  const [calendarDate, setCalendarDate] = useState(() => new Date());

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
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '') {
        if (resource === 'timetable' && (key === 'sessionType' || key === 'teacher' || key === 'location')) {
          payload[key] = '';
        } else {
          payload[key] = null;
        }
      }
    });
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
    if (resource === 'subjects') {
      const confirmed = window.confirm(
        `Are you sure you want to delete subject "${record.name}"?\n\nWARNING: This will permanently delete all associated timetable entries, attendance history, exams, syllabus topics, and study sessions for this subject!`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(`Are you sure you want to delete this ${config.singular}?`);
      if (!confirmed) return;
    }
    setRemoving(id); setError('');
    try {
      await academicApi.remove(resource, id);
      if (editing === id) resetForm();
      await load();
    } catch (err) { setError(err.message); }
    finally { setRemoving(''); }
  }

  function exportTimetableCsv() {
    if (!orderedRecords.length) return;
    const csv = timetableRowsToCsv(orderedRecords, subjects);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'acadova-timetable.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
    if (resource === 'subjects') return `${record.teacher || 'No instructor'} · ${record.credits} credits${record.initialConducted ? ` · Baseline: ${record.initialAttended || 0}/${record.initialConducted} attended` : ''}${record.description ? ` · ${record.description}` : ''}`;
    if (resource === 'timetable') return `${record.subject?.name || titleBySubject[record.subject]}${record.teacher ? ` · ${record.teacher}` : ''}${record.sessionType ? ` · ${record.sessionType}` : ''}${record.location ? ` · ${record.location}` : ''}`;
    if (resource === 'calendar') {
      const typeLabel = OPTIONS.calendarType.find(([val]) => val === record.type)?.[1] || record.type;
      return `${typeLabel} · ${displayDate(record.date)}${record.endDate ? ` – ${displayDate(record.endDate)}` : ''}${record.description ? ` · ${record.description}` : ''}`;
    }
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
      <nav className="dash__nav" aria-label="Main">
        <Link className="dash__link" to="/dashboard">Dashboard</Link>
        {Object.entries(CONFIG).map(([key, item]) => <Link key={key} className={`dash__link${key === resource ? ' dash__link--active' : ''}`} to={`/${key}`}>{item.title.replace('Weekly ', '').replace('Academic ', '').replace(' Schedule', '')}</Link>)}
        <Link className="dash__link" to="/attendance">Attendance</Link>
        <Link className="dash__link" to="/study-planner">Study Planner</Link>
        <Link className="dash__link" to="/organizer">Organizer</Link>
        <Link className="dash__link" to="/copilot">Copilot</Link>
      </nav>
      <div className="dash__user"><span className="dash__email" title={user.email}>{user.email}</span><button className="btn btn--ghost" onClick={logout}>Log out</button></div>
    </div></header>
    <main className="dash__main"><div className="academic-heading"><div><p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / Academic data</p><h1 className="dash__title">{config.title}</h1><p className="dash__lead">Create, update, and organize your academic information.</p></div>{resource === 'timetable' && orderedRecords.length > 0 && <button type="button" className="btn btn--ghost" onClick={exportTimetableCsv}>Export Timetable (CSV)</button>}</div>
      {error && <div className="alert" role="alert">{error}</div>}
      {resource === 'timetable' && <TimetableImport subjects={subjects} onImported={load} />}
      {(resource === 'calendar' || resource === 'exams' || resource === 'syllabus') && <AcademicImport kind={resource} subjects={subjects} records={records} onImported={load} />}
      <section className="academic-form card" id="timetable-manual-entry"><h2>{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2>
        {(resource === 'timetable' || resource === 'exams' || resource === 'syllabus') && subjects.length === 0 && <p className="academic-note">Add a subject before creating {resource === 'exams' ? 'an exam' : resource === 'syllabus' ? 'syllabus topics' : 'a class'}.</p>}
        <form onSubmit={submit} className="academic-fields">{config.fields.map(renderInput)}<div className="academic-actions"><button className="btn btn--primary" disabled={saving || ((resource === 'timetable' || resource === 'exams' || resource === 'syllabus') && !subjects.length)}>{saving && <Spinner label="Saving" />}{editing ? 'Save changes' : `Add ${config.singular}`}</button>{editing && <button type="button" className="btn btn--ghost" onClick={resetForm}>Cancel edit</button>}</div></form>
      </section>
      {resource === 'syllabus' && <section className="academic-progress card"><h2>Subject progress</h2>{syllabusProgress.length ? syllabusProgress.map(({ subject, total, done, inProgress, percent }) => <div className="progress-row" key={subject._id || subject.id}><div><strong>{subject.name}</strong><span>{done} completed · {inProgress} in progress · {total} topics</span></div><progress value={percent} max="100">{percent}%</progress><b>{percent}%</b></div>) : <p className="empty-state">Add subjects to track syllabus progress.</p>}</section>}
      <section className="academic-list">
        <div className="academic-list__header">
          <h2>{resource === 'timetable' ? 'Week at a glance' : resource === 'exams' ? 'Upcoming and past exams' : `Your ${config.title.toLowerCase()}`}</h2>
          {resource === 'calendar' && (
            <div className="calendar-view-toggle">
              <button type="button" className={`btn ${calendarViewMode === 'monthly' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setCalendarViewMode('monthly')}>Monthly View</button>
              <button type="button" className={`btn ${calendarViewMode === 'list' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setCalendarViewMode('list')}>List View</button>
            </div>
          )}
        </div>
        {loading ? <div className="academic-loading"><Spinner label="Loading" /> Loading your records…</div> : resource === 'calendar' && calendarViewMode === 'monthly' ? (
          <MonthCalendar
            records={records}
            currentDate={calendarDate}
            onMonthChange={setCalendarDate}
            onEdit={editRecord}
            onSelectDate={(d) => {
              setValues((prev) => ({ ...prev, date: d }));
              setEditing(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : orderedRecords.length === 0 ? <div className="empty-state card">No {config.title.toLowerCase()} yet. Add your first {config.singular} above.</div> : resource === 'timetable' ? DAYS.map((day, index) => { const items = orderedRecords.filter((record) => record.weekday === index); return <div className="week-day" key={day}><h3>{day}</h3>{items.length ? items.map((record) => <RecordCard key={record._id || record.id} record={record} title={recordTitle(record)} detail={details(record)} editing={editing} removing={removing} onEdit={editRecord} onRemove={removeRecord} />) : <p className="day-empty">No classes</p>}</div>; }) : orderedRecords.map((record) => <RecordCard key={record._id || record.id} record={record} title={recordTitle(record)} detail={details(record)} editing={editing} removing={removing} onEdit={editRecord} onRemove={removeRecord} />)}
      </section>
    </main>
  </div>;
}

function RecordCard({ record, title, detail, editing, removing, onEdit, onRemove }) {
  const id = record._id || record.id;
  return <article className="academic-record card"><div><h3>{title}</h3><p>{detail}</p></div><div className="academic-record__actions"><button className="btn btn--ghost" onClick={() => onEdit(record)}>Edit</button><button className="btn btn--ghost" onClick={() => onRemove(record)} disabled={removing === id}>{removing === id ? 'Deleting…' : 'Delete'}</button></div></article>;
}

function MonthCalendar({ records, currentDate, onMonthChange, onEdit, onSelectDate }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const firstDay = new Date(year, month, 1);
  const firstDayWeekday = (firstDay.getDay() + 6) % 7;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();

  const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));
  const todayMonth = () => onMonthChange(new Date());

  const eventsByDate = useMemo(() => {
    const map = new Map();
    records.forEach((record) => {
      if (!record.date) return;
      const s = dateInput(record.date);
      const e = dateInput(record.endDate) || s;
      if (!s) return;
      const cur = new Date(`${s}T00:00:00Z`);
      const end = new Date(`${e}T00:00:00Z`);
      while (cur <= end) {
        const dStr = cur.toISOString().slice(0, 10);
        if (!map.has(dStr)) map.set(dStr, []);
        map.get(dStr).push(record);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    });
    return map;
  }, [records]);

  const cells = [];
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    cells.push({ key: `prev-${dayNum}`, dayNum, isOtherMonth: true, dateStr: null, events: [] });
  }
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    cells.push({
      key: `cur-${dayNum}`,
      dayNum,
      isOtherMonth: false,
      dateStr: dStr,
      isToday: dStr === todayStr,
      events: eventsByDate.get(dStr) || [],
    });
  }
  const remainder = cells.length % 7;
  if (remainder > 0) {
    const fill = 7 - remainder;
    for (let i = 1; i <= fill; i++) {
      cells.push({ key: `next-${i}`, dayNum: i, isOtherMonth: true, dateStr: null, events: [] });
    }
  }

  const TYPE_CLASSES = {
    holiday: 'event-chip--holiday',
    'working-saturday': 'event-chip--working-sat',
    'special-working-day': 'event-chip--special-day',
    'cancelled-class': 'event-chip--cancelled',
    'semester-start': 'event-chip--semester',
    'semester-end': 'event-chip--semester',
    exam: 'event-chip--exam',
    deadline: 'event-chip--deadline',
    college: 'event-chip--college',
    event: 'event-chip--event',
  };

  return (
    <div className="month-calendar card">
      <div className="month-calendar__nav">
        <h3 className="month-calendar__title">{monthNames[month]} {year}</h3>
        <div className="month-calendar__controls">
          <button type="button" className="btn btn--ghost" onClick={prevMonth}>&larr; Prev</button>
          <button type="button" className="btn btn--ghost" onClick={todayMonth}>Current</button>
          <button type="button" className="btn btn--ghost" onClick={nextMonth}>Next &rarr;</button>
        </div>
      </div>
      <div className="month-calendar__grid">
        {dayNames.map((d) => (
          <div key={d} className="month-calendar__day-header">{d}</div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={`month-calendar__cell${cell.isOtherMonth ? ' month-calendar__cell--other' : ''}${cell.isToday ? ' month-calendar__cell--today' : ''}`}
          >
            <div className="month-calendar__date-row">
              <span className="month-calendar__day-num">{cell.dayNum}</span>
              {cell.dateStr && (
                <button
                  type="button"
                  className="month-calendar__add-btn"
                  title={`Add event for ${cell.dateStr}`}
                  onClick={() => onSelectDate(cell.dateStr)}
                >
                  +
                </button>
              )}
            </div>
            <div className="month-calendar__events">
              {cell.events.map((evt) => (
                <button
                  key={evt._id || evt.id}
                  type="button"
                  className={`event-chip ${TYPE_CLASSES[evt.type] || 'event-chip--event'}`}
                  title={`${evt.title} (${evt.type}) - Click to edit`}
                  onClick={() => onEdit(evt)}
                >
                  <span className="event-chip__dot" />
                  <span className="event-chip__text">{evt.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
