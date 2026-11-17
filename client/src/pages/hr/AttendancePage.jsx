import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Download, LocateFixed, Search, TimerReset, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { minutesFor } from '../../components/attendance/AttendanceCalendar';
import { hrService } from '../../services/hrService';
import { formatDateTime, formatDuration, titleCase } from '../../utils/formatters';

export function AttendancePage() {
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const attendance = useQuery({ queryKey: ['hr', 'attendance', { limit: 100 }], queryFn: () => hrService.attendance({ limit: 100 }), refetchInterval: 30_000 });
  const filtered = useMemo(() => (attendance.data?.items ?? []).filter((item) => {
    const matchesSearch = item.employeeId?.name?.toLowerCase().includes(search.toLowerCase()) || item.employeeId?.employeeCode?.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !date || item.attendanceDate === date;
    return matchesSearch && matchesDate;
  }), [attendance.data, search, date]);
  const working = filtered.filter((item) => item.sessionStatus === 'working').length;
  const completed = filtered.filter((item) => item.sessionStatus === 'completed').length;
  const totalMinutes = filtered.reduce((sum, item) => sum + (minutesFor(item, now) || 0), 0);
  const people = new Set(filtered.map((item) => item.employeeId?._id)).size;

  const exportCsv = () => {
    const rows = [['Employee', 'Employee ID', 'Office', 'Check in', 'Check out', 'Minutes', 'Distance m', 'GPS accuracy m', 'Status'], ...filtered.map((item) => [item.employeeId?.name, item.employeeId?.employeeCode, item.officeId?.name, item.checkInAt, item.checkOutAt ?? '', minutesFor(item, now) ?? '', item.locationVerification?.distanceMeters ?? '', item.locationVerification?.accuracyMeters ?? '', item.sessionStatus])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `attendance-${date || new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  };

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Operations" title="Attendance monitoring" description="Live server timing, working hours, attendance days and verified office-location evidence." action={<Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}><Download size={17} />Export CSV</Button>} />
      <div className="attendance-admin-kpis"><Card><span><Users size={18} /></span><div><small>Employees</small><strong>{people}</strong></div></Card><Card><span><LocateFixed size={18} /></span><div><small>Working now</small><strong>{working}</strong></div></Card><Card><span><CalendarDays size={18} /></span><div><small>Completed days</small><strong>{completed}</strong></div></Card><Card><span><Clock3 size={18} /></span><div><small>Total working time</small><strong>{formatDuration(totalMinutes)}</strong></div></Card></div>
      <Card className="table-card attendance-monitor-card">
        <div className="table-toolbar attendance-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or ID" /></label><label className="date-filter"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{date && <Button size="sm" variant="secondary" onClick={() => setDate('')}>All dates</Button>}<Badge tone="neutral">{filtered.length} records</Badge></div>
        {attendance.isLoading && <LoadingState />}{attendance.isError && <ErrorState error={attendance.error} onRetry={attendance.refetch} />}{!attendance.isLoading && !attendance.isError && !filtered.length && <EmptyState title="No attendance records" description={search || date ? 'No records match these filters.' : 'Verified check-ins will appear here.'} />}
        {!!filtered.length && <div className="table-wrap"><table className="data-table attendance-data-table"><thead><tr><th>Employee</th><th>Verified location</th><th>Check in</th><th>Check out</th><th>Working time</th><th>State</th></tr></thead><tbody>{filtered.map((item) => <tr key={item._id}><td><strong className="cell-primary">{item.employeeId?.name || 'Employee'}</strong><span className="cell-secondary">{item.employeeId?.employeeCode || '—'} · {item.attendanceDate}</span></td><td><strong className="cell-primary">{item.workMode === 'WFH' ? 'Approved WFH location' : item.officeId?.name || '—'}</strong><span className="cell-secondary">{Number.isFinite(item.locationVerification?.distanceMeters) ? `${Math.round(item.locationVerification.distanceMeters)} m from center` : 'Legacy record'}{Number.isFinite(item.locationVerification?.accuracyMeters) ? ` · ±${Math.round(item.locationVerification.accuracyMeters)} m GPS` : ''}</span></td><td><strong className="cell-primary">{formatDateTime(item.checkInAt)}</strong><span className="cell-secondary">Server timestamp</span></td><td><strong className="cell-primary">{formatDateTime(item.checkOutAt)}</strong><span className="cell-secondary">{item.checkOutAt ? 'Session completed' : 'Awaiting checkout'}</span></td><td><strong className="working-time"><TimerReset size={15} />{formatDuration(minutesFor(item, now))}</strong><span className="cell-secondary">{item.sessionStatus === 'working' ? 'Updating live' : 'Final duration'}</span></td><td><Badge tone={item.sessionStatus === 'working' ? 'success' : 'neutral'} dot>{item.workMode === 'WFH' ? 'WFH · ' : ''}{titleCase(item.sessionStatus)}</Badge></td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}
