import { Home, LayoutDashboard, LogOut } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Brand } from '../common/Brand';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/formatters';

export function EmployeeLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    try {
      await logout();
    } finally {
      navigate('/employee/login', { replace: true });
    }
  };

  return (
    <div className="employee-shell">
      <header className="employee-topbar">
        <Brand />
        <nav className="employee-nav"><NavLink end to="/employee"><LayoutDashboard size={16} />Dashboard</NavLink><NavLink to="/employee/wfh-requests"><Home size={16} />WFH requests</NavLink></nav>
        <div className="employee-topbar__actions">
          <div className="employee-identity"><span className="avatar">{initials(user?.name)}</span><div><strong>{user?.name}</strong><span>{user?.organization?.name || 'Employee workspace'}</span></div></div>
          <Button variant="secondary" size="icon" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></Button>
        </div>
      </header>
      <main className="employee-content"><Outlet /></main>
    </div>
  );
}
