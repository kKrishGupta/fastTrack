import { Activity, BarChart3, Gauge, History, MonitorCog, Radio, SlidersHorizontal } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import '../../styles/monitoring-workspace.css';

const sections = [
  { to: '/hr/monitoring', label: 'Overview', icon: Gauge, end: true },
  { to: '/hr/monitoring/live', label: 'Live activity', icon: Radio },
  { to: '/hr/monitoring/history', label: 'Activity history', icon: History },
  { to: '/hr/monitoring/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/hr/monitoring/devices', label: 'Devices', icon: MonitorCog },
  { to: '/hr/monitoring/policies', label: 'Policies', icon: SlidersHorizontal },
];

export function MonitoringWorkspaceLayout() {
  return <div className="monitoring-workspace">
    <div className="monitoring-workspace__identity"><span><Activity size={18} /></span><div><strong>Activity Monitoring</strong><small>Authorized workspace observations</small></div></div>
    <nav className="monitoring-subnav" aria-label="Activity monitoring sections">
      {sections.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'monitoring-subnav__link monitoring-subnav__link--active' : 'monitoring-subnav__link'}><Icon size={16} /><span>{label}</span></NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
