import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Monitor, Pause, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { MonitoringInstaller } from '../../MonitoringPage';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/DataState';
import { dateTimeLabel, deviceHealth, entityId } from '../../../components/monitoring/monitoring-data';

export function MonitoringDevicesPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const info = useQuery({ queryKey: ['monitoring', 'info'], queryFn: async () => (await api.get('/monitoring/info')).data, retry: false, refetchInterval: 60_000 });
  const employees = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, staleTime: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id], queryFn: async () => (await api.get('/monitoring/devices')).data, refetchInterval: 30_000 });
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const change = useMutation({ mutationFn: async ({ id, next }) => (await api.patch(`/monitoring/devices/${id}`, { status: next })).data,
    onSuccess: () => { setNotice('Device status updated.'); refresh(); } });
  const clean = useMutation({ mutationFn: async (id) => api.delete(`/monitoring/devices/${id}`),
    onSuccess: () => { setNotice('Revoked device removed from the active list. Historical records were preserved.'); refresh(); } });
  const employeeNames = useMemo(() => new Map((employees.data?.items || []).map((employee) => [String(employee._id), employee.name])), [employees.data]);
  const visible = (devices.data?.items || []).filter((device) => (!employeeId || entityId(device.employeeId) === employeeId) && (!status || device.status === status));
  const requestState = (device, next) => {
    if (next === 'revoked' && !window.confirm(`Revoke ${device.name}? The installed agent will lose access and must be enrolled again.`)) return;
    change.mutate({ id: device._id, next });
  };
  const requestClean = (device) => {
    if (window.confirm(`Remove ${device.name} from this list? Historical activity and screenshots remain retained.`)) clean.mutate(device._id);
  };
  const error = devices.error || employees.error;

  return <div className="page-enter">
    <PageHeader eyebrow="Enrollment and operations" title="Devices & Computer Setup" description="Manage enrolled work computers first, then use the approved installer and employee-led pairing flow for new devices." action={<Button variant="secondary" onClick={refresh}><RefreshCw size={16} />Refresh</Button>} />
    <Card className="monitoring-filter-card"><div className="monitoring-filter-grid monitoring-filter-grid--compact"><label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.data?.items?.map((employee) => <option value={employee._id} key={employee._id}>{employee.name}</option>)}</select></label><label>Enrollment status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Awaiting pairing</option><option value="active">Active</option><option value="paused">Paused</option><option value="revoked">Revoked</option></select></label></div></Card>
    {notice && <div className="form-success" role="status">{notice}</div>}
    {(change.isError || clean.isError) && <div className="form-alert" role="alert">{change.error?.message || clean.error?.message}</div>}
    {devices.isLoading && <LoadingState rows={4} />}
    {error && <ErrorState error={error} onRetry={refresh} />}
    {!devices.isLoading && !error && !visible.length && <Card><EmptyState title="No devices in this view" description="Adjust the filters or ask the employee to create a pairing code from their monitoring page." /></Card>}
    <div className="monitoring-device-management">{visible.map((device) => {
      const health = deviceHealth(device);
      return <Card className="monitoring-managed-device" key={device._id}><div className="monitoring-managed-device__main"><span className="monitoring-device-icon"><Monitor size={19} /></span><div><strong>{device.name}</strong><span>{employeeNames.get(entityId(device.employeeId)) || device.employeeId?.name || 'Employee'} · {device.hostname || 'Awaiting pairing'}</span></div><Badge tone={health.tone} dot>{health.label}</Badge></div><div className="monitoring-managed-device__facts"><span><small>Last synchronization</small>{dateTimeLabel(device.lastSeenAt)}</span><span><small>Last activity upload</small>{dateTimeLabel(device.lastUploadAt)}</span><span><small>Activity consent</small>{device.consentAt ? 'Granted' : 'Missing'}</span><span><small>Screenshot consent</small>{device.screenshotConsentAt ? 'Granted' : 'Not granted'}</span></div><div className="monitoring-managed-device__actions">{['active', 'paused'].includes(device.status) && <Button variant="secondary" size="sm" disabled={change.isPending} onClick={() => requestState(device, device.status === 'active' ? 'paused' : 'active')}>{device.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{device.status === 'active' ? 'Pause' : 'Resume'}</Button>}{device.status !== 'revoked' && <Button variant="secondary" size="sm" disabled={change.isPending} onClick={() => requestState(device, 'revoked')}>Revoke</Button>}{device.status === 'revoked' && <Button variant="secondary" size="sm" disabled={clean.isPending} onClick={() => requestClean(device)}>Clean</Button>}</div></Card>;
    })}</div>

    <Card className="monitoring-work-card monitoring-computer-setup"><div className="monitoring-section-heading"><div><span className="eyebrow">Approved distribution</span><h2>Computer setup</h2><p>Employees download the unified graphical application and provide their own consent and pairing code from the Employee Portal.</p></div><Badge tone={info.isSuccess ? 'success' : 'warning'} dot>{info.isSuccess ? 'Installer metadata available' : 'Checking installer'}</Badge></div>{info.isLoading && <LoadingState rows={2} />}{info.isError && <ErrorState error={info.error} onRetry={info.refetch} />}{info.data && <MonitoringInstaller integration={info.data} isHr />}
      <details className="monitoring-browser-setup"><summary>Optional approved Chrome or Edge work-profile tracking</summary><div className="monitoring-setup-detail"><p>Install the official ActivityWatch Web Watcher only in an approved work browser profile. A detected bucket must be verified before it is added to policy. Private browsing events are discarded by the bridge.</p><a href={info.data?.browserWatcherUrl || 'https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi'} target="_blank" rel="noreferrer">Open official browser watcher <ExternalLink size={13} /></a></div></details>
      <div className="monitoring-setup-disclosure"><ShieldCheck size={20} /><p>FaceTrack never exposes ActivityWatch at <code>127.0.0.1:5600</code> to the internet. Employee consent remains mandatory. The graphical desktop controls allow employees to pause, resume or revoke monitoring.</p></div>
    </Card>
  </div>;
}
