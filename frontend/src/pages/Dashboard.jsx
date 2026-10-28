import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { OrganizerTaskCard, TaskComposer } from '../components/OrganizerTasks';
import { attendanceApi, organizerApi, studyPlannerApi } from '../lib/api';

const NAV_ITEMS = [
  { label: 'Subjects', to: '/subjects' }, { label: 'Timetable', to: '/timetable' },
  { label: 'Calendar', to: '/calendar' }, { label: 'Exams', to: '/exams' },
  { label: 'Syllabus', to: '/syllabus' }, { label: 'Attendance', to: '/attendance' },
  { label: 'Copilot', to: '/copilot' }, { label: 'Organizer', to: '/organizer' }, { label: 'Study Planner', to: '/study-planner' },
];
const idOf = (value) => value?._id || value?.id || value;
const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const todayDate = () => new Date(`${todayString()}T00:00:00`);
const statusNames = { present: 'Present', absent: 'Absent', cancelled: 'Cancelled' };

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function attendanceLabel(attendance) {
  if (!attendance || attendance.percentage === null) return 'No attendance recorded';
  if (attendance.level === 'below-target') return `Below target · ${attendance.percentage.toFixed(1)}%`;
  if (attendance.level === 'near-target') return `Near target · ${attendance.percentage.toFixed(1)}%`;
  return `On track · ${attendance.percentage.toFixed(1)}%`;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [organizerTasks, setOrganizerTasks] = useState(null);
  const [organizerLoading, setOrganizerLoading] = useState(true);
  const [organizerError, setOrganizerError] = useState('');
  const [organizerNotice, setOrganizerNotice] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [taskSaving, setTaskSaving] = useState('');
  const [studyDashboard, setStudyDashboard] = useState(null);
  const [studyLoading, setStudyLoading] = useState(true);
  const [studyError, setStudyError] = useState('');
  const [studySaving, setStudySaving] = useState('');
  const firstName = user.name.split(' ')[0];
  const date = todayString();
  const labelDate = todayDate();

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setToday(await attendanceApi.today(date));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadOrganizerTasks = useCallback(async () => {
    setOrganizerLoading(true);
    setOrganizerError('');
    try {
      const result = await organizerApi.list({ view: 'dashboard', date });
      setOrganizerTasks(result.tasks);
    } catch (err) {
      setOrganizerError(err.message);
    } finally {
      setOrganizerLoading(false);
    }
  }, [date]);

  const loadStudyDashboard = useCallback(async () => {
    setStudyLoading(true);
    setStudyError('');
    try {
      setStudyDashboard(await studyPlannerApi.dashboard());
    } catch (err) {
      setStudyError(err.message);
    } finally {
      setStudyLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);
  useEffect(() => { loadOrganizerTasks(); }, [loadOrganizerTasks]);
  useEffect(() => { loadStudyDashboard(); }, [loadStudyDashboard]);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  async function savePlan(item, intention) {
    const key = idOf(item.timetableEntry);
    setSaving(key);
    setError('');
    setNotice('');
    try {
      if (intention) await attendanceApi.setIntention(key, date, intention);
      else if (item.plan?._id) await attendanceApi.removeIntention(item.plan._id);
      setNotice(intention === 'attend' ? 'Plan to attend recorded.' : intention === 'miss' ? 'Plan to miss recorded.' : 'Attendance plan removed.');
      await loadToday();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function confirmActual(item, status) {
    const key = idOf(item.timetableEntry);
    setSaving(key);
    setError('');
    setNotice('');
    try {
      await attendanceApi.create({
        subject: idOf(item.subject),
        timetableEntry: key,
        date,
        status,
      });
      setNotice(`${statusNames[status]} attendance recorded for ${item.subject.name}.`);
      await loadToday();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function saveDashboardTask(values) {
    setTaskSaving('new');
    setOrganizerError('');
    setOrganizerNotice('');
    try {
      await organizerApi.create(values);
      setOrganizerNotice('Task created.');
      setAddingTask(false);
      await loadOrganizerTasks();
      return true;
    } catch (err) {
      setOrganizerError(err.message);
      return false;
    } finally {
      setTaskSaving('');
    }
  }

  async function toggleDashboardTask(task) {
    setTaskSaving(String(idOf(task)));
    setOrganizerError('');
    setOrganizerNotice('');
    try {
      await organizerApi.update(idOf(task), { status: task.status === 'completed' ? 'pending' : 'completed' });
      setOrganizerNotice(task.status === 'completed' ? 'Task reopened.' : 'Task marked complete.');
      await loadOrganizerTasks();
    } catch (err) {
      setOrganizerError(err.message);
    } finally {
      setTaskSaving('');
    }
  }

  async function updateStudySession(session, status) {
    setStudySaving(session._id);
    setStudyError('');
    try {
      await studyPlannerApi.updateSession(session._id, { status });
      await loadStudyDashboard();
    } catch (err) {
      setStudyError(err.message);
    } finally {
      setStudySaving('');
    }
  }

  const classes = [...(today?.classes || [])].sort((a, b) => a.timetableEntry.startTime.localeCompare(b.timetableEntry.startTime));
  const warnings = (today?.summaries || []).filter((item) => item.level === 'below-target' || item.level === 'near-target');

  return (
    <div className="dash today-dashboard">
      <header className="dash__bar">
        <div className="dash__bar-inner">
          <Brand />
          <nav className="dash__nav" aria-label="Main">
            <Link className="dash__link dash__link--active" to="/dashboard" aria-current="page">Dashboard</Link>
            {NAV_ITEMS.map((item) => <Link key={item.to} className="dash__link" to={item.to}>{item.label}</Link>)}
          </nav>
          <div className="dash__user">
            <span className="dash__email" title={user.email}>{user.email}</span>
            <button className="btn btn--ghost" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut && <Spinner label="Logging out" />}
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="dash__main">
        <h1 className="dash__title">Today</h1>
        <p className="dash__lead">{greeting()}, {firstName}. {labelDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>

        {error && <div className="alert" role="alert">{error}<button type="button" className="btn btn--ghost" onClick={loadToday}>Retry</button></div>}
        {notice && <p className="success-message" role="status">{notice}</p>}

        {loading ? <div className="today-loading"><Spinner label="Loading today's dashboard" /> Loading today’s classes and attendance…</div> : today && <>
          {today.isHoliday && <section className="today-holiday" role="status">
            <strong>Confirmed holiday: {today.holiday.title}</strong>
            <span>{today.holiday.description || 'Your academic calendar marks today as a holiday.'}</span>
            <Link to="/calendar">View academic calendar</Link>
          </section>}

          <section className="today-section" aria-labelledby="today-classes-title">
            <div className="today-section__heading">
              <div><h2 id="today-classes-title">Today’s classes</h2><p>Plans are intentions only. Record actual attendance separately after class.</p></div>
              <Link className="chip" to="/timetable">Edit timetable</Link>
            </div>
            {classes.length ? <div className="today-class-list">{classes.map((item) => {
              const entryId = idOf(item.timetableEntry);
              const recordStatus = item.record?.status;
              const plan = item.plan?.intention || '';
              const busy = saving === entryId;
              return <article className="today-class card" key={entryId}>
                <div className="today-class__time"><strong>{item.timetableEntry.startTime}</strong><span>to {item.timetableEntry.endTime}</span></div>
                <div className="today-class__details">
                  <h3>{item.subject.name}</h3>
                  <p>{item.subject.code}{item.timetableEntry.location ? ` · ${item.timetableEntry.location}` : ''}{item.timetableEntry.sessionType ? ` · ${item.timetableEntry.sessionType}` : ''}</p>
                  <span className={`today-class__attendance today-class__attendance--${item.attendance?.level || 'no-data'}`}>{attendanceLabel(item.attendance)}</span>
                  {item.attendance?.warning && <p className="today-class__warning">{item.attendance.warning}</p>}
                </div>
                <div className="today-class__actions">
                  <strong className={`today-class__state${recordStatus ? ' today-class__state--actual' : ''}`}>
                    {recordStatus ? statusNames[recordStatus] || 'Recorded' : plan === 'attend' ? 'Plans to attend' : plan === 'miss' ? 'Plans to miss' : 'No plan recorded'}
                  </strong>
                  {!recordStatus && <div className="today-class__plan-actions">
                    <button className="btn btn--ghost" type="button" onClick={() => savePlan(item, 'attend')} disabled={busy}>{plan === 'attend' ? 'Planned to attend' : 'Plan to attend'}</button>
                    <button className="btn btn--ghost" type="button" onClick={() => savePlan(item, 'miss')} disabled={busy}>{plan === 'miss' ? 'Planned to miss' : 'Plan to miss'}</button>
                    {plan && <button className="today-class__clear" type="button" onClick={() => savePlan(item, '')} disabled={busy}>Clear plan</button>}
                    <div className="today-class__actual-actions" aria-label="Record actual attendance after class">
                      <span>After class:</span>
                      <button type="button" onClick={() => confirmActual(item, 'present')} disabled={busy}>Confirm present</button>
                      <button type="button" onClick={() => confirmActual(item, 'absent')} disabled={busy}>Confirm absent</button>
                    </div>
                  </div>}
                  {recordStatus && <Link to="/attendance">Manage attendance</Link>}
                </div>
              </article>;
            })}</div> : <div className="today-empty card">
              <h3>No timetable classes configured for today</h3>
              <p>{today.isHoliday ? 'The calendar also confirms today is a holiday.' : 'Add your weekly classes or use manual entry to set up your timetable.'}</p>
              <Link className="btn btn--primary" to="/timetable">Set up timetable</Link>
            </div>}
          </section>

          <section className="today-section" aria-labelledby="today-attendance-title">
            <div className="today-section__heading"><div><h2 id="today-attendance-title">Attendance to watch</h2><p>Based on confirmed present and absent records only. Plans do not affect these totals.</p></div><Link className="chip" to="/attendance">Attendance details</Link></div>
            {warnings.length ? <div className="today-warning-list">{warnings.map((item) => <article className={`today-warning card today-warning--${item.level}`} key={item.subject.id}>
              <strong>{item.subject.name} ({item.subject.code}) · {item.percentage.toFixed(1)}%</strong>
              <span>{item.warning}</span>
              <small>{item.attended} attended of {item.conducted} conducted · target {item.target}%</small>
            </article>)}</div> : <div className="today-empty card">
              <p>{today.summaries?.some((item) => item.percentage !== null) ? 'No subjects are below or near your attendance target.' : 'No confirmed attendance records yet. Attendance percentages will appear after you record classes.'}</p>
            </div>}
          </section>

          <section className="today-section" aria-labelledby="today-exams-title">
            <div className="today-section__heading"><div><h2 id="today-exams-title">Upcoming examinations</h2><p>From your saved exam schedule.</p></div><Link className="chip" to="/exams">View exams</Link></div>
            {today.upcomingExams.length ? <div className="today-exam-list">{today.upcomingExams.map((exam) => <article className="today-exam card" key={idOf(exam)}>
              <strong>{exam.title}</strong>
              <span>{exam.subject?.name || 'Subject not linked'}{exam.subject?.code ? ` (${exam.subject.code})` : ''}</span>
              <time dateTime={new Date(exam.date).toISOString()}>{new Date(exam.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}{exam.startTime ? ` · ${exam.startTime}–${exam.endTime}` : ''}</time>
            </article>)}</div> : <div className="today-empty card"><p>No upcoming examinations are recorded.</p><Link to="/exams">Open exam schedule</Link></div>}
          </section>

          <section className="today-section today-organizer" aria-labelledby="today-organizer-title">
            <div className="today-section__heading">
              <div><h2 id="today-organizer-title">Tasks and deadlines</h2><p>Your assignments and personal tasks, shared with the Organizer page.</p></div>
              <Link className="chip" to="/organizer">Open Organizer</Link>
            </div>
            {organizerError && <div className="alert" role="alert">{organizerError}<button type="button" className="btn btn--ghost" onClick={loadOrganizerTasks}>Retry</button></div>}
            {organizerNotice && <p className="success-message" role="status">{organizerNotice}</p>}
            <div className="today-organizer__actions"><button className="btn btn--primary" type="button" onClick={() => setAddingTask((current) => !current)}>{addingTask ? 'Close quick add' : 'Quick add task'}</button><Link to="/organizer">Manage all tasks</Link></div>
            {addingTask && <TaskComposer onSave={saveDashboardTask} onCancel={() => setAddingTask(false)} saving={taskSaving === 'new'} />}
            {organizerLoading ? <div className="today-loading"><Spinner label="Loading organizer tasks" /> Loading tasks…</div> : organizerTasks && <>
              {organizerTasks.overdue.length > 0 && <div className="today-organizer__group"><h3>Overdue · {organizerTasks.overdue.length}</h3>{organizerTasks.overdue.map((task) => <OrganizerTaskCard key={idOf(task)} task={task} today={date} compact onToggle={toggleDashboardTask} saving={taskSaving === String(idOf(task))} />)}</div>}
              <div className="today-organizer__group"><h3>Due today · {organizerTasks.today.length}</h3>{organizerTasks.today.length ? organizerTasks.today.map((task) => <OrganizerTaskCard key={idOf(task)} task={task} today={date} compact onToggle={toggleDashboardTask} saving={taskSaving === String(idOf(task))} />) : <p className="today-organizer__empty">No tasks due today.</p>}</div>
              <div className="today-organizer__group"><h3>Upcoming deadlines</h3>{organizerTasks.upcoming.length ? organizerTasks.upcoming.map((task) => <OrganizerTaskCard key={idOf(task)} task={task} today={date} compact onToggle={toggleDashboardTask} saving={taskSaving === String(idOf(task))} />) : <p className="today-organizer__empty">No upcoming deadlines recorded.</p>}</div>
            </>}
          </section>

          <section className="today-section today-study" aria-labelledby="today-study-title">
            <div className="today-section__heading">
              <div><h2 id="today-study-title">Study plan</h2><p>Today's planned sessions and the nearest examination.</p></div>
              <Link className="chip" to="/study-planner">Open Study Planner</Link>
            </div>
            {studyError && <div className="alert" role="alert">{studyError}<button type="button" className="btn btn--ghost" onClick={loadStudyDashboard}>Retry</button></div>}
            {studyLoading ? <div className="today-loading"><Spinner label="Loading study plan" /> Loading study plan…</div> : studyDashboard && <>
              {studyDashboard.nearestExam && <article className="today-study__exam card">
                <div><strong>Nearest exam: {studyDashboard.nearestExam.subject?.name || 'Subject'} · {studyDashboard.nearestExam.title}</strong><span>{new Date(studyDashboard.nearestExam.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
                {studyDashboard.preparation?.total ? <p>{studyDashboard.preparation.completed} of {studyDashboard.preparation.total} syllabus topics completed · {studyDashboard.preparation.percentage}%</p> : <p>No syllabus topics configured for this exam yet. <Link to="/syllabus">Add topics</Link>.</p>}
              </article>}
              {studyDashboard.sessions.length ? <div className="today-study__sessions">{studyDashboard.sessions.map((session) => <article className="today-study__session card" key={session._id}>
                <div><strong>{session.startTime} · {session.subject?.name || 'Subject'} · {session.topic?.topic || session.topicLabel}</strong><span>{session.topic?.unit || ''} · {session.durationMinutes} min</span></div>
                <div className="today-study__actions"><button type="button" onClick={() => updateStudySession(session, 'completed')} disabled={studySaving === session._id}>Complete</button><button type="button" onClick={() => updateStudySession(session, 'skipped')} disabled={studySaving === session._id}>Skip</button></div>
              </article>)}</div> : <div className="today-empty card">
                <p>{studyDashboard.nearestExam ? studyDashboard.hasAvailability ? 'No planned study sessions for today.' : 'Set your available study days and hours to create a plan.' : 'Add an exam to plan study sessions around its date.'}</p>
                <Link to="/study-planner">{studyDashboard.hasAvailability ? 'Review study plan' : 'Configure study availability'}</Link>
              </div>}
              {!studyDashboard.nearestExam && <p className="today-study__empty">No upcoming examination is recorded. <Link to="/exams">Add an exam</Link> to prepare a dated study plan.</p>}
            </>}
          </section>
        </>}

        <section className="grid today-tools" aria-label="Acadova tools">
          {[
            { id: 'subjects', title: 'Subjects', text: 'Manage subject details, instructors, and credits.', to: '/subjects' },
            { id: 'calendar', title: 'Academic Calendar', text: 'Track holidays, deadlines, and college events.', to: '/calendar' },
            { id: 'syllabus', title: 'Syllabus', text: 'Organize topics and track subject-wise progress.', to: '/syllabus' },
            { id: 'study-planner', title: 'Study Planner', text: 'Build a study plan around your confirmed exams, syllabus, and timetable.', to: '/study-planner' },
          ].map((card) => <article key={card.id} className={`card card--${card.id}`}>
            <h2>{card.title}</h2><p>{card.text}</p><Link className="chip" to={card.to}>Open {card.title}</Link>
          </article>)}
        </section>
      </main>
    </div>
  );
}
