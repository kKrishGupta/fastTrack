import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AppWindow, CircleHelp, Coffee, Globe2, ShieldCheck } from 'lucide-react';
import { api } from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../../components/ui/DataState';
import { MonitoringFilters, MonitoringKpi, UsageBars } from '../../../components/monitoring/MonitoringUi';
import { durationLabel, monitoringRange } from '../../../components/monitoring/monitoring-data';

export function MonitoringAnalyticsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [hours, setHours] = useState(24);
  const employees = useQuery({ queryKey: ['monitoring', 'employees', user?.id], queryFn: async () => (await api.get('/monitoring/employees')).data, staleTime: 60_000 });
  const report = useQuery({ queryKey: ['monitoring', 'analytics-report', user?.id, employeeId, hours], queryFn: async () => (await api.get('/monitoring/report', { params: { ...monitoringRange(hours), ...(employeeId && { employeeId }) } })).data, refetchInterval: 30_000 });
  const summary = useQuery({ queryKey: ['monitoring', 'analytics-summary', user?.id, employeeId, hours], queryFn: async () => (await api.get('/monitoring/summary', { params: { ...monitoringRange(hours), ...(employeeId && { employeeId }) } })).data, refetchInterval: 30_000 });
  const totals = summary.data?.totals || {};
  const presence = report.data?.presence || [];
  const presenceSeconds = (status) => presence.find((item) => item._id === status)?.seconds || 0;
  const refresh = () => client.invalidateQueries({ queryKey: ['monitoring'] });
  const error = report.error || summary.error || employees.error;
  const lastUpdated = Math.max(report.dataUpdatedAt || 0, summary.dataUpdatedAt || 0);

  return <div className="page-enter">
    <PageHeader eyebrow="Usage analysis" title="Applications & Websites" description="Analyze authorized application and approved work-browser observations without interpreting activity as work quality." />
    <MonitoringFilters employees={employees.data?.items || []} employeeId={employeeId} onEmployeeChange={setEmployeeId} hours={hours} onHoursChange={setHours} onRefresh={refresh} refreshing={report.isFetching || summary.isFetching} lastUpdated={lastUpdated} />
    {(report.isLoading || summary.isLoading) && <LoadingState rows={4} />}
    {error && <ErrorState error={error} onRetry={refresh} />}
    {!report.isLoading && !summary.isLoading && !error && <>
      <section className="monitoring-kpi-grid monitoring-kpi-grid--four">
        <MonitoringKpi icon={ShieldCheck} label="Productive" value={durationLabel(totals.productive)} detail="Matches productive rules" />
        <MonitoringKpi icon={Activity} label="Unproductive" value={durationLabel(totals.unproductive)} detail="Matches unproductive rules" tone="red" />
        <MonitoringKpi icon={CircleHelp} label="Neutral" value={durationLabel(totals.neutral)} detail="Unmatched classified activity" tone="blue" />
        <MonitoringKpi icon={CircleHelp} label="Unknown" value={durationLabel(totals.unknown)} detail="Incomplete or conflicting intervals" tone="gold" />
      </section>
      <section className="monitoring-analytics-grid">
        <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Application usage</span><h2><AppWindow size={19} />Observed applications</h2></div></div><UsageBars items={report.data?.applications || []} empty="No application observations in this period." /></Card>
        <Card className="monitoring-work-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Approved browser activity</span><h2><Globe2 size={19} />Website domains</h2></div></div><UsageBars items={report.data?.websites || []} empty="No approved work-browser domain observations in this period." /><p className="monitoring-note">Only events from approved browser watcher buckets are included. Detail follows organization policy and employee authorization.</p></Card>
      </section>
      <Card className="monitoring-work-card monitoring-technical-card"><div className="monitoring-section-heading"><div><span className="eyebrow">Technical observations</span><h2>Raw ActivityWatch intervals</h2></div></div><div className="monitoring-technical-metrics"><div><Activity size={19} /><span>Raw non-AFK observations</span><strong>{durationLabel(presenceSeconds('not-afk'))}</strong></div><div><Coffee size={19} /><span>Raw AFK observations</span><strong>{durationLabel(presenceSeconds('afk'))}</strong></div><div><AppWindow size={19} /><span>Application observations</span><strong>{durationLabel((report.data?.applications || []).reduce((sum, item) => sum + item.seconds, 0))}</strong></div><div><Globe2 size={19} /><span>Website observations</span><strong>{durationLabel((report.data?.websites || []).reduce((sum, item) => sum + item.seconds, 0))}</strong></div></div><p className="monitoring-note">Application and website durations can include idle time and overlap across devices. Active and away totals come from the AFK watcher. These technical metrics are not attendance, payroll, or performance scores.</p></Card>
    </>}
  </div>;
}
