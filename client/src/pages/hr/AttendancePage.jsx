import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CalendarDays, Clock3, Download, LocateFixed, Search, Settings2, TimerReset, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { minutesFor } from '../../components/attendance/AttendanceCalendar';
import { hrService } from '../../services/hrService';
import { formatDateTime, formatDuration, titleCase } from '../../utils/formatters';

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const DEFAULT_POLICY = {
  workingDays: [1, 2, 3, 4, 5],
  checkInWindowStart: '09:00',
  checkInWindowEnd: '09:30',
  expectedCheckOutTime: '18:00',
  standardWorkMinutes: 540,
  overtimeEnabled: true,
  overtimeAfterMinutes: 540,
};

function timingTone(item) {
  if (item.sessionStatus === 'working') return 'success';
  if (item.timingStatus === 'early_exit') return 'danger';
  if (item.timingStatus === 'overtime') return 'warning';
  return 'neutral';
}

export function AttendancePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [now, setNow] = useState(Date.now());
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState(DEFAULT_POLICY);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const attendance = useQuery({ queryKey: ['hr', 'attendance', { limit: 100 }], queryFn: () => hrService.attendance({ limit: 100 }), refetchInterval: 30_000 });
  const policy = useQuery({ queryKey: ['hr', 'attendance-policy'], queryFn: hrService.attendancePolicy });
  useEffect(() => { if (policy.data?.policy) setPolicyForm(policy.data.policy); }, [policy.data]);
  const updatePolicy = useMutation({
    mutationFn: hrService.updateAttendancePolicy,
    onSuccess: (data) => {
      queryClient.setQueryData(['hr', 'attendance-policy'], data);
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance-policy'] });
      setPolicyOpen(false);
    },
  });

  const filtered = useMemo(() => (attendance.data?.items ?? []).filter((item) => {
    const needle = search.toLowerCase();
    const matchesSearch = item.employeeId?.name?.toLowerCase().includes(needle) || item.employeeId?.employeeCode?.toLowerCase().includes(needle);
    return matchesSearch && (!date || item.attendanceDate === date);
  }), [attendance.data, search, date]);
  const working = filtered.filter((item) => item.sessionStatus === 'working').length;
  const completed = filtered.filter((item) => item.sessionStatus === 'completed').length;
  const totalMinutes = filtered.reduce((sum, item) => sum + (minutesFor(item, now) || 0), 0);
  const overtimeMinutes = filtered.reduce((sum, item) => sum + (item.overtimeMinutes || 0), 0);
  const people = new Set(filtered.map((item) => item.employeeId?._id)).size;
  const currentPolicy = policy.data?.policy || DEFAULT_POLICY;

  const toggleDay = (day) => setPolicyForm((current) => ({
    ...current,
    workingDays: current.workingDays.includes(day)
      ? current.workingDays.filter((value) => value !== day)
      : [...current.workingDays, day],
  }));

  const savePolicy = (event) => {
    event.preventDefault();
    updatePolicy.mutate({
      ...policyForm,
      standardWorkMinutes: Number(policyForm.standardWorkMinutes),
      overtimeAfterMinutes: Number(policyForm.overtimeAfterMinutes),
    });
  };

  const exportCsv = () => {
    const rows = [
      ['Employee', 'Employee ID', 'Office', 'Check in', 'Check out', 'Total minutes', 'Regular minutes', 'Overtime minutes', 'Early exit minutes', 'Timing status', 'Distance m', 'GPS accuracy m'],
      ...filtered.map((item) => [item.employeeId?.name, item.employeeId?.employeeCode, item.officeId?.name, item.checkInAt, item.checkOutAt ?? '', minutesFor(item, now) ?? '', item.regularMinutes ?? '', item.overtimeMinutes ?? 0, item.earlyExitMinutes ?? 0, item.timingStatus || item.sessionStatus, item.locationVerification?.distanceMeters ?? '', item.locationVerification?.accuracyMeters ?? '']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `attendance-${date || new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="Operations"
        title="Attendance monitoring"
        description="Plan weekly attendance, enforce check-in timing, and monitor regular hours, early exits and overtime."
        action={<div className="page-header-actions"><Button variant="secondary" onClick={() => setPolicyOpen(true)}><Settings2 size={17} />Attendance policy</Button><Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}><Download size={17} />Export CSV</Button></div>}
      />

      <Card className="attendance-policy-summary">
        <span className="attendance-policy-summary__icon"><CalendarClock size={21} /></span>
        <div><small>Weekly plan</small><strong>{DAYS.filter((day) => currentPolicy.workingDays.includes(day.value)).map((day) => day.label).join(', ')}</strong></div>
        <div><small>Check-in window</small><strong>{currentPolicy.checkInWindowStart} – {currentPolicy.checkInWindowEnd}</strong></div>
        <div><small>Planned checkout</small><strong>{currentPolicy.expectedCheckOutTime}</strong></div>
        <div><small>Overtime</small><strong>{currentPolicy.overtimeEnabled ? `After ${formatDuration(currentPolicy.overtimeAfterMinutes)}` : 'Disabled'}</strong></div>
      </Card>

      <div className="attendance-admin-kpis">
        <Card><span><Users size={18} /></span><div><small>Employees</small><strong>{people}</strong></div></Card>
        <Card><span><LocateFixed size={18} /></span><div><small>Working now</small><strong>{working}</strong></div></Card>
        <Card><span><CalendarDays size={18} /></span><div><small>Completed days</small><strong>{completed}</strong></div></Card>
        <Card><span><Clock3 size={18} /></span><div><small>Total / overtime</small><strong>{formatDuration(totalMinutes)}</strong><small>{formatDuration(overtimeMinutes)} overtime</small></div></Card>
      </div>

      <Card className="table-card attendance-monitor-card">
        <div className="table-toolbar attendance-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or ID" /></label><label className="date-filter"><CalendarDays size={16} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{date && <Button size="sm" variant="secondary" onClick={() => setDate('')}>All dates</Button>}<Badge tone="neutral">{filtered.length} records</Badge></div>
        {attendance.isLoading && <LoadingState />}
        {attendance.isError && <ErrorState error={attendance.error} onRetry={attendance.refetch} />}
        {!attendance.isLoading && !attendance.isError && !filtered.length && <EmptyState title="No attendance records" description={search || date ? 'No records match these filters.' : 'Verified check-ins will appear here.'} />}
        {!!filtered.length && <div className="table-wrap"><table className="data-table attendance-data-table"><thead><tr><th>Employee</th><th>Verified location</th><th>Check in</th><th>Check out</th><th>Total time</th><th>Regular / overtime</th><th>State</th></tr></thead><tbody>{filtered.map((item) => <tr key={item._id}><td><strong className="cell-primary">{item.employeeId?.name || 'Employee'}</strong><span className="cell-secondary">{item.employeeId?.employeeCode || '—'} · {item.attendanceDate}</span></td><td><strong className="cell-primary">{item.workMode === 'WFH' ? 'Approved WFH location' : item.officeId?.name || '—'}</strong><span className="cell-secondary">{Number.isFinite(item.locationVerification?.distanceMeters) ? `${Math.round(item.locationVerification.distanceMeters)} m from center` : 'Legacy record'}{Number.isFinite(item.locationVerification?.accuracyMeters) ? ` · ±${Math.round(item.locationVerification.accuracyMeters)} m GPS` : ''}</span></td><td><strong className="cell-primary">{formatDateTime(item.checkInAt)}</strong><span className="cell-secondary">Server timestamp</span></td><td><strong className="cell-primary">{formatDateTime(item.checkOutAt)}</strong><span className="cell-secondary">{item.earlyExitMinutes ? `${formatDuration(item.earlyExitMinutes)} before plan` : item.checkOutAt ? 'Session completed' : 'Awaiting checkout'}</span></td><td><strong className="working-time"><TimerReset size={15} />{formatDuration(minutesFor(item, now))}</strong><span className="cell-secondary">{item.sessionStatus === 'working' ? 'Updating live' : 'Final duration'}</span></td><td><strong className="cell-primary">{formatDuration(item.regularMinutes ?? (item.sessionStatus === 'working' ? minutesFor(item, now) : item.workedMinutes))}</strong><span className="cell-secondary">{item.overtimeMinutes ? `+ ${formatDuration(item.overtimeMinutes)} overtime` : 'No overtime'}</span></td><td><Badge tone={timingTone(item)} dot>{item.workMode === 'WFH' ? 'WFH · ' : ''}{titleCase(item.sessionStatus === 'working' ? 'working' : item.timingStatus || 'completed')}</Badge></td></tr>)}</tbody></table></div>}
      </Card>

      {policyOpen && (
        <Modal title="Attendance policy" description={`Applied in ${policy.data?.timezone || 'organization'} time and snapshotted on every check-in.`} onClose={() => setPolicyOpen(false)} className="attendance-policy-modal">
          <form className="modal-form attendance-policy-form" onSubmit={savePolicy}>
            <fieldset className="working-day-picker"><legend>Weekly working days</legend><div>{DAYS.map((day) => <button type="button" key={day.value} className={policyForm.workingDays.includes(day.value) ? 'is-selected' : ''} onClick={() => toggleDay(day.value)}>{day.label}</button>)}</div></fieldset>
            <div className="form-grid">
              <label className="form-field"><span>Check-in opens</span><input type="time" required value={policyForm.checkInWindowStart} onChange={(event) => setPolicyForm((current) => ({ ...current, checkInWindowStart: event.target.value }))} /></label>
              <label className="form-field"><span>Check-in closes</span><input type="time" required value={policyForm.checkInWindowEnd} onChange={(event) => setPolicyForm((current) => ({ ...current, checkInWindowEnd: event.target.value }))} /></label>
              <label className="form-field"><span>Planned checkout</span><input type="time" required value={policyForm.expectedCheckOutTime} onChange={(event) => setPolicyForm((current) => ({ ...current, expectedCheckOutTime: event.target.value }))} /></label>
              <label className="form-field"><span>Standard work (minutes)</span><input type="number" min="1" max="1440" required value={policyForm.standardWorkMinutes} onChange={(event) => setPolicyForm((current) => ({ ...current, standardWorkMinutes: event.target.value }))} /></label>
            </div>
            <label className="policy-switch"><input type="checkbox" checked={policyForm.overtimeEnabled} onChange={(event) => setPolicyForm((current) => ({ ...current, overtimeEnabled: event.target.checked }))} /><span><strong>Calculate overtime</strong><small>Time after the threshold is reported separately.</small></span></label>
            <label className="form-field"><span>Overtime starts after (minutes)</span><input type="number" min={policyForm.standardWorkMinutes || 1} max="1440" required disabled={!policyForm.overtimeEnabled} value={policyForm.overtimeAfterMinutes} onChange={(event) => setPolicyForm((current) => ({ ...current, overtimeAfterMinutes: event.target.value }))} /></label>
            {updatePolicy.isError && <div className="form-alert">{updatePolicy.error.message}</div>}
            {!policyForm.workingDays.length && <div className="form-alert">Select at least one working day.</div>}
            <div className="modal-actions"><Button variant="secondary" onClick={() => setPolicyOpen(false)}>Cancel</Button><Button type="submit" disabled={updatePolicy.isPending || !policyForm.workingDays.length}>{updatePolicy.isPending ? 'Saving…' : 'Save weekly plan'}</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
