import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Fingerprint, LocateFixed, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AttendanceCalendar, minutesFor } from '../../components/attendance/AttendanceCalendar';
import { FaceCheckModal } from '../../components/attendance/FaceCheckModal';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/DataState';
import { useAuth } from '../../context/AuthContext';
import { useAttendanceFlow } from '../../hooks/useAttendanceFlow';
import { attendanceService } from '../../services/attendanceService';
import { formatDuration, formatTime, titleCase } from '../../utils/formatters';

function useLiveNow(enabled) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

function sessionTone(item) {
  if (item.sessionStatus === 'working') return 'success';
  if (item.timingStatus === 'early_exit') return 'danger';
  if (item.timingStatus === 'overtime') return 'warning';
  return 'neutral';
}

function SessionRow({ item, now }) {
  return (
    <article className="history-item">
      <span className="history-item__date"><strong>{new Date(item.checkInAt).getDate()}</strong><small>{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(item.checkInAt))}</small></span>
      <div><strong>{formatTime(item.checkInAt)} → {formatTime(item.checkOutAt)}</strong><span>{item.officeId?.name || (item.workMode === 'WFH' ? 'Approved WFH' : 'Office')} · {formatDuration(minutesFor(item, now))}{item.overtimeMinutes ? ` · ${formatDuration(item.overtimeMinutes)} overtime` : ''}</span></div>
      <Badge tone={sessionTone(item)}>{titleCase(item.sessionStatus === 'working' ? 'working' : item.timingStatus || 'completed')}</Badge>
    </article>
  );
}

