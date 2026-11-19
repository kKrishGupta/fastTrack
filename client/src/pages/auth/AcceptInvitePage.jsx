import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { formatDateTime } from '../../utils/formatters';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirmPassword: '', biometricConsent: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const invitation = useQuery({
    queryKey: ['auth', 'invitation', token],
    queryFn: () => authService.invitation(token),
    enabled: Boolean(token),
    retry: false,
  });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const user = await authService.acceptInvitation({ token, password: form.password, biometricConsent: form.biometricConsent });
      setUser(user);
      navigate(user.enrollmentStatus === 'complete' ? '/employee' : '/employee/enrollment', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token || invitation.isError) {
    return (
      <AuthShell>
        <div className="login-form auth-message-card">
          <span className="auth-message-card__icon auth-message-card__icon--error"><ShieldCheck size={24} /></span>
          <div className="login-form__heading">
            <p className="eyebrow">Invitation unavailable</p>
            <h2>Request a new invite</h2>
            <p>{invitation.error?.message || 'This invitation link is missing its secure token.'}</p>
          </div>
          <Link className="button button--secondary button--md" to="/employee/login">Back to employee sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form className="login-form" onSubmit={submit}>
        <div className="login-form__heading">
          <p className="eyebrow">Employee invitation</p>
          <h2>Join {invitation.data?.organization?.name || 'your organization'}</h2>
          <p>Create your password to activate your employee-only account.</p>
        </div>

        {invitation.isLoading && <div className="invite-summary invite-summary--loading">Checking your secure invitation…</div>}
        {invitation.data && (
          <div className="invite-summary">
            <span><CheckCircle2 size={20} /></span>
            <div>
              <strong>{invitation.data.employeeName}</strong>
              <p><Mail size={13} />{invitation.data.email}</p>
              <small>Employee code: {invitation.data.employeeCode} · Expires {formatDateTime(invitation.data.expiresAt)}</small>
            </div>
          </div>
        )}

        {error && <div className="form-alert" role="alert">{error}</div>}

        <label className="form-field">
          <span>Create password</span>
          <div className="password-field">
            <input required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="At least 10 characters" />
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </label>
        <label className="form-field">
          <span>Confirm password</span>
          <input required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} placeholder="Repeat password" />
        </label>

        <label className="policy-switch"><input required type="checkbox" checked={form.biometricConsent} onChange={(event) => setForm((current) => ({ ...current, biometricConsent: event.target.checked }))} /><span><strong>Biometric attendance consent</strong><small>I agree to enroll my face and submit a fresh encrypted check-in image. Check-in evidence is visible only to authorized HR and expires automatically.</small></span></label>

        <Button className="login-submit" type="submit" disabled={submitting || !invitation.data || !form.biometricConsent}>
          {submitting ? 'Activating account…' : 'Activate employee account'}
          {!submitting && <ArrowRight size={18} />}
        </Button>
        <p className="login-help">This invitation is one-time use and only grants access to the organization shown above.</p>
      </form>
    </AuthShell>
  );
}
