import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Monitor, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/DataState';
import { dateTimeLabel, deviceHealth, entityId, eventActivity, eventTypeLabel, monitoringRange } from '../../../components/monitoring/monitoring-data';

const statuses = [
  ['', 'All statuses'], ['recent', 'Recently synchronized'], ['stale', 'Stale'], ['disconnected', 'Disconnected'],
  ['paused', 'Paused'], ['enrollment', 'Awaiting enrollment'], ['attention', 'Requires attention'], ['unknown', 'Unknown'], ['revoked', 'Revoked'],
];

export function MonitoringLivePage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const employees = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, staleTime: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id], queryFn: async () => (await api.get('/monitoring/devices')).data, refetchInterval: 30_000 });
  const report = useQuery({ queryKey: ['monitoring', 'live-report', user?.id], queryFn: async () => (await api.get('/monitoring/report', { params: monitoringRange(24) })).data, refetchInterval: 30_000 });
  const employeeNames = useMemo(() => new Map((employees.data?.items || []).map((employee) => [String(employee._id), employee.name])), [employees.data]);
  const recentByDevice = useMemo(() => {
    const map = new Map();
    for (const event of report.data?.recent || []) if (!map.has(entityId(event.deviceId))) map.set(entityId(event.deviceId), event);
    return map;
  }, [report.data]);
  const filtered = (devices.data?.items || []).filter((device) => (!employeeId || entityId(device.employeeId) === employeeId) && (!status || deviceHealth(device).key === status));
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const firstError = devices.error || employees.error || report.error;

  return <div className="page-enter">
    <PageHeader eyebrow="Operational monitoring" title="Live Activity" description="Review recently synchronized work devices without treating stale heartbeats as live presence." action={<Button variant="secondary" onClick={refresh} disabled={devices.isFetching || report.isFetching}><RefreshCw size={16} />Refresh</Button>} />
    <Card className="monitoring-filter-card"><div className="monitoring-filter-grid monitoring-filter-grid--compact"><label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.data?.items?.map((employee) => <option value={employee._id} key={employee._id}>{employee.name}</option>)}</select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div></Card>
    {(devices.isLoading || report.isLoading) && <LoadingState rows={4} />}
    {firstError && <ErrorState error={firstError} onRetry={refresh} />}
    {!devices.isLoading && !report.isLoading && !firstError && !filtered.length && <Card><EmptyState title="No devices match these filters" description="Adjust the employee or synchronization status filter." /></Card>}
    <div className="monitoring-live-grid">{filtered.map((device) => {
      const health = deviceHealth(device);
      const recent = recentByDevice.get(String(device._id));
      return <Card className="monitoring-live-card" key={device._id}>
        <div className="monitoring-live-card__header"><span className="monitoring-device-icon"><Monitor size={19} /></span><div><strong>{device.name}</strong><small>{employeeNames.get(entityId(device.employeeId)) || device.employeeId?.name || 'Employee'}</small></div><Badge tone={health.tone} dot>{health.label}</Badge></div>
        <dl><div><dt><Wifi size={14} />Last synchronization</dt><dd>{dateTimeLabel(device.lastSeenAt)}</dd></div><div><dt><Activity size={14} />Latest activity upload</dt><dd>{dateTimeLabel(device.lastUploadAt)}</dd></div><div><dt><ShieldCheck size={14} />Consent</dt><dd>{device.consentAt ? 'Activity authorized' : 'Missing'}{device.screenshotConsentAt ? ' · Screenshots authorized' : ''}</dd></div></dl>
        <div className="monitoring-live-recent"><span>Most recent observation</span>{recent ? <><strong>{eventActivity(recent)}</strong><small>{eventTypeLabel(recent.type)} · {dateTimeLabel(recent.timestamp)}</small></> : <p>No retained activity in the last 24 hours.</p>}</div>
        <p className="monitoring-device-source">{device.hostname || 'Computer not paired'}{device.activityWatchAvailable === false ? ' · ActivityWatch unavailable' : ''}</p>
      </Card>;
    })}</div>
  </div>;
}
