import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { academicApi, studyPlannerApi } from '../lib/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const idOf = (value) => String(value?._id || value?.id || value || '');
const dateLabel = (value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function initialPreferences() { return { availableHoursPerDay: '', studyStartTime: '', studyEndTime: '', sessionMinutes: 45, breakMinutes: 10, studyDays: [], prioritySubjects: [], commitments: [] }; }
function normalizedPreferences(value = {}) { return { ...initialPreferences(), ...value, availableHoursPerDay: value.availableHoursPerDay ?? '', prioritySubjects: (value.prioritySubjects || []).map(idOf), commitments: value.commitments || [] }; }

function SessionCard({ session, onSave, onDelete, saving }) {
  const [draft, setDraft] = useState({ status: session.status, date: session.date, startTime: session.startTime, durationMinutes: session.durationMinutes });
  const endMinutes = Number(draft.startTime?.slice(0, 2)) * 60 + Number(draft.startTime?.slice(3, 5)) + Number(draft.durationMinutes);
  const endTime = Number.isFinite(endMinutes) ? `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}` : '';
  return <article className={`planner-session card planner-session--${draft.status}`}>
    <div className="planner-session__summary"><strong>{session.subject?.name || 'Subject'} · {session.topicLabel}</strong><span>{session.topic?.unit || ''}{session.exam?.title ? ` · ${session.exam.title}` : ''}</span><span>{draft.startTime}–{endTime} · {draft.durationMinutes} min</span></div>
    <div className="planner-session__controls"><label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value, status: draft.status === 'skipped' ? 'planned' : draft.status })} /></label><label>Start<input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></label><label>Minutes<input type="number" min="15" max="180" step="5" value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} /></label><label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="planned">Planned</option><option value="completed">Completed</option><option value="skipped">Skipped</option></select></label><button className="btn btn--primary" onClick={() => onSave(session._id, draft)} disabled={saving}>{saving ? 'Saving…' : 'Save session'}</button><button className="planner-session__remove" type="button" onClick={() => onDelete(session)} disabled={saving}>Remove session</button></div>
  </article>;
}

