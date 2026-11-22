import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ErrorState, LoadingState } from '../ui/DataState';

const time = (seconds = 0) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
const fields = ['version','enabled','includeTitles','browserEnabled','browserUrlMode','browserTitleEnabled','approvedBrowserBuckets','excludedApps','excludedDomains','requireAttendance','retentionDays','screenshotsEnabled','screenshotIntervalSeconds','screenshotRetentionDays','screenshotDisplayMode','screenshotExcludedApps'];

export function MonitoringInsights({ userId, isHr, employeeId, hours, screenshotsAvailable, devices = [] }) {
  const params = () => { const end = new Date(); return { start: new Date(+end - hours * 3600_000).toISOString(), end: end.toISOString(), ...(isHr && employeeId && { employeeId }) }; };
  const summary = useQuery({ queryKey: ['monitoring', 'summary', userId, employeeId, hours], queryFn: async () => (await api.get('/monitoring/summary', { params: params() })).data, refetchInterval: 30_000 });
  const timeline = useInfiniteQuery({ queryKey: ['monitoring', 'timeline', userId, employeeId, hours], initialPageParam: null,
    queryFn: async ({ pageParam }) => (await api.get('/monitoring/timeline', { params: { ...params(), ...(pageParam && { cursor: pageParam }) } })).data,
    getNextPageParam: (last) => last.nextCursor || undefined });
  return <>
    <Card className="monitoring-card"><h2>Authorized activity and productivity</h2><p className="monitoring-muted">Non-AFK activity is counted once per employee across devices. Current organization rules classify observations; these totals do not change attendance or payroll.</p>
      {summary.isLoading && <LoadingState />}{summary.isError && <ErrorState error={summary.error} onRetry={summary.refetch} />}
      {summary.data && <><div className="monitoring-stats">{['active','idle','productive','unproductive','neutral','unknown'].map((name) => <div key={name}><span>{name}</span><strong>{time(summary.data.totals[name])}</strong></div>)}</div><p className="monitoring-muted">Unknown includes conflicting or incomplete observations and can overlap active time. Timezone: {summary.data.timezone}.</p><div className="monitoring-table-wrap"><table className="monitoring-table"><thead><tr><th>Day</th><th>Active</th><th>Idle</th><th>Productive</th><th>Unproductive</th><th>Neutral</th></tr></thead><tbody>{summary.data.days.map((day) => <tr key={day.date}><td>{day.date}</td>{['active','idle','productive','unproductive','neutral'].map((name) => <td key={name}>{time(day[name])}</td>)}</tr>)}</tbody></table></div></>}
    </Card>
    <Card className="monitoring-card"><h2>Activity history</h2>{timeline.isError && <ErrorState error={timeline.error} onRetry={timeline.refetch} />}<div className="monitoring-table-wrap"><table className="monitoring-table"><thead><tr><th>Observed at</th><th>Type</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{timeline.data?.pages.flatMap((page) => page.items).map((event) => <tr key={event._id}><td>{new Date(event.timestamp).toLocaleString()}</td><td>{event.type}</td><td>{event.app || event.domain || event.status}{event.url && <small>{event.url}</small>}{event.title && <small>{event.title}</small>}</td><td>{Math.round(event.duration)}s</td></tr>)}</tbody></table></div>{timeline.hasNextPage && <Button variant="secondary" disabled={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>Load older activity</Button>}{timeline.isLoading && <LoadingState />}</Card>
    {screenshotsAvailable && <ScreenshotGallery userId={userId} isHr={isHr} employeeId={employeeId} hours={hours} devices={devices} />}
    <MonitoringPolicy isHr={isHr} userId={userId} screenshotsAvailable={screenshotsAvailable} />
  </>;
}

function ScreenshotGallery({ userId, isHr, employeeId, hours, devices }) {
  const initialDates = () => { const end = new Date(); return { start: new Date(+end - Math.min(hours, 24 * 31) * 3600_000).toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }; };
  const [selected, setSelected] = useState(null), [deviceId, setDeviceId] = useState(''), [page, setPage] = useState(1);
  const [dates, setDates] = useState(initialDates);
  useEffect(() => { setPage(1); setDeviceId(''); }, [employeeId]);
  const range = () => ({ start: new Date(`${dates.start}T00:00:00`).toISOString(), end: new Date(`${dates.end}T23:59:59.999`).toISOString(), page, limit: 24,
    ...(isHr && employeeId && { employeeId }), ...(deviceId && { deviceId }) });
  const captures = useQuery({ queryKey: ['monitoring','screenshots',userId,employeeId,deviceId,dates.start,dates.end,page], queryFn: async () => (await api.get('/monitoring/screenshots', { params: range() })).data,
    refetchInterval: 60_000, enabled: Boolean(dates.start && dates.end && dates.start <= dates.end) });
  const thumbnails = useQueries({ queries: (captures.data?.items || []).map((item) => ({ queryKey: ['monitoring','screenshot-thumbnail',item._id],
    queryFn: async () => (await api.get(`/monitoring/screenshots/${item._id}/view`)).data, staleTime: 45_000, retry: false })) });
  const view = useMutation({ mutationFn: async (id) => (await api.get(`/monitoring/screenshots/${id}/view`)).data, onSuccess: setSelected });
  const filteredDevices = devices.filter((item) => !employeeId || String(item.employeeId?._id || item.employeeId) === employeeId);
  return <Card className="monitoring-card"><h2>Authorized screenshot gallery</h2><p className="monitoring-muted">Loading a thumbnail or opening an image creates an audit record. Authenticated Cloudinary links expire after one minute.</p>
    <div className="monitoring-gallery-filters"><label>From<input type="date" value={dates.start} onChange={(event) => { setDates({ ...dates, start: event.target.value }); setPage(1); }} /></label><label>Through<input type="date" value={dates.end} onChange={(event) => { setDates({ ...dates, end: event.target.value }); setPage(1); }} /></label><label>Device<select value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setPage(1); }}><option value="">All devices</option>{filteredDevices.map((item) => <option key={item._id} value={item._id}>{item.name}{isHr && item.employeeId?.name ? ` — ${item.employeeId.name}` : ''}</option>)}</select></label></div>
    {captures.isLoading && <LoadingState />}{captures.isError && <ErrorState error={captures.error} onRetry={captures.refetch} />}
    <div className="monitoring-screenshot-grid">{captures.data?.items.map((item, index) => <button type="button" key={item._id} onClick={() => view.mutate(item._id)}>{thumbnails[index]?.data?.viewUrl ? <img src={thumbnails[index].data.viewUrl} alt="Authorized work screenshot thumbnail" loading="lazy" /> : <span className="monitoring-thumbnail-placeholder">Private preview</span>}{isHr && <strong>{item.employeeId?.name || 'Employee'}</strong>}<span>{new Date(item.capturedAt).toLocaleString()}</span><small>{item.width} × {item.height} · {Math.ceil(item.byteLength / 1024)} KB · retained until {new Date(item.expiresAt).toLocaleDateString()}</small></button>)}</div>
    {captures.data?.pages > 1 && <div className="monitoring-pagination"><Button variant="secondary" disabled={page <= 1 || captures.isFetching} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {captures.data.page} of {captures.data.pages} · {captures.data.total} captures</span><Button variant="secondary" disabled={page >= captures.data.pages || captures.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    {view.isError && <ErrorState error={view.error} />}{selected?.viewUrl && <figure className="monitoring-screenshot-view"><img src={selected.viewUrl} alt={`Employee work screenshot captured ${new Date(selected.item.capturedAt).toLocaleString()}`} /><figcaption>Capture retained until {new Date(selected.item.expiresAt).toLocaleString()}. Delivery access expires {new Date(selected.expiresAt).toLocaleTimeString()}.</figcaption></figure>}
    {!captures.isLoading && !captures.data?.items.length && <p className="monitoring-muted">No retained screenshots in this period.</p>}
  </Card>;
}

function MonitoringPolicy({ isHr, userId, screenshotsAvailable }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(null), [rule, setRule] = useState({ kind: 'app', match: '', classification: 'neutral' });
  const policy = useQuery({ queryKey: ['monitoring', 'policy', userId], queryFn: async () => (await api.get('/monitoring/policy')).data.item });
  const rules = useQuery({ queryKey: ['monitoring', 'rules', userId], queryFn: async () => (await api.get('/monitoring/rules')).data.items });
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const save = useMutation({ mutationFn: async () => api.put('/monitoring/policy', Object.fromEntries(fields.map((field) => [field, (draft || policy.data)[field]]))), onSuccess: () => { setDraft(null); refresh(); } });
  const add = useMutation({ mutationFn: async () => api.post('/monitoring/rules', rule), onSuccess: () => { setRule({ ...rule, match: '' }); refresh(); } });
  const remove = useMutation({ mutationFn: async (id) => api.delete(`/monitoring/rules/${id}`), onSuccess: refresh });
  const value = draft || policy.data;
  const edit = (field, next) => setDraft({ ...value, [field]: next });
  return <Card className="monitoring-card"><h2>Organization monitoring policy</h2>{policy.isLoading && <LoadingState />}{policy.isError && <ErrorState error={policy.error} onRetry={policy.refetch} />}
    {value && <><p>Policy revision {value.version}. Activity retention: {value.retentionDays} days. Screenshots are {screenshotsAvailable ? (value.screenshotsEnabled ? `enabled every ${value.screenshotIntervalSeconds} seconds with ${value.screenshotRetentionDays}-day retention` : 'available but disabled') : 'unavailable until private storage is configured'}.</p>{isHr ? <form className="monitoring-connect" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      {[['enabled','Allow activity sharing'],['includeTitles','Allow optional non-browser window titles'],['browserEnabled','Allow separately authorized work browser buckets'],['browserTitleEnabled','Allow page titles for separately consenting devices'],['requireAttendance','Accept only checked-in attendance sessions']].map(([field,label]) => <label className="monitoring-checkbox" key={field}><input type="checkbox" checked={value[field]} onChange={(event) => edit(field,event.target.checked)} />{label}</label>)}
      <label>Browser URL detail<select value={value.browserUrlMode} onChange={(event) => edit('browserUrlMode',event.target.value)}><option value="domain">Domain only</option><option value="origin">Scheme and domain</option><option value="path">URL path, no query or fragment</option><option value="full">Full URL including query</option></select></label>
      <label>Retention days<input type="number" min="1" max="90" value={value.retentionDays} onChange={(event) => edit('retentionDays',Number(event.target.value))} /></label>
      <label className="monitoring-checkbox"><input type="checkbox" disabled={!screenshotsAvailable} checked={value.screenshotsEnabled} onChange={(event) => edit('screenshotsEnabled',event.target.checked)} />Enable screenshots only for separately consenting devices</label>
      <label>Screenshot interval (seconds)<input type="number" min="60" max="3600" disabled={!screenshotsAvailable} value={value.screenshotIntervalSeconds} onChange={(event) => edit('screenshotIntervalSeconds',Number(event.target.value))} /></label>
      <label>Screenshot retention days<input type="number" min="1" max="30" disabled={!screenshotsAvailable} value={value.screenshotRetentionDays} onChange={(event) => edit('screenshotRetentionDays',Number(event.target.value))} /></label>
      <label>Screenshot displays<select disabled={!screenshotsAvailable} value={value.screenshotDisplayMode} onChange={(event) => edit('screenshotDisplayMode',event.target.value)}><option value="primary">Primary display only</option><option value="all">All displays</option></select></label>
      {[['approvedBrowserBuckets','Approved work browser bucket IDs'],['excludedApps','Excluded application EXE names'],['excludedDomains','Excluded website domains']].map(([field,label]) => <label key={field}>{label} (one per line)<textarea rows="3" value={value[field].join('\n')} onChange={(event) => edit(field,event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} /></label>)}
      <label>Screenshot excluded application EXE names (one per line)<textarea rows="3" disabled={!screenshotsAvailable} value={value.screenshotExcludedApps.join('\n')} onChange={(event) => edit('screenshotExcludedApps',event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} /></label>
      <p className="monitoring-muted">A bucket ID alone does not identify a browser profile. IT must confirm a work-only source before approval. Never approve a bucket shared with personal profiles. Retention changes affect new uploads; existing records keep their original expiry.</p><Button type="submit" disabled={save.isPending || !draft}>Save policy</Button>{save.isError && <div role="alert">{save.error.message}</div>}{save.isSuccess && <p role="status">Policy saved.</p>}
    </form> : <p>Activity sharing is {value.enabled ? 'enabled' : 'disabled'}. Browser sharing is {value.browserEnabled ? `restricted to approved work buckets (${value.browserUrlMode} URL detail${value.browserTitleEnabled ? ', page titles allowed for consenting devices' : ''})` : 'disabled'}. {value.requireAttendance && 'Only checked-in sessions are eligible.'}</p>}</>}
    <h3>Productivity classifications</h3><p className="monitoring-muted">Unmatched activity is neutral. Domain rules include subdomains; the most specific domain wins.</p>{rules.isError && <ErrorState error={rules.error} onRetry={rules.refetch} />}
    {rules.data?.map((item) => <div className="monitoring-row" key={item._id}><span>{item.kind}: {item.match} — {item.classification}</span>{isHr && <Button size="sm" variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate(item._id)}>Remove</Button>}</div>)}{remove.isError && <div role="alert">{remove.error.message}</div>}
    {isHr && <form className="monitoring-connect" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}><label>Rule type<select value={rule.kind} onChange={(event) => setRule({ ...rule, kind:event.target.value })}><option value="app">Application EXE</option><option value="domain">Website domain</option></select></label><label>Exact EXE or domain<input required maxLength={300} value={rule.match} onChange={(event) => setRule({ ...rule, match:event.target.value })} /></label><label>Classification<select value={rule.classification} onChange={(event) => setRule({ ...rule, classification:event.target.value })}>{['neutral','productive','unproductive'].map((item) => <option key={item}>{item}</option>)}</select></label><Button type="submit" disabled={add.isPending}>Save rule</Button>{add.isError && <div role="alert">{add.error.message}</div>}</form>}
  </Card>;
}
