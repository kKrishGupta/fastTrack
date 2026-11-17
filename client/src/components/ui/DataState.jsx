import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ rows = 4 }) {
  return <div className="skeleton-list" aria-label="Loading data">{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}</div>;
}

export function EmptyState({ title = 'Nothing here yet', description, action }) {
  return (
    <div className="data-state">
      <span className="data-state__icon"><Inbox size={22} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="data-state data-state--error">
      <span className="data-state__icon"><AlertCircle size={22} /></span>
      <h3>We could not load this view</h3>
      <p>{error?.message || 'Please try again.'}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw size={16} />Try again</Button>}
    </div>
  );
}
