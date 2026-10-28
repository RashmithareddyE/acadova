import { useState } from 'react';
import { parseQuickTask } from '../lib/quickTask';

export const EMPTY_TASK = () => ({
  title: '',
  description: '',
  category: 'assignment',
  dueDate: '',
  dueTime: '',
  priority: 'medium',
  status: 'pending',
});

export function TaskComposer({ task, onSave, onCancel, saving = false }) {
  const [quickText, setQuickText] = useState('');
  const [draft, setDraft] = useState(task ? { ...EMPTY_TASK(), ...task } : EMPTY_TASK());
  const [showForm, setShowForm] = useState(Boolean(task));
  const [dateIssue, setDateIssue] = useState('');

  function parseQuickEntry(event) {
    event.preventDefault();
    const parsed = parseQuickTask(quickText);
    setDraft({ ...EMPTY_TASK(), title: parsed.title, dueDate: parsed.dueDate });
    setDateIssue(parsed.dateIssue);
    setShowForm(true);
  }

  async function submit(event) {
    event.preventDefault();
    await onSave({
      ...draft,
      description: draft.description || '',
      dueTime: draft.dueTime || '',
    });
  }

  return <section className="organizer-composer card" aria-label={task ? 'Edit task' : 'Add a task'}>
    {!task && !showForm && <>
      <h2>Quick add</h2>
      <p>Type a task with a due date, such as “Submit DBMS assignment tomorrow”.</p>
      <form className="organizer-quick-form" onSubmit={parseQuickEntry}>
        <label htmlFor="quick-task-text">Task and due date<input id="quick-task-text" value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="e.g. Complete Computer Networks notes by 30 October" /></label>
        <button className="btn btn--primary" type="submit" disabled={!quickText.trim()}>Review task</button>
      </form>
      <button className="organizer-manual-link" type="button" onClick={() => { setShowForm(true); setDateIssue('Choose the due date manually.'); }}>Enter task details manually</button>
    </>}
    {showForm && <form className="organizer-task-form" onSubmit={submit}>
      <div className="organizer-form-heading"><h2>{task ? 'Edit task' : 'Review and confirm task'}</h2><p>{task ? 'Update your task details.' : 'Check and edit the detected title and date. Saving happens only when you confirm.'}</p></div>
      {dateIssue && <p className="organizer-date-hint" role="status">{dateIssue}</p>}
      <label>Task title<input required maxLength="160" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description <span className="organizer-optional">(optional)</span><textarea rows="2" maxLength="2000" value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="assignment">Assignment</option><option value="study">Study</option><option value="personal">Personal</option><option value="other">Other</option></select></label>
      <label>Due date<input type="date" required value={draft.dueDate || ''} onChange={(event) => { setDraft({ ...draft, dueDate: event.target.value }); setDateIssue(''); }} /></label>
      <label>Due time <span className="organizer-optional">(optional)</span><input type="time" value={draft.dueTime || ''} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></label>
      <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      {task && <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option></select></label>}
      <div className="organizer-form-actions">
        <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : task ? 'Save changes' : 'Confirm and save task'}</button>
        <button className="btn btn--ghost" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>}
  </section>;
}

export function OrganizerTaskCard({ task, today, onToggle, onEdit, onDelete, saving = false, compact = false }) {
  const isOverdue = task.status === 'pending' && task.dueDate < today;
  const date = new Date(`${task.dueDate}T00:00:00`);
  const dateText = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return <article className={`organizer-task card${isOverdue ? ' organizer-task--overdue' : ''}${task.priority === 'high' ? ' organizer-task--high' : ''}${task.status === 'completed' ? ' organizer-task--completed' : ''}${compact ? ' organizer-task--compact' : ''}`}>
    <button className="organizer-task__check" type="button" onClick={() => onToggle(task)} disabled={saving} aria-label={task.status === 'completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>
      {task.status === 'completed' ? '✓' : '○'}
    </button>
    <div className="organizer-task__body">
      <div className="organizer-task__title-row"><h3>{task.title}</h3>{task.priority === 'high' && <span className="organizer-task__priority">High priority</span>}</div>
      <p className="organizer-task__meta"><span>{task.category}</span><span>{isOverdue ? 'Overdue' : task.status === 'completed' ? 'Completed' : 'Due'} {dateText}{task.dueTime ? ` · ${task.dueTime}` : ''}</span></p>
      {task.description && <p className="organizer-task__description">{task.description}</p>}
    </div>
    <div className="organizer-task__actions">
      {onEdit && <button className="btn btn--ghost" type="button" onClick={() => onEdit(task)}>Edit</button>}
      {onDelete && <button className="organizer-task__delete" type="button" onClick={() => onDelete(task)} disabled={saving}>Delete</button>}
    </div>
  </article>;
}
