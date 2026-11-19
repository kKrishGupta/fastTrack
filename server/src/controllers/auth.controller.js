import {
  acceptInvitation,
  authenticateCredentials,
  authenticateEmployeeCredentials,
  getInvitationPreview,
  getSessionOrganization,
  registerOrganization,
} from '../services/auth.service.js';
import { serializeSessionUser } from '../utils/serializers.js';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies.js';

export function createAuthController(config) {
  const loginAs = (expectedRole) => async (req, res) => {
    const { user, organization, token } = await authenticateCredentials(
      req.validated.body,
      config,
      expectedRole,
    );
    setAuthCookies(res, token, config);
    res.json({ user: serializeSessionUser(user, organization) });
  };

  return {
    organizationLogin: loginAs('HR'),
    employeeLogin: async (req, res) => {
      const { user, organization, token } = await authenticateEmployeeCredentials(req.validated.body, config);
      setAuthCookies(res, token, config);
      res.json({ user: serializeSessionUser(user, organization) });
    },
    registerOrganization: async (req, res) => {
      const { user, organization, token } = await registerOrganization(req.validated.body, config);
      setAuthCookies(res, token, config);
      res.status(201).json({ user: serializeSessionUser(user, organization) });
    },
    invitation: async (req, res) => {
      res.json({ invitation: await getInvitationPreview(req.validated.params.token) });
    },
    acceptInvitation: async (req, res) => {
      const { user, organization, token } = await acceptInvitation(req.validated.body, config);
      setAuthCookies(res, token, config);
      res.json({ user: serializeSessionUser(user, organization) });
    },
    logout: async (req, res) => {
      clearAuthCookies(res, config);
      res.status(204).end();
    },
    me: async (req, res) => {
      const organization = await getSessionOrganization(req.user);
      res.json({ user: serializeSessionUser(req.user, organization) });
    },
  };
}
