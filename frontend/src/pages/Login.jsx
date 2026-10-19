export function Spinner({ label }) {
  return <span className="spinner" role="status" aria-label={label || 'Loading'} />;
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner label="Loading Acadova" />
    </div>
  );
}