export default function StudyPlannerPage() {
  const { user, logout } = useAuth();
  const [preferences, setPreferences] = useState(initialPreferences());
  const [subjects, setSubjects] = useState([]); const [exams, setExams] = useState([]); const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null); const [recommendation, setRecommendation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pref, subjectResult, overviewResult, sessionResult] = await Promise.all([studyPlannerApi.preferences(), academicApi.list('subjects'), studyPlannerApi.overview(), studyPlannerApi.sessions()]);
      setPreferences(normalizedPreferences(pref.preferences)); setSubjects(subjectResult.records || []); setExams(overviewResult.exams || []); setSessions(sessionResult.sessions || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = todayString();
  const completedSessions = sessions.filter((session) => session.status === 'completed');
  const skippedSessions = sessions.filter((session) => session.status === 'skipped');
  const plannedToday = sessions.filter((session) => session.status === 'planned' && session.date === today);
  const upcomingSessions = sessions.filter((session) => session.status === 'planned' && session.date > today);
  const overdueSessions = sessions.filter((session) => session.status === 'planned' && session.date < today);
  const groupByDate = (list) => list.reduce((map, session) => { (map[session.date] ||= []).push(session); return map; }, {});

  function updatePreference(key, value) { setPreview(null); setPreferences((current) => ({ ...current, [key]: value })); }
  function toggleList(key, value) { setPreview(null); setPreferences((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] })); }
  function addCommitment() { updatePreference('commitments', [...preferences.commitments, { label: '', weekday: 0, startTime: '', endTime: '' }]); }
  function updateCommitment(index, key, value) { updatePreference('commitments', preferences.commitments.map((item, i) => i === index ? { ...item, [key]: value } : item)); }

  async function savePreferences(event) {
    event.preventDefault(); setSaving('preferences'); setError(''); setNotice('');
    try {
      const response = await studyPlannerApi.savePreferences({ ...preferences, availableHoursPerDay: Number(preferences.availableHoursPerDay), studyDays: preferences.studyDays.map(Number) });
      setPreferences(normalizedPreferences(response.preferences)); setPreview(null); setNotice('Study preferences saved. Review a new plan preview to apply the changes.');
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function generate() {
    setSaving('preview'); setError(''); setNotice(''); setPreview(null);
    try {
      setPreview(await studyPlannerApi.preview());
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function applyPlan() {
    setSaving('generate'); setError(''); setNotice('');
    try {
      const result = await studyPlannerApi.generate({ confirmed: true, previewHash: preview.previewHash });
      setSessions(result.sessions || []); setSummary(result.summary); setRecommendation(result.recommendation); setPreview(null);
      setNotice('Your reviewed study plan has been saved. Completed and skipped sessions were preserved.');
      const overviewResult = await studyPlannerApi.overview(); setExams(overviewResult.exams || []);
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function saveSession(id, values) {
    setSaving(id); setError(''); setNotice('');
    try { await studyPlannerApi.updateSession(id, values); setNotice('Study session updated.'); await load(); }
    catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function deleteSession(session) {
    if (!window.confirm(`Remove this ${session.status} study session?`)) return;
    setSaving(session._id); setError(''); setNotice('');
    try { await studyPlannerApi.removeSession(session._id); setNotice('Study session removed.'); await load(); }
    catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  function renderSessionGroups(list) {
    const groups = groupByDate(list);
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => <div className="planner-day" key={day}>
      <h3>{dateLabel(day)}</h3>{items.map((session) => <SessionCard key={session._id} session={session} onSave={saveSession} onDelete={deleteSession} saving={saving === session._id} />)}
    </div>);
  }

  return <div className="dash study-planner-page">
    <header className="dash__bar"><div className="dash__bar-inner"><Link to="/dashboard" aria-label="Acadova dashboard"><Brand /></Link><nav className="dash__nav" aria-label="Main"><Link className="dash__link" to="/dashboard">Dashboard</Link><Link className="dash__link" to="/organizer">Organizer</Link><Link className="dash__link" to="/exams">Exams</Link><Link className="dash__link" to="/syllabus">Syllabus</Link><Link className="dash__link" to="/timetable">Timetable</Link><Link className="dash__link dash__link--active" to="/study-planner" aria-current="page">Study Planner</Link></nav><div className="dash__user"><span className="dash__email" title={user.email}>{user.email}</span><button className="btn btn--ghost" onClick={logout}>Log out</button></div></div></header>
    <main className="dash__main">
      <div className="academic-heading"><div><p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / Study Planner</p><h1 className="dash__title">Personalized exam planner</h1><p className="dash__lead">A deterministic study schedule from your confirmed exams, unfinished syllabus, and availability. No generated academic facts.</p></div></div>
      {error && <div className="alert" role="alert">{error}</div>}{notice && <p className="success-message" role="status">{notice}</p>}
      {loading ? <div className="academic-loading"><Spinner label="Loading planner" /> Loading your study plan…</div> : <>
        <section className="planner-exams"><h2>Upcoming exams</h2>{exams.length ? <div className="planner-exam-grid">{exams.map((exam) => <article className="planner-exam card" key={exam._id}><div className="planner-exam__heading"><div><h3>{exam.subject?.name || 'Subject'} · {exam.title}</h3><p>{exam.subject?.code} · {new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p></div><strong>{exam.daysRemaining === 0 ? 'Today' : `${exam.daysRemaining} days`}</strong></div><p>Preparation: {exam.syllabus.completed} of {exam.syllabus.total} completed{exam.syllabus.total ? ` (${Math.round(exam.syllabus.completed * 100 / exam.syllabus.total)}%) · ${exam.syllabus.inProgress} in progress` : ' · no syllabus configured'}</p><p>Study plan: {exam.studyPlanStatus}</p>{exam.syllabus.total === 0 && <p>Add real subject topics on the <Link to="/syllabus">syllabus page</Link>, or <Link to="/organizer">create a manual study task</Link>.</p>}{exam.syllabus.topics.length > 0 && <details><summary>See confirmed topics</summary><ul>{exam.syllabus.topics.map((topic) => <li key={topic.id}>{topic.unit}: {topic.topic} — {topic.progress === 'completed' ? 'Completed' : topic.progress === 'in-progress' ? 'In progress' : 'Not started'}</li>)}</ul></details>}</article>)}</div> : <div className="empty-state card">No upcoming examinations. Add confirmed exams on the <Link to="/exams">exam schedule page</Link>, or <Link to="/organizer">create manual study tasks</Link>.</div>}</section>

        <section className="planner-preferences card"><div><h2>Your study availability</h2><p>Set the times when study is possible. Weekly timetable classes, calendar events, pending assignment due dates, and your listed commitments are blocked from scheduling. Due dates are treated as all-day commitments because assignment work duration is not recorded.</p></div><form onSubmit={savePreferences}>
          <div className="planner-pref-grid"><label>Available study hours per day<input type="number" min="0.5" max="12" step="0.5" required value={preferences.availableHoursPerDay} onChange={(e) => updatePreference('availableHoursPerDay', e.target.value)} /></label><label>Study window starts<input type="time" required value={preferences.studyStartTime} onChange={(e) => updatePreference('studyStartTime', e.target.value)} /></label><label>Study window ends<input type="time" required value={preferences.studyEndTime} onChange={(e) => updatePreference('studyEndTime', e.target.value)} /></label><label>Study session<select value={preferences.sessionMinutes} onChange={(e) => updatePreference('sessionMinutes', Number(e.target.value))}>{[25,30,45,50,60,75,90].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label><label>Break between sessions<select value={preferences.breakMinutes} onChange={(e) => updatePreference('breakMinutes', Number(e.target.value))}>{[5,10,15,20,30].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label></div>
          <fieldset className="planner-days"><legend>Study days</legend>{DAYS.map((day, index) => <label key={day}><input type="checkbox" checked={preferences.studyDays.includes(index)} onChange={() => toggleList('studyDays', index)} />{day}</label>)}</fieldset>
          <fieldset className="planner-priorities"><legend>Priority subjects (used to break urgency ties)</legend>{subjects.length ? subjects.map((subject) => <label key={idOf(subject)}><input type="checkbox" checked={preferences.prioritySubjects.includes(idOf(subject))} onChange={() => toggleList('prioritySubjects', idOf(subject))} />{subject.name}</label>) : <p>Add subjects and exams to configure priority.</p>}</fieldset>
          <div className="planner-commitments"><div className="planner-section-heading"><div><h3>Weekly commitments</h3><p>Activities that occupy a weekday time slot.</p></div><button className="btn btn--ghost" type="button" onClick={addCommitment}>Add commitment</button></div>{preferences.commitments.map((item, index) => <div className="planner-commitment" key={index}><label>Name<input required maxLength="100" value={item.label} onChange={(e) => updateCommitment(index, 'label', e.target.value)} /></label><label>Day<select value={item.weekday} onChange={(e) => updateCommitment(index, 'weekday', Number(e.target.value))}>{DAYS.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label><label>Start<input type="time" required value={item.startTime} onChange={(e) => updateCommitment(index, 'startTime', e.target.value)} /></label><label>End<input type="time" required value={item.endTime} onChange={(e) => updateCommitment(index, 'endTime', e.target.value)} /></label><button className="btn btn--ghost" type="button" aria-label={`Remove ${item.label || 'commitment'}`} onClick={() => updatePreference('commitments', preferences.commitments.filter((_, i) => i !== index))}>Remove</button></div>)}</div>
          <div className="planner-actions"><button className="btn btn--primary" disabled={saving === 'preferences'}>{saving === 'preferences' ? 'Saving…' : 'Save preferences'}</button><button className="btn btn--primary" type="button" onClick={generate} disabled={saving === 'preview' || !exams.length || !preferences.studyDays.length || !preferences.studyStartTime || !preferences.studyEndTime || !preferences.availableHoursPerDay}>{saving === 'preview' ? 'Preparing preview…' : 'Preview study plan'}</button></div>
        </form></section>

        {!preferences.studyDays.length && <div className="planner-warning"><strong>Study availability is not configured.</strong><span>Choose your available days, daily time window, and duration, then save preferences before generating a plan.</span></div>}

        {preview && <section className="planner-preview card" aria-labelledby="planner-preview-title">
          <div className="planner-section-heading"><div><h2 id="planner-preview-title">Review proposed plan</h2><p>Nothing has been changed yet. Review these sessions before confirming.</p></div><button className="btn btn--ghost" type="button" onClick={() => setPreview(null)}>Discard preview</button></div>
          <p>Proposed {preview.summary.scheduledTopics} of {preview.summary.unfinishedTopics} unfinished confirmed syllabus topics. Existing completed/skipped history to preserve: {preview.changes.preservedHistory}.</p>
          {preview.changes.added.length > 0 && <p>{preview.changes.added.length} new session(s) will be added.</p>}
          {preview.changes.moved.length > 0 && <p>{preview.changes.moved.length} existing planned session(s) will move dates.</p>}
          {preview.changes.removed.length > 0 && <div className="planner-warning"><strong>Planned sessions to remove:</strong>{preview.changes.removed.map((item) => <span key={item._id}>{item.topicLabel} · {item.date}</span>)}</div>}
          {preview.summary.unscheduledTopics.length > 0 && <div className="planner-warning"><strong>Limited preparation time:</strong> {preview.summary.unscheduledTopics.length} topic(s) did not fit before their exams.{preview.summary.unscheduledTopics.map((item) => <span key={`${item.subject}-${item.topic}`}>{item.subject} · {item.topic} (exam {item.examDate})</span>)}</div>}
          {preview.summary.assignmentDueDates?.length > 0 && <p className="planner-recommendation">Pending assignment due dates reserved as unavailable days: {preview.summary.assignmentDueDates.join(', ')}.</p>}
          {preview.summary.subjectsWithoutSyllabus.map((item) => <p key={item.subject}>No syllabus topics are available for {item.subject}; no topic sessions were invented. Add a manual study task through the <Link to="/organizer">Organizer</Link>, or add confirmed syllabus topics.</p>)}
          <div className="planner-preview__sessions">{preview.sessions.length ? preview.sessions.map((session, index) => <p key={`${idOf(session.topic)}-${session.date}-${index}`}><strong>{session.date} · {session.startTime}</strong> · {session.subject?.name || 'Subject'} · {session.topicLabel} ({session.durationMinutes} min)</p>) : <p>No topic sessions fit the current availability. Adjust study days/hours or add syllabus topics and review again.</p>}</div>
          <div className="planner-actions"><button className="btn btn--primary" type="button" onClick={applyPlan} disabled={saving === 'generate'}>{saving === 'generate' ? 'Saving reviewed plan…' : 'Confirm and apply this plan'}</button><button className="btn btn--ghost" type="button" onClick={() => setPreview(null)} disabled={saving === 'generate'}>Cancel</button></div>
        </section>}

        {summary && <section className="planner-feedback card"><h2>Last applied plan coverage</h2><p>Scheduled {summary.scheduledTopics} of {summary.unfinishedTopics} unfinished confirmed syllabus topics.</p>{summary.unscheduledTopics.length > 0 && <div className="planner-warning" role="status"><strong>Limited preparation time:</strong> {summary.unscheduledTopics.length} topic(s) did not fit before their examinations. Acadova does not infer topic importance; use your course guidance to decide what to prioritize.{summary.unscheduledTopics.map((item) => <span key={`${item.subject}-${item.topic}`}>{item.subject} · {item.topic} (exam {item.examDate})</span>)}</div>}{summary.subjectsWithoutSyllabus.map((item) => <p key={item.subject}>No syllabus topics are available for {item.subject}; no topic sessions were invented.</p>)}{recommendation?.messages?.map((message) => <p className="planner-recommendation" key={message}><strong>Planner recommendation:</strong> {message}</p>)}</section>}

        <section className="planner-schedule">
          <div className="planner-section-heading"><div><h2>Study sessions</h2><p>Sessions are not marked as syllabus-complete automatically. Update topic progress separately on the <Link to="/syllabus">syllabus page</Link>.</p></div></div>
          <h3 className="planner-list-title">Today's planned sessions</h3>{plannedToday.length ? renderSessionGroups(plannedToday) : <p className="planner-empty-note">No planned study sessions for today.</p>}
          <h3 className="planner-list-title">Upcoming planned sessions</h3>{upcomingSessions.length ? renderSessionGroups(upcomingSessions) : <p className="planner-empty-note">No upcoming planned sessions.</p>}
          {overdueSessions.length > 0 && <><h3 className="planner-list-title">Past planned sessions to review</h3>{renderSessionGroups(overdueSessions)}</>}
          <h3 className="planner-list-title">Completed sessions</h3>{completedSessions.length ? renderSessionGroups(completedSessions) : <p className="planner-empty-note">No completed study sessions recorded yet.</p>}
          {skippedSessions.length > 0 && <><h3 className="planner-list-title">Skipped sessions</h3>{renderSessionGroups(skippedSessions)}</>}
          {!sessions.length && <div className="empty-state card">Configure availability and add an upcoming exam and syllabus topics to preview a schedule. You can create exams, topics, and manual study tasks on the <Link to="/exams">exam schedule</Link>, <Link to="/syllabus">syllabus</Link>, and <Link to="/organizer">Organizer</Link> pages. No paid AI is used.</div>}
        </section>
      </>}
    </main>
  </div>;
}
