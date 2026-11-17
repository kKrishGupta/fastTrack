import { Activity, Building2, CalendarCheck, MapPin, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/DataState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { hrService } from '../../services/hrService';
import { formatTime } from '../../utils/formatters';

export function AdminDashboardPage() {
  const departments = useQuery({ queryKey: ['hr', 'departments'], queryFn: hrService.departments });
  const employees = useQuery({ queryKey: ['hr', 'employees', { limit: 100 }], queryFn: () => hrService.employees({ limit: 100 }) });
  const offices = useQuery({ queryKey: ['hr', 'offices'], queryFn: hrService.offices });
  const attendance = useQuery({ queryKey: ['hr', 'attendance', { limit: 100 }], queryFn: () => hrService.attendance({ limit: 100 }) });

  const queries = [departments, employees, offices, attendance];
  const loading = queries.some((query) => query.isLoading);
  const failed = queries.find((query) => query.isError);
  const employeeItems = employees.data?.items ?? [];
  const attendanceItems = attendance.data?.items ?? [];
  const activeSessions = attendanceItems.filter((item) => item.sessionStatus === 'working').length;
  const enrolled = employeeItems.filter((item) => item.enrollmentStatus === 'complete').length;

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Overview" title="Organization pulse" description="Live attendance readiness and workforce activity, without exposing sensitive verification evidence." />
      {loading && <LoadingState rows={3} />}
      {failed && <ErrorState error={failed.error} onRetry={() => queries.forEach((query) => query.refetch())} />}
      {!loading && !failed && (
        <>
          <div className="stats-grid">
            <StatCard icon={Users} label="Employees" value={employeeItems.length} detail={`${departments.data?.length ?? 0} active departments`} />
            <StatCard icon={Activity} label="Working now" value={activeSessions} detail="Active work sessions" tone="blue" />
            <StatCard icon={ShieldCheck} label="Face ready" value={`${enrolled}/${employeeItems.length}`} detail="Completed enrollments" tone="gold" />
            <StatCard icon={MapPin} label="Office locations" value={offices.data?.length ?? 0} detail="Configured geofences" tone="purple" />
          </div>

          <div className="dashboard-grid">
            <Card className="activity-card">
              <div className="section-heading"><div><span className="eyebrow">Live feed</span><h2>Recent attendance</h2></div><Badge tone="success" dot>Live</Badge></div>
              <div className="activity-list">
                {attendanceItems.slice(0, 6).map((item) => (
                  <div className="activity-item" key={item._id}>
                    <span className="activity-item__icon"><UserCheck size={18} /></span>
                    <div><strong>{item.employeeId?.name || 'Employee'}</strong><p>{item.officeId?.name || 'Assigned office'}</p></div>
                    <div className="activity-item__time"><strong>{formatTime(item.checkInAt)}</strong><Badge tone={item.sessionStatus === 'working' ? 'success' : 'neutral'}>{item.sessionStatus}</Badge></div>
                  </div>
                ))}
                {!attendanceItems.length && <div className="compact-empty"><CalendarCheck size={22} /><p>Attendance events will appear here.</p></div>}
              </div>
            </Card>
            <Card className="readiness-card">
              <div className="section-heading"><div><span className="eyebrow">Readiness</span><h2>Setup health</h2></div><Building2 size={20} /></div>
              <div className="progress-block"><div><span>Face enrollment</span><strong>{employeeItems.length ? Math.round((enrolled / employeeItems.length) * 100) : 0}%</strong></div><div className="progress"><span style={{ width: `${employeeItems.length ? (enrolled / employeeItems.length) * 100 : 0}%` }} /></div></div>
              <div className="readiness-list">
                <div><span><Users size={17} />People assigned</span><strong>{employeeItems.length}</strong></div>
                <div><span><MapPin size={17} />Offices active</span><strong>{offices.data?.filter((office) => office.active).length ?? 0}</strong></div>
                <div><span><CalendarCheck size={17} />Records loaded</span><strong>{attendance.data?.total ?? attendanceItems.length}</strong></div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
