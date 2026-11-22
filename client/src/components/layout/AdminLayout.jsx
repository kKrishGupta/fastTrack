import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Building2, CalendarCheck, Camera, House, LayoutDashboard, LogOut, MapPin, Menu, Users, X } from 'lucide-react';
import { Brand } from '../common/Brand';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/formatters';

const navigation = [
  { label: 'Overview', to: '/hr', icon: LayoutDashboard, end: true },
  { label: 'Departments', to: '/hr/departments', icon: Building2 },
  { label: 'Employees', to: '/hr/employees', icon: Users },
  { label: 'Office locations', to: '/hr/offices', icon: MapPin },
  { label: 'Attendance', to: '/hr/attendance', icon: CalendarCheck },
  { label: 'WFH approvals', to: '/hr/wfh-requests', icon: House },
  { label: 'Activity monitoring', to: '/hr/monitoring', icon: Activity },
  { label: 'Screenshots', to: '/hr/screenshots', icon: Camera },
];

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    try {
      await logout();
    } finally {
      navigate('/organization/login', { replace: true });
    }
  };

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`admin-sidebar ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
        <div className="admin-sidebar__top">
          <Brand inverse />
          <Button className="mobile-only" variant="darkGhost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></Button>
        </div>
        <p className="admin-sidebar__label">Workspace</p>
        <nav className="admin-nav" aria-label="Administration navigation">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav__link ${isActive ? 'admin-nav__link--active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-profile">
          <div className="avatar avatar--dark">{initials(user?.name)}</div>
          <div className="admin-profile__copy"><strong>{user?.name}</strong><span>{user?.organization?.slug || 'HR administrator'}</span></div>
          <Button variant="darkGhost" size="icon" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></Button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <Button className="mobile-only" variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></Button>
          <div><span className="eyebrow">{user?.organization?.name || 'Organization console'}</span><strong>Good day, {user?.name?.split(' ')[0]}</strong></div>
          <Badge tone="success" dot>Systems normal</Badge>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}
