import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { Spinner } from '../components/Loaders';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = ['Attendance', 'Exams', 'Assignments', 'Notepad', 'Copilot'];

// Placeholders only: functionality arrives in later phases.
const CARDS = [
  { id: 'attendance', title: 'Attendance', text: 'See where you stand in every subject and how many classes you can safely miss.' },
  { id: 'exams', title: 'Exam Planner', text: 'Turn exam dates and syllabus into a study plan that adapts when your week changes.' },
  { id: 'assignments', title: 'Assignments', text: 'Keep every deadline, priority and submission in one list.' },
  { id: 'notepad', title: 'Notepad', text: 'Capture quick notes and turn them into tasks.' },
  {
    id: 'copilot',
    title: 'Acadova Copilot',
    text: 'Ask about your attendance, exams or deadlines and get answers based on your own academic data.',
    featured: true,
  },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const firstName = user.name.split(' ')[0];

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <div className="dash">
      <header className="dash__bar">
        <div className="dash__bar-inner">
          <Brand />
          <nav className="dash__nav" aria-label="Main">
            <Link className="dash__link dash__link--active" to="/dashboard" aria-current="page">
              Dashboard
            </Link>
            {NAV_ITEMS.map((item) => (
              <span key={item} className="dash__link dash__link--soon" aria-disabled="true" title="Coming soon">
                {item}
              </span>
            ))}
          </nav>
          <div className="dash__user">
            <span className="dash__email" title={user.email}>
              {user.email}
            </span>
            <button className="btn btn--ghost" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? <Spinner label="Logging out" /> : null}
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="dash__main">
        <h1 className="dash__title">
          {greeting()}, {firstName}.
        </h1>
        <p className="dash__lead">Your account is ready. These tools will appear here as Acadova grows.</p>

        <section className="grid" aria-label="Acadova tools">
          {CARDS.map((card) => (
            <article key={card.id} className={`card card--${card.id}${card.featured ? ' card--featured' : ''}`}>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
              <span className="chip">Coming soon</span>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
