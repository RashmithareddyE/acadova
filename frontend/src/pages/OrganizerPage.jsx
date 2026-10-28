import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { OrganizerTaskCard, TaskComposer } from '../components/OrganizerTasks';
import { useAuth } from '../context/AuthContext';
import { organizerApi } from '../lib/api';

const VIEWS = [
  ['all', 'All tasks'], ['today', 'Today'], ['upcoming', 'Upcoming'],
  ['overdue', 'Overdue'], ['completed', 'Completed'],
];
const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard' }, { label: 'Subjects', to: '/subjects' },
  { label: 'Timetable', to: '/timetable' }, { label: 'Calendar', to: '/calendar' },
  { label: 'Organizer', to: '/organizer' }, { label: 'Exams', to: '/exams' }, { label: 'Attendance', to: '/attendance' },
  { label: 'Study Planner', to: '/study-planner' },
];
const idOf = (task) => String(task?._id || task?.id || '');
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function OrganizerPage() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('all');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const today = localToday();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await organizerApi.list({ view, date: today, category, status, priority });
      setTasks(result.tasks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view, today, category, status, priority]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function saveTask(values) {
    setSaving(editing ? idOf(editing) : 'new');
    setError('');
    setNotice('');
    try {
      if (editing) await organizerApi.update(idOf(editing), values);
      else await organizerApi.create(values);
      setEditing(null);
      setAdding(false);
      setNotice(editing ? 'Task updated.' : 'Task created.');
      await loadTasks();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving('');
    }
  }

  async function toggleTask(task) {
    setSaving(idOf(task)); setError(''); setNotice('');
    try {
      await organizerApi.update(idOf(task), { status: task.status === 'completed' ? 'pending' : 'completed' });
      setNotice(task.status === 'completed' ? 'Task reopened.' : 'Task marked complete.');
      await loadTasks();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setSaving(idOf(task)); setError(''); setNotice('');
    try {
      await organizerApi.remove(idOf(task));
      setNotice('Task deleted.');
      await loadTasks();
    } catch (err) { setError(err.message); }
    finally { setSaving(''); }
  }

  return <div className="dash organizer-page">
    <header className="dash__bar"><div className="dash__bar-inner">
      <Link to="/dashboard" aria-label="Acadova dashboard"><Brand /></Link>
      <nav className="dash__nav" aria-label="Main">{NAV_ITEMS.map((item) => <Link key={item.to} className={`dash__link${item.to === '/organizer' ? ' dash__link--active' : ''}`} to={item.to}>{item.label}</Link>)}</nav>
      <div className="dash__user"><span className="dash__email" title={user.email}>{user.email}</span><button className="btn btn--ghost" onClick={logout}>Log out</button></div>
    </div></header>
    <main className="dash__main">
      <div className="academic-heading"><div><p className="eyebrow"><Link to="/dashboard">Dashboard</Link> / Personal Organizer</p><h1 className="dash__title">Personal Organizer</h1><p className="dash__lead">Keep assignments, study tasks, and personal deadlines together.</p></div><button className="btn btn--primary" type="button" onClick={() => { setEditing(null); setAdding(true); }}>Add task</button></div>
      {error && <div className="alert" role="alert">{error}<button className="btn btn--ghost" type="button" onClick={loadTasks}>Retry</button></div>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {adding && <TaskComposer onSave={saveTask} onCancel={() => setAdding(false)} saving={saving === 'new'} />}
      {editing && <TaskComposer key={idOf(editing)} task={editing} onSave={saveTask} onCancel={() => setEditing(null)} saving={saving === idOf(editing)} />}
      <section className="organizer-controls" aria-label="Task filters">
        <div className="organizer-view-tabs" role="tablist" aria-label="Task views">
          {VIEWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'is-active' : ''} onClick={() => { setView(key); if (key === 'completed') setStatus(''); }}>{label}</button>)}
        </div>
        <div className="organizer-filters">
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option><option value="assignment">Assignment</option><option value="study">Study</option><option value="personal">Personal</option><option value="other">Other</option></select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={view !== 'all'}><option value="">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </div>
      </section>
      <section className="organizer-list" aria-live="polite">
        <h2>{VIEWS.find(([key]) => key === view)?.[1]}{!loading && <span> · {tasks.length}</span>}</h2>
        {loading ? <div className="academic-loading"><Spinner label="Loading tasks" /> Loading your tasks…</div> : tasks.length ? <div className="organizer-task-list">{tasks.map((task) => <OrganizerTaskCard key={idOf(task)} task={task} today={today} onToggle={toggleTask} onEdit={(item) => { setAdding(false); setEditing(item); }} onDelete={deleteTask} saving={saving === idOf(task)} />)}</div> : <div className="today-empty card"><h3>No tasks in this view</h3><p>Add an assignment or task to start organizing your deadlines.</p><button className="btn btn--primary" type="button" onClick={() => setAdding(true)}>Add a task</button></div>}
      </section>
    </main>
  </div>;
}
