import { useState } from 'react';
import { Activity, Ban, Check, CheckCircle2, Copy, Fingerprint, MailPlus, MapPin, Plus, Search, Settings2, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const openActivity = (employee) => navigate(`/hr/monitoring?employeeId=${encodeURIComponent(employee.id || employee._id)}`);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invitation, setInvitation] = useState(null);
  const [copyStatus, setCopyStatus] = useState('idle');
  const [assignmentEmployee, setAssignmentEmployee] = useState(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const queryClient = useQueryClient();
  const employees = useQuery({ queryKey: ['hr', 'employees', { search }], queryFn: () => hrService.employees({ search, limit: 50 }) });
  const departments = useQuery({ queryKey: ['hr', 'departments'], queryFn: hrService.departments });
  const offices = useQuery({ queryKey: ['hr', 'offices'], queryFn: hrService.offices });
  const inviteEmployee = useMutation({
    mutationFn: hrService.inviteEmployee,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setInvitation(result.invitation);
      setCopyStatus('idle');
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
  const revokeInvitation = useMutation({
    mutationFn: hrService.revokeEmployeeInvitations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setAssignmentEmployee((current) => current ? { ...current, invitationPending: false } : current);
    },
  });
  const authorizeFaceChange = useMutation({
    mutationFn: hrService.authorizeFaceReenrollment,
    onSuccess: (employee) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setAssignmentEmployee((current) => current ? { ...current, ...employee } : current);
    },
  });
  const revokeFaceChange = useMutation({
    mutationFn: hrService.revokeFaceReenrollment,
    onSuccess: (employee) => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setAssignmentEmployee((current) => current ? {
        ...current,
        ...employee,
        faceReenrollmentRequestedAt: undefined,
        faceReenrollmentAuthorizedAt: undefined,
        faceReenrollmentAuthorizedUntil: undefined,
      } : current);
    },
  });
  const removeEmployee = useMutation({
    mutationFn: hrService.deleteEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'employees'] });
      setDeleteTarget(null);
      setDeleteConfirmation('');
      setAssignmentEmployee(null);
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setInvitation(null);
    setCopyStatus('idle');
    inviteEmployee.reset();
    setForm(emptyForm);
  };

  const copyInvitationLink = async () => {
    if (!invitation?.url) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
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
    revokeInvitation.reset();
    authorizeFaceChange.reset();
    revokeFaceChange.reset();
    setAssignmentEmployee(employee);
    setSelectedOfficeId(employee.assignedOffice?._id || employee.assignedOffice?.id || '');
  };

  const openDeleteConfirmation = () => {
    removeEmployee.reset();
    setDeleteTarget(assignmentEmployee);
    setDeleteConfirmation('');
    setAssignmentEmployee(null);
  };

  const deleteConfirmationValue = deleteTarget?.employeeCode || deleteTarget?.email || '';
  const faceChangeAllowed = assignmentEmployee?.faceReenrollmentAuthorizedUntil
    && new Date(assignmentEmployee.faceReenrollmentAuthorizedUntil).getTime() > Date.now();
  const faceChangeRequested = Boolean(assignmentEmployee?.faceReenrollmentRequestedAt) && !faceChangeAllowed;

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
              <thead><tr><th>Employee</th><th>Department</th><th>Assigned office</th><th>Enrollment</th><th>Account</th><th>ActivityWatch</th><th>Action</th></tr></thead>
              <tbody>
                {employees.data.items.map((employee) => {
                  return (
                    <tr key={employee.id || employee._id}>
                      <td><div className="person-cell"><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><span>{employee.employeeCode} · {employee.email}</span></div></div></td>
                      <td><strong className="cell-primary">{employee.departmentId?.name || 'Unassigned'}</strong><span className="cell-secondary">{employee.jobTitle || 'No job title'}</span></td>
                      <td>{employee.assignedOffice ? <div className="office-cell"><MapPin size={15} /><div><strong>{employee.assignedOffice.name}</strong><span>{employee.assignedOffice.address || 'Active office'}</span></div></div> : <Badge tone="warning">Not assigned</Badge>}</td>
                      <td><Badge tone={employee.enrollmentStatus === 'complete' ? 'success' : 'warning'} dot>{titleCase(employee.enrollmentStatus)}</Badge></td>
                      <td><Badge tone={employee.status === 'active' ? 'success' : employee.status === 'invited' ? 'warning' : 'neutral'}>{titleCase(employee.status)}</Badge></td>
                      <td><Button size="sm" variant="secondary" onClick={() => openActivity(employee)}><Activity size={14} />View activity</Button></td>
                      <td><Button size="sm" variant="secondary" onClick={() => openOfficeAssignment(employee)}><Settings2 size={14} />Manage</Button></td>
                    </tr>
                  );
                })}
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
              {invitation.delivered ? (
                <div className="invite-delivered"><MailPlus size={18} /><div><strong>Invitation email sent</strong><p>The employee can use the email or the secure link below to activate their account.</p></div></div>
              ) : (
                <div className="invite-delivered invite-delivered--warning"><TriangleAlert size={18} /><div><strong>Email could not be sent</strong><p>The invitation is still active. Copy this secure link and share it directly with the employee.</p></div></div>
              )}
              <div className="invite-link">
                <label htmlFor="employee-invitation-link">Secure activation link</label>
                <div className="invite-link__control">
                  <input id="employee-invitation-link" readOnly value={invitation.url || ''} onFocus={(event) => event.target.select()} />
                  <Button type="button" onClick={copyInvitationLink} disabled={!invitation.url}>
                    {copyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                    {copyStatus === 'copied' ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
                {copyStatus === 'error' && <p className="invite-copy-error">Could not access the clipboard. Select the link and copy it manually.</p>}
              </div>
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
        <Modal title="Manage employee" description={`Manage office access and membership for ${assignmentEmployee.name}.`} onClose={() => setAssignmentEmployee(null)}>
          <form className="modal-form" onSubmit={submitOfficeAssignment}>
            <div className="assignment-person"><span className="avatar">{initials(assignmentEmployee.name)}</span><div><strong>{assignmentEmployee.name}</strong><p>{assignmentEmployee.employeeCode} · {assignmentEmployee.departmentId?.name || 'No department'}</p></div></div>
            <label className="form-field"><span>Office location</span><select required autoFocus value={selectedOfficeId} onChange={(event) => setSelectedOfficeId(event.target.value)}><option value="">Select an office</option>{offices.data?.filter((office) => office.active).map((office) => <option value={office._id} key={office._id}>{office.name}{office.address ? ` — ${office.address}` : ''}</option>)}</select></label>
            {!offices.isLoading && !offices.data?.length && <div className="form-alert">Create an office location before assigning employees.</div>}
            {assignOffice.isError && <div className="form-alert">{assignOffice.error.message}</div>}
            <p className="form-helper">Assigning a new office replaces the employee's current active office.</p>
            <div className="modal-actions"><Button variant="secondary" onClick={() => setAssignmentEmployee(null)}>Close</Button><Button type="submit" disabled={!selectedOfficeId || assignOffice.isPending}>{assignOffice.isPending ? 'Assigning…' : 'Assign office'}</Button></div>
          </form>
          <div className="member-access-actions">
            <div><strong>Original reference face</strong><p>This is the face registered during invitation/account setup and used for daily identity matching. The employee must request a replacement before HR can approve it.</p></div>
            {faceChangeRequested && <div className="form-alert">Replacement requested {formatDateTime(assignmentEmployee.faceReenrollmentRequestedAt)}. Review and approve or reject this request.</div>}
            {faceChangeAllowed && <div className="form-success">Reference-face replacement approved until {formatDateTime(assignmentEmployee.faceReenrollmentAuthorizedUntil)}.</div>}
            {!faceChangeRequested && !faceChangeAllowed && <p className="form-helper">No reference-face replacement request is pending.</p>}
            {authorizeFaceChange.isSuccess && <div className="form-success">Approved. The employee can repeat the original account-setup face registration.</div>}
            {authorizeFaceChange.isError && <div className="form-alert">{authorizeFaceChange.error.message}</div>}
            {revokeFaceChange.isSuccess && <div className="form-success">The replacement request or approval has been revoked. The original reference face remains active.</div>}
            {revokeFaceChange.isError && <div className="form-alert">{revokeFaceChange.error.message}</div>}
            <div className="member-access-actions__buttons">
              <Button variant="secondary" onClick={() => authorizeFaceChange.mutate(assignmentEmployee.id || assignmentEmployee._id)} disabled={authorizeFaceChange.isPending || revokeFaceChange.isPending || assignmentEmployee.enrollmentStatus !== 'complete' || (!faceChangeRequested && !faceChangeAllowed)}>
                <Fingerprint size={15} />{authorizeFaceChange.isPending ? 'Approving…' : faceChangeAllowed ? 'Extend replacement access' : faceChangeRequested ? 'Approve reference replacement' : 'No request pending'}
              </Button>
              {(faceChangeAllowed || faceChangeRequested) && (
                <Button variant="danger" onClick={() => revokeFaceChange.mutate(assignmentEmployee.id || assignmentEmployee._id)} disabled={revokeFaceChange.isPending || authorizeFaceChange.isPending}>
                  <Ban size={15} />{revokeFaceChange.isPending ? 'Revoking…' : faceChangeAllowed ? 'Revoke replacement approval' : 'Reject replacement request'}
                </Button>
              )}
            </div>
          </div>
          <div className="member-access-actions">
            <div><strong>ActivityWatch monitoring</strong><p>The employee connects their computer from Activity monitoring in their own workspace after giving consent. Review shared application activity, website domains and active/away time, or pause and revoke connected devices.</p></div>
            {assignmentEmployee.status !== 'active' && <p className="form-helper">The employee must activate their FaceTrack account before pairing a device.</p>}
            <div className="member-access-actions__buttons"><Button variant="secondary" onClick={() => openActivity(assignmentEmployee)}><Activity size={15} />View ActivityWatch activity</Button></div>
          </div>
          <div className="member-access-actions">
            <div><strong>Access and membership</strong><p>Revoke an unused activation link or permanently remove this member and their records.</p></div>
            {revokeInvitation.isSuccess && <div className="form-success">Invitation token revoked. The previous activation link can no longer be used.</div>}
            {revokeInvitation.isError && <div className="form-alert">{revokeInvitation.error.message}</div>}
            <div className="member-access-actions__buttons">
              {assignmentEmployee.invitationPending && (
                <Button variant="secondary" onClick={() => revokeInvitation.mutate(assignmentEmployee.id || assignmentEmployee._id)} disabled={revokeInvitation.isPending}>
                  <Ban size={15} />{revokeInvitation.isPending ? 'Revoking…' : 'Revoke invitation'}
                </Button>
              )}
              <Button variant="danger" onClick={openDeleteConfirmation}><Trash2 size={15} />Delete member</Button>
            </div>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="Delete member permanently" description="This action cannot be undone." onClose={() => setDeleteTarget(null)}>
          <div className="delete-member-confirmation">
            <div className="delete-member-warning"><TriangleAlert size={20} /><div><strong>All employee data will be removed</strong><p>This deletes invitations, office assignments, WFH requests, face enrollment, verification evidence, and attendance history.</p></div></div>
            <div className="assignment-person"><span className="avatar">{initials(deleteTarget.name)}</span><div><strong>{deleteTarget.name}</strong><p>{deleteTarget.employeeCode} · {deleteTarget.email}</p></div></div>
            <label className="form-field"><span>Type <strong>{deleteConfirmationValue}</strong> to confirm</span><input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
            {removeEmployee.isError && <div className="form-alert">{removeEmployee.error.message}</div>}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" disabled={deleteConfirmation.trim() !== deleteConfirmationValue || removeEmployee.isPending} onClick={() => removeEmployee.mutate(deleteTarget.id || deleteTarget._id)}><Trash2 size={16} />{removeEmployee.isPending ? 'Deleting…' : 'Delete permanently'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
