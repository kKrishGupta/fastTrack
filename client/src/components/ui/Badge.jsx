export function Badge({ tone = 'neutral', dot = false, children, className = '' }) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
