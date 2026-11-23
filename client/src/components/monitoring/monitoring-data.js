export const MONITORING_PERIODS = [
  { value: 24, label: 'Last 24 hours' },
  { value: 72, label: 'Last 3 days' },
  { value: 168, label: 'Last 7 days' },
];

export function monitoringRange(hours = 24) {
  const end = new Date();
  return { start: new Date(end.getTime() - hours * 3600_000).toISOString(), end: end.toISOString() };
}

export function durationLabel(seconds = 0) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${value}s`;
}

export const dateTimeLabel = (value) => value ? new Date(value).toLocaleString() : 'Never';
export const shortTimeLabel = (value) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
export const entityId = (value) => String(value?._id || value || '');

export function deviceHealth(device, now = Date.now()) {
  if (device.status === 'revoked') return { key: 'revoked', label: 'Revoked', tone: 'neutral' };
  if (device.status === 'pending') {
    const expired = device.pairingExpiresAt && Date.parse(device.pairingExpiresAt) < now;
    return { key: 'enrollment', label: expired ? 'Code expired' : 'Awaiting pairing', tone: 'warning' };
  }
  if (device.status === 'paused') return { key: 'paused', label: 'Paused', tone: 'warning' };
  if (device.activityWatchAvailable === false) return { key: 'attention', label: 'Collector unavailable', tone: 'danger' };
  if (!device.lastSeenAt) return { key: 'unknown', label: 'No synchronization', tone: 'warning' };
  const age = now - Date.parse(device.lastSeenAt);
  if (age <= 120_000) return { key: 'recent', label: 'Recently synchronized', tone: 'success' };
  if (age <= 15 * 60_000) return { key: 'stale', label: 'Synchronization stale', tone: 'warning' };
  return { key: 'disconnected', label: 'Disconnected', tone: 'danger' };
}

export function eventActivity(event) {
  if (event.type === 'currentwindow') return event.app || 'Unknown application';
  if (event.type === 'web.tab.current') return event.domain || 'Unknown website';
  if (event.type === 'afkstatus') return event.status === 'afk' ? 'Away' : 'Active';
  return 'Unknown activity';
}

export function eventTypeLabel(type) {
  if (type === 'currentwindow') return 'Application';
  if (type === 'web.tab.current') return 'Website';
  if (type === 'afkstatus') return 'Presence';
  return type || 'Activity';
}
