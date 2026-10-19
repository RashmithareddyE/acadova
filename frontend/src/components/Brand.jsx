export function BrandMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#12282b" />
      <path d="M8 24 16 7l8 17" fill="none" stroke="#f2b632" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 19h9" stroke="#f2b632" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Brand({ onDark = false }) {
  return (
    <span className={`brand${onDark ? ' brand--on-dark' : ''}`}>
      <BrandMark />
      <span className="brand__name">Acadova</span>
    </span>
  );
}
