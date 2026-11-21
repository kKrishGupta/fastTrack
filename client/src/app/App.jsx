import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/layout/AdminLayout';
import { EmployeeLayout } from '../components/layout/EmployeeLayout';
import { LoginPage } from '../pages/auth/LoginPage';
import { AcceptInvitePage } from '../pages/auth/AcceptInvitePage';
import { RegisterOrganizationPage } from '../pages/auth/RegisterOrganizationPage';
import { AdminDashboardPage } from '../pages/hr/AdminDashboardPage';
import { DepartmentsPage } from '../pages/hr/DepartmentsPage';
import { EmployeesPage } from '../pages/hr/EmployeesPage';
import { OfficesPage } from '../pages/hr/OfficesPage';
import { AttendancePage } from '../pages/hr/AttendancePage';
import { EmployeeDashboardPage } from '../pages/employee/EmployeeDashboardPage';
import { EnrollmentPage } from '../pages/employee/EnrollmentPage';
import { WfhRequestsPage } from '../pages/employee/WfhRequestsPage';
import { WfhApprovalsPage } from '../pages/hr/WfhApprovalsPage';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { EnrollmentRequiredRoute } from '../routes/EnrollmentRequiredRoute';
import { MonitoringPage } from '../pages/MonitoringPage';

export function App() {
  return (
    <Routes>
      <Route path="/organization/login" element={<LoginPage accountType="organization" />} />
      <Route path="/organization/register" element={<RegisterOrganizationPage />} />
      <Route path="/employee/login" element={<LoginPage accountType="employee" />} />
      <Route path="/employee/invitations/accept" element={<AcceptInvitePage />} />
      <Route path="/organization/invitations/accept" element={<AcceptInvitePage />} />
      <Route path="/login" element={<Navigate to="/organization/login" replace />} />
      <Route path="/register" element={<Navigate to="/organization/register" replace />} />
      <Route path="/accept-invite" element={<Navigate to="/employee/invitations/accept" replace />} />
      <Route element={<ProtectedRoute role="HR" />}>
        <Route path="/hr" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="offices" element={<OfficesPage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="wfh-requests" element={<WfhApprovalsPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute role="Employee" />}>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route path="enrollment" element={<EnrollmentPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route element={<EnrollmentRequiredRoute />}>
            <Route index element={<EmployeeDashboardPage />} />
            <Route path="wfh-requests" element={<WfhRequestsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/organization/login" replace />} />
      <Route path="*" element={<Navigate to="/organization/login" replace />} />
    </Routes>
  );
}
