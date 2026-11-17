import { api } from '../api';

export const hrService = {
  departments: () => api.get('/hr/departments').then(({ data }) => data.items),
  createDepartment: (payload) => api.post('/hr/departments', payload).then(({ data }) => data.item),
  employees: (params = {}) => api.get('/hr/employees', { params }).then(({ data }) => data),
  inviteEmployee: (payload) => api.post('/hr/employees/invitations', payload).then(({ data }) => data),
  assignOffice: ({ officeId, employeeId }) => api.post(`/hr/offices/${officeId}/assignments`, { employeeId }).then(({ data }) => data.item),
  offices: () => api.get('/hr/offices').then(({ data }) => data.items),
  createOffice: (payload) => api.post('/hr/offices', payload).then(({ data }) => data.item),
  attendance: (params = {}) => api.get('/hr/attendance', { params }).then(({ data }) => data),
};
