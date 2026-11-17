export const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

export const formatTime = (value) => value
  ? new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—';

export const formatDuration = (minutes) => {
  if (!Number.isFinite(minutes)) return '—';
  return `${Math.floor(minutes / 60)}h ${Math.max(0, Math.round(minutes % 60))}m`;
};

export const titleCase = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
