import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Filter, Search } from 'lucide-react';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/DataState';
import { dateTimeLabel, durationLabel, entityId, eventActivity, eventTypeLabel } from '../../../components/monitoring/monitoring-data';

const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
const toRange = (start, end) => ({ start: new Date(`${start}T00:00:00`).toISOString(), end: new Date(`${end}T23:59:59.999`).toISOString() });

export function MonitoringHistoryPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ employeeId: '', deviceId: '', start: weekAgo(), end: today(), type: '', app: '', search: '', sort: 'desc' });
  const rangeMs = Date.parse(`${filters.end}T23:59:59.999`) - Date.parse(`${filters.start}T00:00:00`);
  const validRange = filters.start && filters.end && rangeMs >= 0 && rangeMs <= 7 * 86400_000;
  const employees = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, staleTime: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id], queryFn: async () => (await api.get('/monitoring/devices')).data, staleTime: 30_000 });
  const applications = useQuery({ queryKey: ['monitoring', 'history-applications', user?.id, filters.employeeId, filters.start, filters.end], enabled: validRange, queryFn: async () => (await api.get('/monitoring/report', { params: { ...toRange(filters.start, filters.end), ...(filters.employeeId && { employeeId: filters.employeeId }) } })).data.applications });
  const timeline = useInfiniteQuery({
    queryKey: ['monitoring', 'history', user?.id, filters],
    enabled: validRange,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => (await api.get('/monitoring/timeline', { params: {
      ...toRange(filters.start, filters.end), limit: 25, sort: filters.sort,
      ...(filters.employeeId && { employeeId: filters.employeeId }), ...(filters.deviceId && { deviceId: filters.deviceId }),
      ...(filters.type && { type: filters.type }), ...(filters.app && { app: filters.app }), ...(filters.search.trim() && { search: filters.search.trim() }),
      ...(pageParam && { cursor: pageParam }),
    } })).data,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
  const employeeNames = useMemo(() => new Map((employees.data?.items || []).map((employee) => [String(employee._id), employee.name])), [employees.data]);
  const deviceNames = useMemo(() => new Map((devices.data?.items || []).map((device) => [String(device._id), device.name])), [devices.data]);
  const filteredDevices = (devices.data?.items || []).filter((device) => !filters.employeeId || entityId(device.employeeId) === filters.employeeId);
  const items = timeline.data?.pages.flatMap((page) => page.items) || [];
  const update = (field, value) => setFilters((current) => ({ ...current, [field]: value, ...(field === 'employeeId' && { deviceId: '' }) }));
  const reset = () => setFilters({ employeeId: '', deviceId: '', start: weekAgo(), end: today(), type: '', app: '', search: '', sort: 'desc' });

  return <div className="page-enter">
    <PageHeader eyebrow="Retained observations" title="Activity History" description="Search and page through authorized monitoring events without loading the entire history at once." />
    <Card className="monitoring-filter-card"><div className="monitoring-history-filters">
      <label>Employee<select value={filters.employeeId} onChange={(event) => update('employeeId', event.target.value)}><option value="">All employees</option>{employees.data?.items?.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
      <label>Device<select value={filters.deviceId} onChange={(event) => update('deviceId', event.target.value)}><option value="">All devices</option>{filteredDevices.map((device) => <option key={device._id} value={device._id}>{device.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.start} max={filters.end} onChange={(event) => update('start', event.target.value)} /></label>
      <label>Through<input type="date" value={filters.end} min={filters.start} max={today()} onChange={(event) => update('end', event.target.value)} /></label>
      <label>Activity type<select value={filters.type} onChange={(event) => update('type', event.target.value)}><option value="">All types</option><option value="currentwindow">Application</option><option value="web.tab.current">Website</option><option value="afkstatus">Presence</option></select></label>
      <label>Application<select value={filters.app} onChange={(event) => update('app', event.target.value)}><option value="">All applications</option>{applications.data?.map((item) => <option key={item._id} value={item._id}>{item._id}</option>)}</select></label>
      <label className="monitoring-history-search">Search<span><Search size={15} /><input type="search" value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="App, domain, title or status" /></span></label>
      <label>Sort<select value={filters.sort} onChange={(event) => update('sort', event.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>
      <Button variant="secondary" onClick={reset}><Filter size={15} />Reset</Button>
    </div>{!validRange && <div className="form-alert" role="alert">Choose a valid date range of no more than seven days.</div>}</Card>

    {timeline.isLoading && <LoadingState rows={6} />}
    {timeline.isError && <ErrorState error={timeline.error} onRetry={timeline.refetch} />}
    {!timeline.isLoading && !timeline.isError && validRange && !items.length && <Card><EmptyState title="No activity found" description="No retained observations match these filters." /></Card>}
    {!!items.length && <Card className="monitoring-work-card monitoring-history-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Results</span><h2>{items.length} observations loaded</h2></div><span>Times shown in your local timezone</span></div><div className="monitoring-table-shell"><table className="monitoring-work-table monitoring-history-table"><thead><tr><th>Observed</th><th>Employee</th><th>Device</th><th>Type</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{items.map((event) => <tr key={event._id}><td data-label="Observed">{dateTimeLabel(event.timestamp)}</td><td data-label="Employee">{employeeNames.get(entityId(event.employeeId)) || 'Employee'}</td><td data-label="Device">{deviceNames.get(entityId(event.deviceId)) || 'Device'}</td><td data-label="Type">{eventTypeLabel(event.type)}</td><td data-label="Activity"><strong>{eventActivity(event)}</strong>{event.title && <small>{event.title}</small>}{event.url && <small>{event.url}</small>}</td><td data-label="Duration">{durationLabel(event.duration)}</td></tr>)}</tbody></table></div>{timeline.hasNextPage && <div className="monitoring-load-more"><Button variant="secondary" disabled={timeline.isFetchingNextPage} onClick={() => timeline.fetchNextPage()}>{timeline.isFetchingNextPage ? 'Loading…' : filters.sort === 'desc' ? 'Load older activity' : 'Load newer activity'}</Button></div>}</Card>}
  </div>;
}