export function EmployeeDashboardPage() {
  const { user } = useAuth();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [faceCheckOpen, setFaceCheckOpen] = useState(false);
  const today = useQuery({ queryKey: ['employee', 'today'], queryFn: attendanceService.today, refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ['employee', 'history'], queryFn: () => attendanceService.history({ limit: 100 }), refetchInterval: 30_000 });
  const offices = useQuery({ queryKey: ['employee', 'offices'], queryFn: attendanceService.assignedOffices });
  const policy = useQuery({ queryKey: ['employee', 'attendance-policy'], queryFn: attendanceService.policy, refetchInterval: 30_000 });
  const attendanceFlow = useAttendanceFlow();
  const working = today.data?.sessionStatus === 'working';
  const now = useLiveNow(working);
  const busy = attendanceFlow.checkIn.isPending || attendanceFlow.checkOut.isPending;
  const records = history.data?.items ?? [];
  const currentMonth = new Date(now).getMonth();
  const currentYear = new Date(now).getFullYear();
  const monthRecords = useMemo(() => records.filter((item) => {
    const itemDate = new Date(item.checkInAt);
    return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
  }), [records, currentMonth, currentYear]);
  const totalMinutes = monthRecords.reduce((sum, item) => sum + (minutesFor(item, now) || 0), 0);
  const totalOvertime = monthRecords.reduce((sum, item) => sum + (item.overtimeMinutes || 0), 0);
  const completedDays = new Set(monthRecords.map((item) => item.attendanceDate)).size;
  const averageMinutes = completedDays ? Math.round(totalMinutes / completedDays) : 0;
  const liveMinutes = today.data ? minutesFor(today.data, now) : null;
  const schedule = policy.data;
  const canCheckIn = schedule?.today?.canCheckIn ?? true;
  const plannedCheckoutReached = schedule?.today?.date !== today.data?.attendanceDate
    || schedule?.today?.currentTime >= schedule?.policy?.expectedCheckOutTime;
  const liveOvertime = working && schedule?.policy?.overtimeEnabled && plannedCheckoutReached
    ? Math.max(0, (liveMinutes || 0) - schedule.policy.overtimeAfterMinutes)
    : today.data?.overtimeMinutes || 0;
  const faceChangeAllowed = user?.faceReenrollmentAuthorizedUntil
    && new Date(user.faceReenrollmentAuthorizedUntil).getTime() > Date.now();

  const requestCheckout = () => {
    const current = schedule?.today?.currentTime;
    const planned = schedule?.policy?.expectedCheckOutTime;
    const isSameWorkday = schedule?.today?.date === today.data?.attendanceDate;
    if (isSameWorkday && current && planned && current < planned && !window.confirm(`Planned checkout is ${planned}. Checking out now will be recorded as an early exit. Continue?`)) return;
    attendanceFlow.checkOut.mutate();
  };

  return (
    <div className="employee-dashboard page-enter">
      <section className="employee-hero">
        <div className="employee-hero__orb employee-hero__orb--one" /><div className="employee-hero__orb employee-hero__orb--two" />
        <div className="employee-hero__copy">
          <p className="eyebrow eyebrow--lime">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</p>
          <h1>{working ? 'You are on the clock.' : `Ready when you are, ${user?.name?.split(' ')[0]}.`}</h1>
          <p>Server-recorded timing, verified office location and identity evidence are linked to every work session.</p>
          <div className="employee-hero__actions">
            <Badge className="hero-status" tone={working ? 'lime' : 'dark'} dot>{working ? 'Working' : 'Not checked in'}</Badge>
            {working
              ? <Button variant="light" onClick={requestCheckout} disabled={busy}><Clock3 size={18} />{attendanceFlow.checkOut.isPending ? 'Checking out…' : 'Check out'}</Button>
              : <Button variant="lime" onClick={() => setFaceCheckOpen(true)} disabled={busy || user?.enrollmentStatus !== 'complete' || !canCheckIn}><LocateFixed size={18} />{attendanceFlow.checkIn.isPending ? 'Verifying…' : 'Check in securely'}</Button>}
            {user?.enrollmentStatus !== 'complete' || faceChangeAllowed
              ? <Link className="button button--darkGhost button--md" to="/employee/enrollment"><Fingerprint size={18} />{user?.enrollmentStatus === 'complete' ? 'Change enrolled face' : 'Face enrollment'}</Link>
              : <Button variant="darkGhost" disabled title="Ask HR to allow a face change"><Fingerprint size={18} />Face change locked</Button>}
          </div>
          {!working && schedule && <div className={`hero-message ${canCheckIn ? 'hero-message--success' : 'hero-message--policy'}`}><CalendarDays size={17} />{schedule.today.message} · {schedule.policy.checkInWindowStart}–{schedule.policy.checkInWindowEnd}</div>}
          {attendanceFlow.progress && <div className="hero-message hero-message--success"><CheckCircle2 size={17} />{attendanceFlow.progress}</div>}
          {attendanceFlow.error && <div className="hero-message hero-message--error">{attendanceFlow.error}</div>}
        </div>
        <div className="session-ticket">
          <span className="session-ticket__label">Today's monitored session</span>
          <div><span>Check in</span><strong>{formatTime(today.data?.checkInAt)}</strong></div>
          <div><span>Planned checkout</span><strong>{schedule?.policy?.expectedCheckOutTime || '—'}</strong></div>
          <div><span>Working time</span><strong>{formatDuration(liveMinutes)}</strong></div>
          <div><span>Overtime</span><strong>{formatDuration(liveOvertime)}</strong></div>
          <div><span>Work location</span><strong>{today.data?.workMode === 'WFH' ? 'Approved WFH' : today.data?.officeId?.name || offices.data?.[0]?.name || '—'}</strong></div>
        </div>
      </section>

      <div className="attendance-kpis"><div><CalendarDays size={19} /><span>Working days</span><strong>{completedDays}</strong><small>This month</small></div><div><Clock3 size={19} /><span>Working hours</span><strong>{formatDuration(totalMinutes)}</strong><small>{formatDuration(totalOvertime)} overtime</small></div><div><LocateFixed size={19} /><span>Daily average</span><strong>{formatDuration(averageMinutes)}</strong><small>Per working day</small></div></div>

      <div className="employee-grid employee-grid--attendance">
        <Card className="history-card attendance-calendar-card">
          <div className="section-heading"><div><span className="eyebrow">Your activity</span><h2>{calendarOpen ? 'Attendance calendar' : 'Recent attendance'}</h2><p>{calendarOpen ? 'Click any marked day for complete timing and verified location.' : 'Open the calendar to explore attendance by date.'}</p></div><button type="button" className={`calendar-toggle ${calendarOpen ? 'calendar-toggle--active' : ''}`} onClick={() => setCalendarOpen((open) => !open)} aria-expanded={calendarOpen} aria-label={calendarOpen ? 'Close attendance calendar' : 'Open attendance calendar'} title={calendarOpen ? 'Close calendar' : 'Open calendar'}><CalendarDays size={20} /></button></div>
          {history.isLoading && <LoadingState rows={5} />}
          {history.isError && <ErrorState error={history.error} onRetry={history.refetch} />}
          {!history.isLoading && !history.isError && calendarOpen && <AttendanceCalendar records={records} now={now} />}
          {!history.isLoading && !history.isError && !calendarOpen && <div className="history-list">{records.slice(0, 7).map((item) => <SessionRow item={item} now={now} key={item._id} />)}{!records.length && <div className="compact-empty"><CalendarDays size={22} /><p>Your verified work sessions will appear here.</p></div>}</div>}
        </Card>

        <div className="employee-side-stack">
          <Card className="verification-card"><span className="verification-card__icon"><ShieldCheck size={22} /></span><div className="section-heading"><div><span className="eyebrow">Readiness</span><h2>Verification status</h2></div></div><div className="verification-list"><div><span><Fingerprint size={17} />Face profile</span><Badge tone={user?.enrollmentStatus === 'complete' ? 'success' : 'warning'}>{titleCase(user?.enrollmentStatus)}</Badge></div><div><span><MapPin size={17} />Assigned office</span><strong>{offices.data?.[0]?.name || 'Not assigned'}</strong></div><div><span><CalendarDays size={17} />Check-in window</span><strong>{schedule ? `${schedule.policy.checkInWindowStart}–${schedule.policy.checkInWindowEnd}` : 'Loading'}</strong></div><div><span><LocateFixed size={17} />Location policy</span><strong>Monitored</strong></div></div>{user?.enrollmentStatus !== 'complete' && <Link className="inline-link" to="/employee/enrollment">Complete enrollment <ArrowRight size={15} /></Link>}</Card>
          <Card className="recent-sessions-card"><div className="section-heading"><div><span className="eyebrow">Latest records</span><h2>Recent sessions</h2></div></div><div className="history-list">{records.slice(0, 5).map((item) => <SessionRow item={item} now={now} key={item._id} />)}</div></Card>
        </div>
      </div>
      {faceCheckOpen && <FaceCheckModal onClose={() => setFaceCheckOpen(false)} onCapture={(capture) => { setFaceCheckOpen(false); attendanceFlow.checkIn.mutate(capture); }} />}
    </div>
  );
}
