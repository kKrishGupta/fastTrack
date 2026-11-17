import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ role }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="app-loading" role="status" aria-label="Loading application">
        <LoaderCircle className="animate-spin" size={30} />
        <p>Preparing your workspace</p>
      </div>
    );
  }
  if (!user) {
    const loginPath = role === 'Employee' ? '/employee/login' : '/organization/login';
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  if (user.role !== role) return <Navigate to={user.role === 'HR' ? '/hr' : '/employee'} replace />;
  return <Outlet />;
}
