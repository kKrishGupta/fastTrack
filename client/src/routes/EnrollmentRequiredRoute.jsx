import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function EnrollmentRequiredRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (user?.enrollmentStatus !== 'complete') {
    return <Navigate to="/employee/enrollment" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
