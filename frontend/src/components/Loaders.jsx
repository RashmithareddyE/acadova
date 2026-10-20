export function Spinner({ label = 'Loading' }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label={label}
    />
  );
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner label="Loading Acadova" />
    </div>
  );
}