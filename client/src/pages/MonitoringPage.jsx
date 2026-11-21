import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Monitor, Pause, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/DataState';
import '../styles/monitoring.css';

const time = (seconds = 0) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
const when = (value) => value ? new Date(value).toLocaleString() : 'Not connected';

function Ranking({ title, items = [] }) {
  const max = Math.max(1, ...items.map((item) => item.seconds));
  return <Card className="monitoring-card"><h2>{title}</h2>{!items.length && <p className="monitoring-muted">No activity in this period.</p>}<div className="monitoring-rankings">{items.map((item) => <div key={item._id}><div className="monitoring-row"><strong>{item._id || 'Unknown'}</strong><span>{time(item.seconds)}</span></div><div className="monitoring-bar"><span style={{ width: `${item.seconds / max * 100}%` }} /></div></div>)}</div></Card>;
}

export function MonitoringPage() {
  const { user } = useAuth();
  const isHr = user?.role === 'HR';
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [name, setName] = useState('My work computer');
  const [consent, setConsent] = useState(false);
  const [pairing, setPairing] = useState(null);
  const requestedEmployee = searchParams.get('employeeId') || '';
  const employeeId = isHr && /^[a-f\d]{24}$/i.test(requestedEmployee) ? requestedEmployee : '';
  const setEmployeeId = (id) => setSearchParams(id ? { employeeId: id } : {});
  const [hours, setHours] = useState(24);
  const [notice, setNotice] = useState('');
  const agentOrigin = new URL(api.defaults.baseURL || '/api', window.location.origin).origin;
  const integration = useQuery({ queryKey: ['monitoring', 'info'], queryFn: async () => (await api.get('/monitoring/info')).data, retry: false, refetchInterval: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id], queryFn: async () => (await api.get('/monitoring/devices')).data, refetchInterval: 30_000, enabled: integration.isSuccess });
  const report = useQuery({ queryKey: ['monitoring', 'report', user?.id, hours, employeeId], queryFn: async () => {
    const end = new Date();
    return (await api.get('/monitoring/report', { params: { start: new Date(end.getTime() - hours * 3600_000).toISOString(), end: end.toISOString(), ...(isHr && employeeId && { employeeId }) } })).data;
  }, refetchInterval: 30_000, enabled: integration.isSuccess });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['monitoring'] });
  const create = useMutation({ mutationFn: async () => (await api.post('/monitoring/devices', { name, consent })).data,
    onSuccess: (result) => { setPairing(result); setConsent(false); refresh(); } });
  const change = useMutation({ mutationFn: async ({ id, status }) => (await api.patch(`/monitoring/devices/${id}`, { status })).data,
    onSuccess: () => { setNotice('Device status updated.'); refresh(); } });
  const items = devices.data?.items || [];
  const visibleDevices = items.filter((item) => !isHr || !employeeId || item.employeeId?._id === employeeId);
  const employees = [...new Map(items.filter((item) => item.employeeId?._id).map((item) => [item.employeeId._id, item.employeeId])).values()];
  const presence = report.data?.presence || [];
  const seconds = (status) => presence.find((item) => item._id === status)?.seconds || 0;

  return <div className="page-enter monitoring-page">
    <PageHeader eyebrow="ActivityWatch" title="Activity monitoring" description={isHr ? 'Review activity shared by employees and manage enrolled devices.' : 'Choose when to share work activity from your computer.'} />
    {integration.isLoading && <LoadingState />}
    {integration.isError && <ErrorState error={integration.error.status === 404 ? new Error('The connected API has not deployed ActivityWatch yet. Deploy the updated FaceTrack server, then retry.') : integration.error} onRetry={integration.refetch} />}
    <Card className="monitoring-card monitoring-disclosure"><ShieldCheck size={24} /><div><h2>Visible monitoring, with your control</h2><p>FaceTrack receives application names, active and away intervals, and website domains. Window titles are optional in the agent. Full browser URLs and screenshots are excluded. Records expire after 30 days. Employees can see their own activity; HR can see activity within this organization.</p><p>Pause or revoke a device below to stop uploads. ActivityWatch continues recording locally; stop its watchers separately to stop local collection.</p></div></Card>

    {!isHr && <Card className="monitoring-card"><h2>Connect your computer</h2><form className="monitoring-connect" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <label>Device name<input value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></label>
      <label className="monitoring-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />I understand the data described above and consent to sharing this computer's activity with my organization.</label>
      <Button type="submit" disabled={!integration.isSuccess || !consent || !name.trim() || create.isPending}><Monitor size={16} />{create.isPending ? 'Creating code...' : 'Create pairing code'}</Button>
    </form>{create.isError && <div role="alert" className="form-alert">{create.error.message}</div>}
    {pairing && <div className="monitoring-pairing" role="status"><strong>One-time pairing code</strong><code>{pairing.code}</code><p>Expires {when(pairing.expiresAt)}. In the project folder on this computer, run:</p><pre>{`node facetrack-sync-agent/index.mjs pair --server ${agentOrigin}`}</pre><p>Paste this code when prompted, then run:</p><pre>node facetrack-sync-agent/index.mjs run</pre><p>Keep the terminal visible. Press P to pause, R to resume, Q to stop. Allow about three minutes for activity to appear.</p><Button variant="secondary" onClick={() => setPairing(null)}>Hide code</Button></div>}
    </Card>}

    <div className="monitoring-toolbar">
      <h2><Activity size={20} />Shared activity</h2>
      <div>
        {isHr && <label>Employee<select aria-label="Filter employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">All employees</option>
          {employeeId && !employees.some((employee) => employee._id === employeeId) && <option value={employeeId}>Selected employee</option>}
          {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
        </select></label>}
        <label>Period<select aria-label="Activity period" value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={24}>Last 24 hours</option><option value={72}>Last 3 days</option><option value={168}>Last 7 days</option></select></label>
        <Button variant="secondary" onClick={refresh} aria-label="Refresh activity"><RefreshCw size={16} /></Button>
      </div>
    </div>
    {report.isLoading && <LoadingState />}
    {report.isError && <ErrorState error={report.error} onRetry={report.refetch} />}
    {report.data && <><div className="monitoring-stats"><Card className="monitoring-card"><span>Active time</span><strong>{time(seconds('not-afk'))}</strong></Card><Card className="monitoring-card"><span>Away time</span><strong>{time(seconds('afk'))}</strong></Card><Card className="monitoring-card"><span>Enrolled devices</span><strong>{visibleDevices.filter((item) => ['active', 'paused'].includes(item.status)).length}</strong></Card></div>
      <p className="monitoring-muted">Application and website durations include idle time. Active and away time comes from the AFK watcher. Totals add across devices and employees and may overlap. Data can arrive about three minutes later.</p>
      <div className="monitoring-grid"><Ranking title="Applications" items={report.data.applications} /><Ranking title="Websites" items={report.data.websites} /></div></>}

    <Card className="monitoring-card"><h2>Devices</h2>{notice && <p role="status">{notice}</p>}{change.isError && <div role="alert" className="form-alert">{change.error.message}</div>}{devices.isLoading && <LoadingState />}{devices.isError && <ErrorState error={devices.error} onRetry={devices.refetch} />}{!devices.isLoading && !devices.isError && !visibleDevices.length && <EmptyState title="No devices in this view" description={isHr ? 'Employees can pair their computer from Activity monitoring in their workspace.' : 'Create a pairing code above to connect the visible sync agent.'} />}
      <div className="monitoring-devices">{visibleDevices.map((item) => {
        const online = item.lastSeenAt && Date.now() - Date.parse(item.lastSeenAt) < 120_000;
        return <article key={item._id}><Monitor size={20} /><div className="monitoring-device-info"><strong>{item.name}</strong><span>{isHr && `${item.employeeId?.name || 'Employee'} · `}{item.hostname || 'Awaiting pairing'}</span><small>Last agent contact: {when(item.lastSeenAt)}</small></div><Badge tone={item.status === 'active' && online ? 'success' : 'warning'}>{item.status === 'active' && !online ? 'Offline' : item.status}</Badge><div className="monitoring-actions">{['active', 'paused'].includes(item.status) && <Button size="sm" variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ id: item._id, status: item.status === 'active' ? 'paused' : 'active' })}>{item.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{item.status === 'active' ? 'Pause' : 'Resume'}</Button>}{item.status !== 'revoked' && <Button size="sm" variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ id: item._id, status: 'revoked' })}>Revoke</Button>}</div></article>;
      })}</div>{devices.data?.items?.length >= 200 && <p>Showing the latest 200 devices.</p>}
    </Card>
    <Card className="monitoring-card"><h2>Recent activity</h2><div className="monitoring-table-wrap"><table className="monitoring-table"><thead><tr><th>Time</th><th>Type</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{report.data?.recent?.map((event) => <tr key={event._id}><td>{when(event.timestamp)}</td><td>{event.type === 'currentwindow' ? 'Application' : event.type === 'afkstatus' ? 'Presence' : 'Website'}</td><td>{event.app || event.domain || event.status}{event.title && <small>{event.title}</small>}</td><td>{Math.round(event.duration)}s</td></tr>)}</tbody></table></div>{!report.isLoading && !report.isError && !report.data?.recent?.length && <p className="monitoring-muted">No activity uploaded for this period.</p>}</Card>
  </div>;
}
