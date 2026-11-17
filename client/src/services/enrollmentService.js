import { api } from '../api';

export const enrollmentService = {
  async start() {
    const { data } = await api.post('/employee/enrollment/start');
    return data;
  },
  async capture(payload) {
    const { data } = await api.post('/employee/enrollment/capture', payload);
    return data;
  },
  async complete(sessionId) {
    const { data } = await api.post('/employee/enrollment/complete', { sessionId });
    return data;
  },
};
