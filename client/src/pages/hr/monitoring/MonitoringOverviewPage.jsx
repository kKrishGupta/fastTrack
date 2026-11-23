import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, Coffee, Monitor, TriangleAlert, Users, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../../components/ui/DataState';
import { MonitoringFilters, MonitoringKpi, UsageBars } from '../../../components/monitoring/MonitoringUi';
import { dateTimeLabel, deviceHealth, durationLabel, entityId, eventActivity, monitoringRange } from '../../../components/monitoring/monitoring-data';

const emptyReport = { applications: [], websites: [], presence: [], recent: [] };

export function MonitoringOverviewPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [hours, setHours] = useState(24);
  const employees = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, staleTime: 60_000 });
  const devices = useQuery({ queryKey: ['monitoring', 'devices', user?.id], queryFn: async () => (await api.get('/monitoring/devices')).data, refetchInterval: 30_000 });
  const report = useQuery({ queryKey: ['monitoring', 'overview-report', user?.id, employeeId, hours], queryFn: async () => (await api.get('/monitoring/report', { params: { ...monitoringRange(hours), ...(employeeId && { employeeId }) } })).data, refetchInterval: 30_000 });
  const summary = useQuery({ queryKey: ['monitoring', 'overview-summary', user?.id, employeeId, hours], queryFn: async () => (await api.get('/monitoring/summary', { params: { ...monitoringRange(hours), ...(employeeId && { employeeId }) } })).data, refetchInterval: 30_000 });
  const employeeItems = employees.data?.items || [];
  const allDevices = devices.data?.items || [];
  const visibleDevices = employeeId ? allDevices.filter((device) => entityId(device.employeeId) === employeeId) : allDevices;
  const data = report.data || emptyReport;
  const totals = summary.data?.totals || {};
  const rangeStart = Date.now() - hours * 3600_000;
  const recentlyConnected = visibleDevices.filter((device) => deviceHealth(device).key === 'recent').length;
  const monitoredEmployees = new Set(visibleDevices.filter((device) => device.lastUploadAt && Date.parse(device.lastUploadAt) >= rangeStart).map((device) => entityId(device.employeeId)).filter(Boolean)).size;
  const needsAttention = visibleDevices.filter((device) => ['attention', 'stale', 'disconnected', 'unknown', 'enrollment'].includes(deviceHealth(device).key)).length;
  const enrolled = visibleDevices.filter((device) => ['active', 'paused'].includes(device.status)).length;
  const employeeNames = useMemo(() => new Map(employeeItems.map((employee) => [String(employee._id), employee.name])), [employeeItems]);
  const deviceNames = useMemo(() => new Map(allDevices.map((device) => [String(device._id), device.name])), [allDevices]);
  const maxTrend = Math.max(1, ...(summary.data?.days || []).flatMap((day) => [day.active || 0, day.idle || 0]));
  const healthCounts = visibleDevices.reduce((counts, device) => { const key = deviceHealth(device).key; counts[key] = (counts[key] || 0) + 1; return counts; }, {});
  const lastUpdated = Math.max(report.dataUpdatedAt || 0, summary.dataUpdatedAt || 0, devices.dataUpdatedAt || 0);
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const loading = report.isLoading || summary.isLoading || devices.isLoading;
  const firstError = report.error || summary.error || devices.error || employees.error;

  return <div className="page-enter monitoring-overview-page">
    <PageHeader eyebrow="Authorized work activity" title="Activity Monitoring" description="Monitor authorized employee activity, device connectivity and work patterns." />
    <MonitoringFilters employees={employeeItems} employeeId={employeeId} onEmployeeChange={setEmployeeId} hours={hours} onHoursChange={setHours} onRefresh={refresh} refreshing={report.isFetching || summary.isFetching || devices.isFetching} lastUpdated={lastUpdated} />
    {loading && <LoadingState rows={3} />}
    {firstError && <ErrorState error={firstError} onRetry={refresh} />}
    {!loading && !firstError && <>
      <section className="monitoring-kpi-grid" aria-label="Monitoring key metrics">
        <MonitoringKpi icon={Clock3} label="Active time" value={durationLabel(totals.active)} detail="Deduplicated non-AFK time" />
        <MonitoringKpi icon={Coffee} label="Idle time" value={durationLabel(totals.idle)} detail="AFK observations" tone="gold" />
        <MonitoringKpi icon={Monitor} label="Enrolled devices" value={enrolled} detail={`${visibleDevices.length} records in view`} tone="blue" />
        <MonitoringKpi icon={Wifi} label="Recently connected" value={recentlyConnected} detail="Synchronized within 2 minutes" />
        <MonitoringKpi icon={Users} label="Employees with data" value={monitoredEmployees} detail="Uploaded during selected range" tone="purple" />
        <MonitoringKpi icon={TriangleAlert} label="Requires attention" value={needsAttention} detail="Stale, disconnected or incomplete" tone={needsAttention ? 'red' : 'green'} />
      </section>

      <section className="monitoring-dashboard-grid">
        <Card className="monitoring-work-card monitoring-trend-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Activity trends</span><h2>Daily active and idle time</h2></div><span className="monitoring-legend"><i className="is-active" />Active <i className="is-idle" />Idle</span></div>
          {(summary.data?.days || []).length ? <div className="monitoring-trend-chart">{summary.data.days.map((day) => <div className="monitoring-trend-row" key={day.date}><time>{new Date(`${day.date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time><div><span className="monitoring-trend-active" style={{ width: `${Math.max(1, (day.active || 0) / maxTrend * 100)}%` }} title={`Active ${durationLabel(day.active)}`} /><span className="monitoring-trend-idle" style={{ width: `${Math.max(1, (day.idle || 0) / maxTrend * 100)}%` }} title={`Idle ${durationLabel(day.idle)}`} /></div><strong>{durationLabel((day.active || 0) + (day.idle || 0))}</strong></div>)}</div> : <p className="monitoring-empty-copy">No summarized activity in this period.</p>}
        </Card>

        <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Recorded activity</span><h2>Classification breakdown</h2></div></div>
          <div className="monitoring-breakdown">{['productive', 'unproductive', 'neutral', 'unknown'].map((key) => <div key={key}><span>{key}</span><strong>{durationLabel(totals[key])}</strong></div>)}</div>
          <p className="monitoring-note">Classifications follow current organization rules. They are observational categories and do not determine attendance or payroll.</p>
        </Card>
      </section>

      <section className="monitoring-dashboard-grid monitoring-dashboard-grid--lower">
        <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Recent observations</span><h2>Latest activity</h2></div><Link to="/hr/monitoring/history">View all activity</Link></div>
          <div className="monitoring-table-shell"><table className="monitoring-work-table"><thead><tr><th>Time</th><th>Employee</th><th>Device</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{data.recent.slice(0, 8).map((event) => <tr key={event._id}><td>{dateTimeLabel(event.timestamp)}</td><td>{employeeNames.get(entityId(event.employeeId)) || 'Employee'}</td><td>{deviceNames.get(entityId(event.deviceId)) || 'Device'}</td><td><strong>{eventActivity(event)}</strong><small>{event.title || event.type}</small></td><td>{durationLabel(event.duration)}</td></tr>)}</tbody></table></div>
          {!data.recent.length && <p className="monitoring-empty-copy">No activity has been uploaded for this period.</p>}
        </Card>

        <div className="monitoring-overview-stack">
          <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Applications</span><h2>Top applications</h2></div><Link to="/hr/monitoring/analytics">View all</Link></div><UsageBars items={data.applications} limit={5} /></Card>
          <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Coverage</span><h2>Device health</h2></div><Link to="/hr/monitoring/devices">Manage</Link></div><div className="monitoring-health-list"><span><i className="is-good" />Recently synchronized <strong>{healthCounts.recent || 0}</strong></span><span><i className="is-paused" />Paused <strong>{healthCounts.paused || 0}</strong></span><span><i className="is-stale" />Stale or disconnected <strong>{(healthCounts.stale || 0) + (healthCounts.disconnected || 0) + (healthCounts.unknown || 0)}</strong></span><span><i className="is-attention" />Enrollment or collector issue <strong>{(healthCounts.enrollment || 0) + (healthCounts.attention || 0)}</strong></span></div></Card>
        </div>
      </section>
    </>}
  </div>;
}
