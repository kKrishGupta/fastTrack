import { api } from '../api';

export const hrService = {
  departments: () => api.get('/hr/departments').then(({ data }) => data.items),
  createDepartment: (payload) => api.post('/hr/departments', payload).then(({ data }) => data.item),
  employees: (params = {}) => api.get('/hr/employees', { params }).then(({ data }) => data),
  inviteEmployee: (payload) => api.post('/hr/employees/invitations', payload).then(({ data }) => data),
  revokeEmployeeInvitations: (employeeId) => api.delete(`/hr/employees/${employeeId}/invitations`).then(({ data }) => data),
  deleteEmployee: (employeeId) => api.delete(`/hr/employees/${employeeId}`).then(({ data }) => data),
  assignOffice: ({ officeId, employeeId }) => api.post(`/hr/offices/${officeId}/assignments`, { employeeId }).then(({ data }) => data.item),
  offices: () => api.get('/hr/offices').then(({ data }) => data.items),
  createOffice: (payload) => api.post('/hr/offices', payload).then(({ data }) => data.item),
  updateOffice: ({ id, ...payload }) => api.patch(`/hr/offices/${id}`, payload).then(({ data }) => data.item),
  attendancePolicy: () => api.get('/hr/attendance-policy').then(({ data }) => data),
  updateAttendancePolicy: (payload) => api.put('/hr/attendance-policy', payload).then(({ data }) => data),
  attendance: (params = {}) => api.get('/hr/attendance', { params }).then(({ data }) => data),
  faceEvidence: (evidenceId) => api.get(`/hr/face-evidence/${evidenceId}`, { responseType: 'blob' }).then(({ data }) => data),
  faceEvidenceList: (params = {}) => api.get('/hr/face-evidence', { params }).then(({ data }) => data),
};
