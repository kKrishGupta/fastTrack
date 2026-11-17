import { api } from '../api';
export const wfhService = {
  employeeRequests: (params = {}) => api.get('/employee/wfh-requests', { params }).then(({ data }) => data),
  createRequest: (payload) => api.post('/employee/wfh-requests', payload).then(({ data }) => data.item),
  organizationRequests: (params = {}) => api.get('/hr/wfh-requests', { params }).then(({ data }) => data),
  reviewRequest: ({ id, ...payload }) => api.patch(`/hr/wfh-requests/${id}`, payload).then(({ data }) => data.item),
};
