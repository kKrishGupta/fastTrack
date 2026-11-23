import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Check, Copy, Download, ExternalLink, Monitor, Pause, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/DataState';
import '../styles/monitoring.css';
import { MonitoringInsights } from '../components/monitoring/MonitoringInsights';

const time = (seconds = 0) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
const when = (value) => value ? new Date(value).toLocaleString() : 'Not connected';
const fileSize = (bytes) => bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : 'Size unavailable';

export function MonitoringInstaller({ integration, isHr }) {
  const installer = integration?.installer || (integration?.installerUrl ? { url: integration.installerUrl } : null);
  if (!installer?.url) return <div className="form-alert" role="status">The GrabLogger Windows installer has not been published by this server. Ask your administrator for the approved installer; command-line setup is not offered.</div>;
  return <>
    <ol className="monitoring-steps">
      <li>
        <strong>Install GrabLogger</strong>
        <p>Includes official ActivityWatch and the FaceTrack bridge.</p>
        <a href={installer.url} className="monitoring-installer-download">
          Download FaceTrackSetup.exe <Download size={13} />
        </a>
        <div className="monitoring-installer-details">
          <div className="monitoring-installer-meta-row">
            {(installer.version || installer.sizeBytes) && (
              <span className="monitoring-installer-version">
                Version {installer.version || 'unavailable'} · {fileSize(installer.sizeBytes)}
              </span>
            )}
            {installer.signed === false && (
              <span className="monitoring-installer-badge monitoring-installer-badge--unsigned" role="note">
                Unsigned build
              </span>
            )}
          </div>
          {installer.sha256 && (
            <div className="monitoring-installer-hash">
              <span className="monitoring-installer-hash-label">SHA-256</span>
              <code>{installer.sha256}</code>
            </div>
          )}
        </div>
      </li>
      <li>
        <strong>Enroll your work computer</strong>
        <p>Read the disclosure, create a code below and paste it into the visible GrabLogger window.</p>
      </li>
      <li>
        <strong>Use the graphical controls</strong>
        <p>Collectors and synchronization start automatically. Use the desktop window or tray menu to pause, resume, stop or restart monitoring.</p>
      </li>
    </ol>
  </>;
}

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
  const [allPermissionsConsent, setAllPermissionsConsent] = useState(false);
  const [pairing, setPairing] = useState(null);
  const requestedEmployee = searchParams.get('employeeId') || '';
  const employeeId = isHr && /^[a-f\d]{24}$/i.test(requestedEmployee) ? requestedEmployee : '';
  const setEmployeeId = (id) => setSearchParams(id ? { employeeId: id } : {});
  const [hours, setHours] = useState(24);
  const [notice, setNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const integration = useQuery({ queryKey: ['monitoring', 'info'], queryFn: async () => (await api.get('/monitoring/info')).data, retry: false, refetchInterval: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id, employeeId], queryFn: async () => (await api.get('/monitoring/devices', { params: isHr && employeeId ? { employeeId } : {} })).data, refetchInterval: 30_000, enabled: integration.isSuccess });
  const employeeOptions = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, enabled: isHr && integration.isSuccess, staleTime: 60_000 });
  const report = useQuery({ queryKey: ['monitoring', 'report', user?.id, hours, employeeId], queryFn: async () => {
    const end = new Date();
    return (await api.get('/monitoring/report', { params: { start: new Date(end.getTime() - hours * 3600_000).toISOString(), end: end.toISOString(), ...(isHr && employeeId && { employeeId }) } })).data;
  }, refetchInterval: 30_000, enabled: isHr && integration.isSuccess });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['monitoring'] });
  const create = useMutation({ mutationFn: async () => (await api.post('/monitoring/devices', {
    name,
    consent: allPermissionsConsent,
    browserDetailsConsent: allPermissionsConsent,
    screenshotConsent: allPermissionsConsent && Boolean(integration.data?.capabilities?.screenshots),
  })).data,
    onSuccess: (result) => { setPairing(result); setAllPermissionsConsent(false); setCopyNotice(''); refresh(); } });
  const change = useMutation({ mutationFn: async ({ id, status }) => (await api.patch(`/monitoring/devices/${id}`, { status })).data,
    onSuccess: () => { setNotice('Device status updated.'); refresh(); } });
  const clean = useMutation({ mutationFn: async (id) => api.delete(`/monitoring/devices/${id}`),
    onSuccess: () => { setNotice('Revoked device removed from this list.'); refresh(); } });
  const grantConsent = useMutation({ mutationFn: async (id) => (await api.patch(`/monitoring/devices/${id}/consent`, { screenshotConsent: true })).data,
    onSuccess: () => { setNotice('Screenshot consent saved. The device will begin capturing screenshots on the next policy cycle.'); refresh(); } });
  const items = devices.data?.items || [];
  const visibleDevices = items.filter((item) => !isHr || !employeeId || item.employeeId?._id === employeeId);
  const employees = employeeOptions.data?.items || [];
  const employeeNames = new Map(employees.map((employee) => [employee._id, employee.name]));
  const pairingConnected = pairing && items.some((item) => item._id === pairing.item._id && ['active', 'paused'].includes(item.status));
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(pairing.code); setCopyNotice('Pairing code copied.'); }
    catch { setCopyNotice('Select the code above and copy it manually.'); }
  };
  const presence = report.data?.presence || [];
  const seconds = (status) => presence.find((item) => item._id === status)?.seconds || 0;

  return <div className="page-enter monitoring-page">
    <PageHeader eyebrow="ActivityWatch" title="Activity monitoring" description={isHr ? 'Review activity shared by employees and manage enrolled devices.' : 'Choose when to share work activity from your computer.'} />
    {integration.isLoading && <LoadingState />}
    {integration.isError && <ErrorState error={integration.error.status === 404 ? new Error('The connected API has not deployed ActivityWatch yet. Deploy the updated FaceTrack server, then retry.') : integration.error} onRetry={integration.refetch} />}
    <Card className="monitoring-card monitoring-setup">
      <div className="monitoring-row"><div><span className="eyebrow">Computer setup</span><h2>{isHr ? 'Connect employee computers' : 'Connect ActivityWatch to FaceTrack'}</h2></div><Badge tone={integration.isSuccess ? 'success' : 'warning'} dot>{integration.isSuccess ? 'FaceTrack API connected' : 'Checking connection'}</Badge></div>
      <p className="monitoring-muted">{isHr ? 'Each employee completes these steps in their own workspace. Their activity then appears here, scoped to your organization.' : 'Complete this setup on the computer whose work activity you want to share.'}</p>
      <MonitoringInstaller integration={integration.data} isHr={isHr} />
      <details className="monitoring-browser-setup"><summary>Optional Chrome or Edge work-profile website tracking</summary><ol className="monitoring-steps">
        <li><strong>Use an approved work browser profile</strong><p>Do not add the watcher to a personal profile. ActivityWatch Web Watcher v{integration.data?.browserWatcherVersion || '0.6.0'} cannot label Chrome/Edge profiles separately.</p></li>
        <li><strong>Install the official extension</strong><p>Keep GrabLogger running first. Chrome and Edge can install the same official Chrome Web Store extension.</p><a href={integration.data?.browserWatcherUrl || 'https://chromewebstore.google.com/detail/activitywatch-web-watcher/nglaklhklhcoonedhgnpgddginnjdadi'} target="_blank" rel="noreferrer">Open official ActivityWatch Web Watcher <ExternalLink size={13} /></a></li>
        <li><strong>Verify connectivity</strong><p>Open two work websites, wait about one minute and refresh this page. The device must show a detected <code>aw-watcher-web-…</code> bucket. HR then approves that exact bucket; browser upload stays off until approval.</p></li>
      </ol><p className="monitoring-muted">The extension writes only to ActivityWatch on <code>127.0.0.1:5600</code>. FaceTrack never exposes that local API to the internet. Private/incognito events are discarded by the bridge.</p></details>
    </Card>
    <Card className="monitoring-card monitoring-disclosure"><ShieldCheck size={24} /><div><h2>Visible monitoring, with your control</h2><p>FaceTrack receives application names and active/away intervals. Browser data requires an approved work-profile extension and exact bucket approval. Domain sharing is the default. URL paths, queries and page titles require organization configuration plus separate browser consent. Screenshots require private storage, a separate consent below and an enabled organization policy; their interval and retention are always displayed.</p><p>Pause or revoke a device to stop uploads and screenshots. ActivityWatch keeps local records while uploads are paused. Quit the unified package to stop its owned collectors. A separate personal ActivityWatch installation is unaffected.</p></div></Card>

    {!isHr && <Card className="monitoring-card"><h2>Connect your computer</h2><form className="monitoring-connect" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <label>Device name<input value={name} maxLength={100} required onChange={(event) => setName(event.target.value)} /></label>
      <label className="monitoring-checkbox monitoring-master-consent"><input type="checkbox" checked={allPermissionsConsent} onChange={(event) => setAllPermissionsConsent(event.target.checked)} /><span><strong>Grant all monitoring permissions for this work computer</strong><span>By selecting this master checkbox, I explicitly consent to each available permission:</span><ul><li>Application activity and active/away intervals shared with my organization.</li><li>URL details and page titles from an approved work browser profile when I install the official watcher. Personal profiles and private browsing remain excluded.</li>{integration.data?.capabilities?.screenshots && <li>Disclosed screenshots while monitoring is active. Locked screens and excluded applications are skipped, and private retention policy applies.</li>}</ul></span></label>
      <Button type="submit" disabled={!integration.isSuccess || !allPermissionsConsent || !name.trim() || create.isPending}><Monitor size={16} />{create.isPending ? 'Saving policy...' : 'Save policy & create pairing code'}</Button>
    </form>{create.isError && <div role="alert" className="form-alert">{create.error.message}</div>}
    {pairingConnected && <div className="form-success" role="status"><Check size={16} />Computer paired. Keep GrabLogger running; activity will appear after about three minutes.</div>}
    {pairing && !pairingConnected && <div className="monitoring-pairing" role="status"><strong>One-time pairing code</strong><code>{pairing.code}</code><div className="monitoring-actions"><Button variant="secondary" size="sm" onClick={copyCode}><Copy size={14} />Copy code</Button></div>{copyNotice && <p>{copyNotice}</p>}<p>Expires {when(pairing.expiresAt)}. Open the GrabLogger Windows application, paste this code into its enrollment form and select <strong>Connect this computer</strong>. Official collectors and synchronization start automatically after enrollment.</p><Button variant="secondary" onClick={() => setPairing(null)}>Hide code</Button></div>}
    </Card>}

    {isHr && <>
      <div className="monitoring-toolbar">
        <h2><Activity size={20} />Shared activity</h2>
        <div>
          <label>Employee<select aria-label="Filter employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">All employees</option>
          {employeeId && !employees.some((employee) => employee._id === employeeId) && <option value={employeeId}>Selected employee</option>}
          {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}
          </select></label>
          <label>Period<select aria-label="Activity period" value={hours} onChange={(event) => setHours(Number(event.target.value))}><option value={24}>Last 24 hours</option><option value={72}>Last 3 days</option><option value={168}>Last 7 days</option></select></label>
          <Button variant="secondary" onClick={refresh} aria-label="Refresh activity"><RefreshCw size={16} /></Button>
        </div>
      </div>
      {integration.data?.capabilities?.policies && <MonitoringInsights userId={user?.id} isHr employeeId={employeeId} hours={hours} screenshotsAvailable={Boolean(integration.data?.capabilities?.screenshots)} screenshotStorage={integration.data?.screenshotStorage} />}
      {employeeOptions.isError && <ErrorState error={employeeOptions.error} onRetry={employeeOptions.refetch} />}
      {report.isLoading && <LoadingState />}
      {report.isError && <ErrorState error={report.error} onRetry={report.refetch} />}
      {report.data && <><div className="monitoring-stats"><Card className="monitoring-card"><span>Raw non-AFK observations</span><strong>{time(seconds('not-afk'))}</strong></Card><Card className="monitoring-card"><span>Raw AFK observations</span><strong>{time(seconds('afk'))}</strong></Card><Card className="monitoring-card"><span>Enrolled devices</span><strong>{visibleDevices.filter((item) => ['active', 'paused'].includes(item.status)).length}</strong></Card></div>
        <p className="monitoring-muted">Application and website durations include idle time. Active and away time comes from the AFK watcher. Totals add across devices and employees and may overlap. Data can arrive about three minutes later.</p>
        <div className="monitoring-grid"><Ranking title="Applications" items={report.data.applications} /><Ranking title="Websites" items={report.data.websites} /></div></>}
    </>}

    <Card className="monitoring-card"><h2>Devices</h2>{notice && <p role="status">{notice}</p>}{change.isError && <div role="alert" className="form-alert">{change.error.message}</div>}{clean.isError && <div role="alert" className="form-alert">{clean.error.message}</div>}{grantConsent.isError && <div role="alert" className="form-alert">{grantConsent.error.message}</div>}{devices.isLoading && <LoadingState />}{devices.isError && <ErrorState error={devices.error} onRetry={devices.refetch} />}{!devices.isLoading && !devices.isError && !visibleDevices.length && <EmptyState title="No devices in this view" description={isHr ? 'Employees can pair their computer from Activity monitoring in their workspace.' : 'Create a pairing code above to connect the visible sync agent.'} />}
      <div className="monitoring-devices">{visibleDevices.map((item) => {
        const online = item.lastSeenAt && Date.now() - Date.parse(item.lastSeenAt) < 120_000;
        const label = item.status === 'pending' && Date.parse(item.pairingExpiresAt) < Date.now() ? 'Code expired' : item.status === 'active' && !online ? 'Agent offline' : item.status === 'active' && item.activityWatchAvailable === false ? 'ActivityWatch unavailable' : item.status === 'active' ? 'Connected' : item.status;
        const healthy = item.status === 'active' && online && item.activityWatchAvailable !== false;
        const needsScreenshotConsent = !isHr && !item.screenshotConsentAt && ['active', 'paused'].includes(item.status) && integration.data?.capabilities?.screenshots;
        return <article key={item._id}><Monitor size={20} /><div className="monitoring-device-info"><strong>{item.name}</strong><span>{isHr && `${item.employeeId?.name || 'Employee'} · `}{item.hostname || 'Awaiting pairing'}</span><small>Agent contact: {when(item.lastSeenAt)}</small><small>Last activity upload: {when(item.lastUploadAt)}</small>{online && item.activityWatchAvailable === false && <small>Launch ActivityWatch on this computer, then leave the agent open.</small>}{online && item.activityWatchAvailable && !item.watchers?.includes('web.tab.current') && <small>Browser watcher not detected; website tracking is unavailable.</small>}{isHr && item.browserBuckets?.length > 0 && <small>Detected browser bucket candidates: <code>{item.browserBuckets.join(', ')}</code>. Approve only a verified work-profile bucket in policy.</small>}
          {item.screenshotConsentAt && <small className="monitoring-consent-granted">Screenshot consent granted {new Date(item.screenshotConsentAt).toLocaleDateString()}</small>}
          {needsScreenshotConsent && <details className="monitoring-consent-prompt"><summary>Screenshot consent not yet granted for this device</summary><p>This device was enrolled before screenshot storage was configured. Screenshots are disabled for it. Read the disclosure below and grant consent to enable them.</p><p className="monitoring-muted">Disclosed: FaceTrack will capture screenshots at the interval and retention shown in organization policy. Locked screens and excluded applications are always skipped. You can revoke consent by revoking this device.</p><Button size="sm" variant="secondary" disabled={grantConsent.isPending} onClick={() => grantConsent.mutate(item._id)}>Grant screenshot consent for this device</Button></details>}
        </div><Badge tone={healthy ? 'success' : 'warning'}>{label}</Badge><div className="monitoring-actions">{['active', 'paused'].includes(item.status) && <Button size="sm" variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ id: item._id, status: item.status === 'active' ? 'paused' : 'active' })}>{item.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{item.status === 'active' ? 'Pause' : 'Resume'}</Button>}{item.status !== 'revoked' && <Button size="sm" variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ id: item._id, status: 'revoked' })}>Revoke</Button>}{item.status === 'revoked' && <Button size="sm" variant="secondary" disabled={clean.isPending} onClick={() => { if (window.confirm('Remove this revoked device from the list? Historical monitoring records will be preserved.')) clean.mutate(item._id); }}>Clean</Button>}</div></article>;
      })}</div>{devices.data?.items?.length >= 200 && <p>Showing the latest 200 devices.</p>}
    </Card>
    {isHr && <Card className="monitoring-card"><h2>Recent activity</h2><div className="monitoring-table-wrap"><table className="monitoring-table"><thead><tr><th>Time</th><th>Employee</th><th>Type</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{report.data?.recent?.map((event) => <tr key={event._id}><td>{when(event.timestamp)}</td><td>{employeeNames.get(event.employeeId) || 'Employee'}</td><td>{event.type === 'currentwindow' ? 'Application' : event.type === 'afkstatus' ? 'Presence' : 'Website'}</td><td>{event.app || event.domain || event.status}{event.title && <small>{event.title}</small>}</td><td>{Math.round(event.duration)}s</td></tr>)}</tbody></table></div>{!report.isLoading && !report.isError && !report.data?.recent?.length && <p className="monitoring-muted">No activity uploaded for this period.</p>}</Card>}
  </div>;
}
