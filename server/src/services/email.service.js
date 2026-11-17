import { Resend } from 'resend';
import { ApiError } from '../utils/api-error.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendEmployeeInvitation({
  config,
  invitationId,
  recipientEmail,
  recipientName,
  organizationName,
  workspaceSlug,
  inviteUrl,
  expiresAt,
}) {
  if (!config.resendApiKey || !config.resendFromEmail) {
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'Employee email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL to the server environment',
    );
  }

  const resend = new Resend(config.resendApiKey);
  const safeName = escapeHtml(recipientName);
  const safeOrganization = escapeHtml(organizationName);
  const safeWorkspace = escapeHtml(workspaceSlug);
  const safeUrl = escapeHtml(inviteUrl);
  const safeExpiry = escapeHtml(expiresAt.toISOString());
  try {
    const { data, error } = await resend.emails.send({
      from: `FaceTrack Pro <${config.resendFromEmail}>`,
      to: [recipientEmail],
      subject: `Join ${organizationName} on FaceTrack Pro`,
      html: `
        <div style="background:#f3f5f0;padding:32px 16px;font-family:Arial,sans-serif;color:#15261f">
          <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8e3;border-radius:18px;overflow:hidden">
            <div style="padding:28px;background:#184533;color:#fff">
              <div style="font-size:13px;font-weight:700;color:#b9ed77;letter-spacing:.08em;text-transform:uppercase">FaceTrack Pro</div>
              <h1 style="margin:10px 0 0;font-size:26px">You are invited to ${safeOrganization}</h1>
            </div>
            <div style="padding:28px">
              <p style="margin:0 0 14px">Hello ${safeName},</p>
              <p style="margin:0 0 22px;line-height:1.6;color:#56645d">Your HR administrator invited you to activate an employee-only attendance account.</p>
              <a href="${safeUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#15261f;color:#fff;text-decoration:none;font-weight:700">Activate employee account</a>
              <p style="margin:22px 0 0;font-size:13px;color:#66736c">Workspace ID: <strong>${safeWorkspace}</strong></p>
              <p style="margin:7px 0 0;font-size:12px;color:#87918b">This one-time invitation expires at ${safeExpiry}. If you did not expect it, you can ignore this email.</p>
            </div>
          </div>
        </div>
      `,
      text: `Hello ${recipientName},\n\nYou were invited to join ${organizationName} on FaceTrack Pro.\n\nActivate your employee account: ${inviteUrl}\n\nWorkspace ID: ${workspaceSlug}\nThis one-time invitation expires at ${expiresAt.toISOString()}.`,
      headers: { 'X-Entity-Ref-ID': invitationId },
    });
    if (error || !data?.id) throw new Error(error?.message || 'Resend returned no email ID');
    return data.id;
  } catch {
    throw new ApiError(
      502,
      'INVITATION_EMAIL_FAILED',
      'The invitation was created, but Resend could not accept the email for delivery',
    );
  }
}
