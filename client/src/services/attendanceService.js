import { api } from '../api';

export const attendanceService = {
  today: () => api.get('/attendance/today').then(({ data }) => data.item),
  history: (params = {}) => api.get('/attendance/history', { params }).then(({ data }) => data),
  assignedOffices: () => api.get('/employee/offices').then(({ data }) => data.items),
  createChallenge: () => api.post('/attendance/challenge', {}).then(({ data }) => data.challenge),
  verifyLocation: (payload) => api.post('/attendance/verify-location', payload).then(({ data }) => data),
  verifyFace: (payload) => api.post('/attendance/verify-face', payload).then(({ data }) => data),
  checkIn: (challengeId) => api.post('/attendance/check-in', { challengeId }).then(({ data }) => data.item),
  checkOut: () => api.post('/attendance/check-out').then(({ data }) => data.item),
};
