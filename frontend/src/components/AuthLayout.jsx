import Brand from './Brand';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth__aside">
        <Brand onDark />
        <div className="auth__pitch">
          <h2>Attendance, exams and deadlines in one place.</h2>
          <p>Acadova keeps your academic life organised so you always know what to do next.</p>
        </div>
      </aside>
      <main className="auth__main">
        <div className="auth__mobile-brand">
          <Brand />
        </div>
        <div className="auth__card">
          <h1>{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
          <p className="auth__footer">{footer}</p>
        </div>
      </main>
    </div>
  );
}
