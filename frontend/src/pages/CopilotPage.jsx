import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';
import { copilotApi } from '../lib/api';

const SUGGESTIONS = [
  'What classes do I have today?',
  'Check my attendance',
  'Upcoming exams',
  'Pending assignments',
  'What should I study today?',
];

const WELCOME_TEXT = 'I can help with your timetable, attendance, exams, tasks, syllabus progress, and study plan.';

export default function CopilotPage() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', text: WELCOME_TEXT },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function sendQuestion(question) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const userMessage = { role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', text: 'Thinking…' }]);
    setDraft('');
    setSending(true);
    setError('');

    try {
      const result = await copilotApi.ask(trimmed);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', text: result.answer || 'I could not answer that question yet.', actions: result.actions || [] };
        return next;
      });
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', text: err.message || 'Something went wrong. Please try again.' };
        return next;
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendQuestion(draft);
  }

  function handleInputKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(draft);
    }
  }

  return (
    <div className="copilot-page dash">
      <header className="dash__bar">
        <div className="dash__bar-inner">
          <Brand />
          <nav className="dash__nav" aria-label="Main navigation">
            <Link className="dash__link" to="/dashboard">Dashboard</Link>
            <Link className="dash__link dash__link--active" to="/copilot" aria-current="page">Copilot</Link>
          </nav>
          <div className="dash__user">
            <span className="dash__email" title={user.email}>{user.email}</span>
            <button className="btn btn--ghost" type="button" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="copilot-shell">
        <section className="copilot-panel">
          <div className="copilot-header">
            <div className="copilot-header__icon" aria-hidden="true">✦</div>
            <div>
              <p className="copilot-kicker">Acadova Copilot</p>
              <h1>Your personal academic companion.</h1>
            </div>
          </div>

          <div className="copilot-suggestions" aria-label="Suggested questions">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} type="button" className="copilot-chip" onClick={() => sendQuestion(suggestion)} disabled={sending}>
                {suggestion}
              </button>
            ))}
          </div>

          <div className="copilot-thread" role="log" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`copilot-message copilot-message--${message.role}`}>
                <div className="copilot-message__bubble">
                  <p>{message.text}</p>
                  {message.actions && message.actions.length > 0 && (
                    <div className="copilot-message__actions">
                      {message.actions.map((action) => (
                        <Link key={`${action.label}-${action.to || action.href || 'action'}`} className="copilot-action" to={action.to || '/dashboard'}>
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="alert" role="alert">{error}</div>}

          <form className="copilot-composer" onSubmit={handleSubmit}>
            <label className="copilot-composer__label" htmlFor="copilot-question">Ask Acadova Copilot</label>
            <div className="copilot-composer__row">
              <textarea
                id="copilot-question"
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about your timetable, attendance, exams, tasks, syllabus, or study plan..."
                rows={3}
                disabled={sending}
              />
              <button type="submit" className="btn btn--primary copilot-send" disabled={sending || !draft.trim()}>
                {sending ? <Spinner label="Sending" /> : 'Send'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
