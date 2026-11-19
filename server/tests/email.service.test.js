import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class Resend {
    constructor() {
      this.emails = { send: sendMock };
    }
  },
}));

import { sendEmployeeInvitation } from '../src/services/email.service.js';

const invitation = {
  config: {
    resendApiKey: 're_test_123456789',
    resendFromEmail: 'attendance@example.com',
  },
  invitationId: 'invitation-123',
  recipientEmail: 'employee@example.com',
  recipientName: 'Taylor <Employee>',
  organizationName: 'Example & Company',
  employeeCode: 'EMP-42',
  inviteUrl: 'https://app.example.com/employee/invitations/accept?token=secret',
  expiresAt: new Date('2026-11-24T12:00:00.000Z'),
};

describe('employee invitation email', () => {
  beforeEach(() => sendMock.mockReset());

  it('sends through Resend using the configured sender', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await expect(sendEmployeeInvitation(invitation)).resolves.toBe('email-123');
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'FaceTrack Pro <attendance@example.com>',
      to: ['employee@example.com'],
      subject: 'Join Example & Company on FaceTrack Pro',
    }));
    expect(sendMock.mock.calls[0][0].html).toContain('Taylor &lt;Employee&gt;');
    expect(sendMock.mock.calls[0][0].html).toContain('Example &amp; Company');
    expect(sendMock.mock.calls[0][0].html).toContain('Employee code: <strong>EMP-42</strong>');
    expect(sendMock.mock.calls[0][0].html).toContain('Employee code: <strong>EMP-42</strong>');
  });

  it('requires both Resend settings', async () => {
    await expect(sendEmployeeInvitation({
      ...invitation,
      config: {},
    })).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED', status: 503 });
  });

  it('normalizes provider failures', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Domain not verified' } });

    await expect(sendEmployeeInvitation(invitation)).rejects.toMatchObject({
      code: 'RESEND_SENDER_NOT_VERIFIED',
      status: 502,
      details: expect.objectContaining({ providerMessage: 'Domain not verified' }),
    });
  });
});
