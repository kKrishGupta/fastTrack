import { useState } from 'react';
import { CheckCircle2, MailPlus, MapPin, Plus, Search, Settings2, UserRound } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { hrService } from '../../services/hrService';
import { formatDateTime, initials, titleCase } from '../../utils/formatters';

const emptyForm = { name: '', email: '', employeeCode: '', jobTitle: '', departmentId: '' };

export function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invitation, setInvitation] = useState(null);
  const [assignmentEmployee, setAssignmentEmployee] = useState(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const queryClient = useQueryClient();
  const employees = useQuery({ queryKey: ['hr', 'employees', { search }], queryFn: () => hrService.employees({ search, limit: 50 }) });
  const departments = useQuery({ queryKey: ['hr', 'departments'], queryFn: hrService.departments });
  const offices = useQuery({ queryKey: ['hr', 'offices'], queryFn: hrService.offices });
  const inviteEmployee = useMutation({
    mutationFn: hrService.inviteEmployee,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setInvitation(result.invitation);
      setForm(emptyForm);
    },
  });
  const assignOffice = useMutation({
    mutationFn: hrService.assignOffice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setAssignmentEmployee(null);
      setSelectedOfficeId('');
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setInvitation(null);
    inviteEmployee.reset();
    setForm(emptyForm);
  };

  const submit = (event) => {
    event.preventDefault();
    inviteEmployee.mutate({
      ...form,
      departmentId: form.departmentId || undefined,
      jobTitle: form.jobTitle || undefined,
    });
  };

  const openOfficeAssignment = (employee) => {
    assignOffice.reset();
    setAssignmentEmployee(employee);
    setSelectedOfficeId(employee.assignedOffice?._id || employee.assignedOffice?.id || '');
  };

  const submitOfficeAssignment = (event) => {
    event.preventDefault();
    if (!assignmentEmployee || !selectedOfficeId) return;
    assignOffice.mutate({
      employeeId: assignmentEmployee.id || assignmentEmployee._id,
      officeId: selectedOfficeId,
    });
  };

  return (
    <div className="page-enter">
      <PageHeader eyebrow="People" title="Employees" description="Invite employees into this organization. They choose their own password through a one-time activation link." action={<Button onClick={() => setDialogOpen(true)}><Plus size={17} />Invite employee</Button>} />
      <Card className="table-card">
        <div className="table-toolbar">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or employee ID" /></label>
          <Badge tone="neutral">{employees.data?.total ?? 0} people</Badge>
        </div>
        {employees.isLoading && <LoadingState />}
        {employees.isError && <ErrorState error={employees.error} onRetry={employees.refetch} />}
        {!employees.isLoading && !employees.isError && !employees.data?.items?.length && <EmptyState title="No employees found" description={search ? 'Try another search term.' : 'Invite your first employee to begin.'} />}
        {!!employees.data?.items?.length && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Department</th><th>Assigned office</th><th>Enrollment</th><th>Account</th><th>Action</th></tr></thead>
              <tbody>
                {employees.data.items.map((employee) => (
                  <tr key={employee.id || employee._id}>
                    <td><div className="person-cell"><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.email}</span></div></div></td>
                    <td><strong className="cell-primary">{employee.departmentId?.name || 'Unassigned'}</strong><span className="cell-secondary">{employee.jobTitle || 'No job title'}</span></td>
                    <td>{employee.assignedOffice ? <div className="office-cell"><MapPin size={15} /><div><strong>{employee.assignedOffice.name}</strong><span>{employee.assignedOffice.address || 'Active office'}</span></div></div> : <Badge tone="warning">Not assigned</Badge>}</td>
                    <td><Badge tone={employee.enrollmentStatus === 'complete' ? 'success' : 'warning'} dot>{titleCase(employee.enrollmentStatus)}</Badge></td>
                    <td><Badge tone={employee.status === 'active' ? 'success' : employee.status === 'invited' ? 'warning' : 'neutral'}>{titleCase(employee.status)}</Badge></td>
                    <td><Button size="sm" variant="secondary" onClick={() => openOfficeAssignment(employee)}><Settings2 size={14} />Assign</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialogOpen && (
        <Modal title={invitation ? 'Invitation ready' : 'Invite employee'} description={invitation ? 'Share this one-time activation link with the employee.' : 'Only invited employees can join this organization.'} onClose={closeDialog}>
          {invitation ? (
            <div className="invite-result">
              <span className="invite-result__icon"><CheckCircle2 size={24} /></span>
              <div><strong>{invitation.email}</strong><p>Expires {formatDateTime(invitation.expiresAt)}</p></div>
              <div className="invite-delivered"><MailPlus size={18} /><div><strong>Invitation email sent</strong><p>Gmail accepted the message for delivery. The employee can activate the account from the secure one-time link in that email.</p></div></div>
              <p className="invite-result__note">FaceTrack stores only a hash of the invitation token. The link stops working after activation or expiry.</p>
              <div className="modal-actions">
                <Button onClick={closeDialog}>Done</Button>
              </div>
            </div>
          ) : (
            <form className="modal-form" onSubmit={submit}>
              <div className="form-grid">
                <label className="form-field form-grid__wide"><span>Full name</span><input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Employee name" /></label>
                <label className="form-field"><span>Employee ID</span><input required value={form.employeeCode} onChange={(event) => setForm((current) => ({ ...current, employeeCode: event.target.value }))} placeholder="EMP-1001" /></label>
                <label className="form-field"><span>Job title</span><input value={form.jobTitle} onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))} placeholder="Product designer" /></label>
                <label className="form-field form-grid__wide"><span>Work email</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@company.com" /></label>
                <label className="form-field form-grid__wide"><span>Department</span><select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}><option value="">Unassigned</option>{departments.data?.map((department) => <option value={department._id} key={department._id}>{department.name}</option>)}</select></label>
              </div>
              {inviteEmployee.isError && <div className="form-alert">{inviteEmployee.error.message}</div>}
              <div className="modal-actions"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={inviteEmployee.isPending}><UserRound size={16} />{inviteEmployee.isPending ? 'Creating invitation…' : 'Create invitation'}</Button></div>
            </form>
          )}
        </Modal>
      )}
      {assignmentEmployee && (
        <Modal title="Assign office" description={`Choose the attendance office for ${assignmentEmployee.name}.`} onClose={() => setAssignmentEmployee(null)}>
          <form className="modal-form" onSubmit={submitOfficeAssignment}>
            <div className="assignment-person"><span className="avatar">{initials(assignmentEmployee.name)}</span><div><strong>{assignmentEmployee.name}</strong><p>{assignmentEmployee.employeeCode} · {assignmentEmployee.departmentId?.name || 'No department'}</p></div></div>
            <label className="form-field"><span>Office location</span><select required autoFocus value={selectedOfficeId} onChange={(event) => setSelectedOfficeId(event.target.value)}><option value="">Select an office</option>{offices.data?.filter((office) => office.active).map((office) => <option value={office._id} key={office._id}>{office.name}{office.address ? ` — ${office.address}` : ''}</option>)}</select></label>
            {!offices.isLoading && !offices.data?.length && <div className="form-alert">Create an office location before assigning employees.</div>}
            {assignOffice.isError && <div className="form-alert">{assignOffice.error.message}</div>}
            <p className="form-helper">Assigning a new office replaces the employee's current active office.</p>
            <div className="modal-actions"><Button variant="secondary" onClick={() => setAssignmentEmployee(null)}>Cancel</Button><Button type="submit" disabled={!selectedOfficeId || assignOffice.isPending}>{assignOffice.isPending ? 'Assigning…' : 'Assign office'}</Button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
