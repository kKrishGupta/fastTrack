import { useState } from 'react';
import { Building2, ChevronRight, Plus, Users } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/DataState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { hrService } from '../../services/hrService';
import { initials, titleCase } from '../../utils/formatters';

export function DepartmentsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const queryClient = useQueryClient();
  const departments = useQuery({ queryKey: ['hr', 'departments'], queryFn: hrService.departments });
  const departmentEmployees = useQuery({
    queryKey: ['hr', 'employees', { departmentId: selectedDepartment?._id }],
    queryFn: () => hrService.employees({ departmentId: selectedDepartment._id, limit: 100 }),
    enabled: Boolean(selectedDepartment?._id),
  });
  const createDepartment = useMutation({
    mutationFn: hrService.createDepartment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'departments'] });
      setDialogOpen(false);
      setForm({ name: '', description: '' });
    },
  });

  const submit = (event) => {
    event.preventDefault();
    createDepartment.mutate(form);
  };

  return (
    <div className="page-enter">
      <PageHeader eyebrow="Organization" title="Departments" description="Create clear team ownership and keep attendance reporting organized." action={<Button onClick={() => setDialogOpen(true)}><Plus size={17} />New department</Button>} />
      <Card className="content-card">
        <div className="section-heading"><div><h2>Organization structure</h2><p>{departments.data?.length ?? 0} departments</p></div></div>
        {departments.isLoading && <LoadingState />}
        {departments.isError && <ErrorState error={departments.error} onRetry={departments.refetch} />}
        {!departments.isLoading && !departments.isError && !departments.data?.length && <EmptyState title="No departments yet" description="Create your first department to start organizing employees." action={<Button onClick={() => setDialogOpen(true)}><Plus size={16} />Create department</Button>} />}
        <div className="department-grid">
          {departments.data?.map((department) => (
            <button type="button" className="department-card department-card--button" key={department._id} onClick={() => setSelectedDepartment(department)}>
              <span className="department-card__icon"><Building2 size={20} /></span>
              <div><h3>{department.name}</h3><p>{department.description || 'No description provided.'}</p></div>
              <span className="department-card__action"><Badge tone={department.active ? 'success' : 'neutral'} dot>{department.active ? 'Active' : 'Inactive'}</Badge><ChevronRight size={17} /></span>
            </button>
          ))}
        </div>
      </Card>
      {dialogOpen && (
        <Modal title="Create department" description="Add a new organizational team." onClose={() => setDialogOpen(false)}>
          <form className="modal-form" onSubmit={submit}>
            <label className="form-field"><span>Department name</span><input autoFocus required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Engineering" /></label>
            <label className="form-field"><span>Description <small>Optional</small></span><textarea rows={3} maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What does this team own?" /></label>
            {createDepartment.isError && <div className="form-alert">{createDepartment.error.message}</div>}
            <div className="modal-actions"><Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={createDepartment.isPending}>{createDepartment.isPending ? 'Creating…' : 'Create department'}</Button></div>
          </form>
        </Modal>
      )}
      {selectedDepartment && (
        <Modal title={selectedDepartment.name} description="Employees assigned to this department." onClose={() => setSelectedDepartment(null)}>
          <div className="department-members-heading"><span><Users size={18} /></span><div><strong>{departmentEmployees.data?.total ?? 0} employees</strong><p>{selectedDepartment.description || 'No department description.'}</p></div></div>
          {departmentEmployees.isLoading && <LoadingState rows={3} />}
          {departmentEmployees.isError && <ErrorState error={departmentEmployees.error} onRetry={departmentEmployees.refetch} />}
          {!departmentEmployees.isLoading && !departmentEmployees.isError && !departmentEmployees.data?.items?.length && <EmptyState title="No employees in this department" description="Assign a department when inviting or editing an employee." />}
          {!!departmentEmployees.data?.items?.length && <div className="department-member-list">{departmentEmployees.data.items.map((employee) => <div className="department-member" key={employee.id || employee._id}><span className="avatar">{initials(employee.name)}</span><div><strong>{employee.name}</strong><p>{employee.employeeCode} · {employee.jobTitle || employee.email}</p></div><Badge tone={employee.status === 'active' ? 'success' : 'warning'}>{titleCase(employee.status)}</Badge></div>)}</div>}
          <div className="modal-actions"><Button onClick={() => setSelectedDepartment(null)}>Done</Button></div>
        </Modal>
      )}
    </div>
  );
}
