import { api } from '../api';

export const authService = {
  async loginOrganization(credentials) {
    const { data } = await api.post('/organization/login', credentials);
    return data.user;
  },
  async loginEmployee(credentials) {
    const { data } = await api.post('/employee/login', credentials);
    return data.user;
  },
  async registerOrganization(payload) {
    const { data } = await api.post('/organization/register', payload);
    return data.user;
  },
  async invitation(token) {
    const { data } = await api.get(`/employee/invitations/${encodeURIComponent(token)}`);
    return data.invitation;
  },
  async acceptInvitation(payload) {
    const { data } = await api.post('/employee/invitations/accept', payload);
    return data.user;
  },
  async me() {
    const { data } = await api.get('/session/me');
    return data.user;
  },
  async logout() {
    await api.post('/session/logout');
  },
};
