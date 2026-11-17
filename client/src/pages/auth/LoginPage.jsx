import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';

export function LoginPage({ accountType }) {
  const isEmployee = accountType === 'employee';
  const [form, setForm] = useState({ workspaceSlug: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) navigate(user.role === 'HR' ? '/hr' : '/employee', { replace: true });
  }, [navigate, user]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const authenticatedUser = isEmployee
        ? await authService.loginEmployee(form)
        : await authService.loginOrganization(form);
      setUser(authenticatedUser);
      const requestedPath = location.state?.from?.pathname;
      navigate(requestedPath || (authenticatedUser.role === 'HR' ? '/hr' : '/employee'), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="login-form" onSubmit={submit}>
        <div className="login-form__heading">
          <p className="eyebrow">{isEmployee ? 'Employee portal' : 'Organization administration'}</p>
          <h2>{isEmployee ? 'Employee sign in' : 'Organization sign in'}</h2>
          <p>{isEmployee ? 'Use the account activated from your HR invitation.' : 'Sign in as the HR administrator for this workspace.'}</p>
        </div>

        {error && <div className="form-alert" role="alert">{error}</div>}

        <label className="form-field">
          <span>Workspace ID</span>
          <div className="field-with-icon">
            {isEmployee ? <UserRound size={17} /> : <Building2 size={17} />}
            <input required minLength={3} autoComplete="organization" value={form.workspaceSlug} onChange={updateField('workspaceSlug')} placeholder="your-company" />
          </div>
          <small>Usually your organization name in lowercase, such as acme-labs.</small>
        </label>
        <label className="form-field">
          <span>Work email</span>
          <input type="email" autoComplete="email" required value={form.email} onChange={updateField('email')} placeholder="name@company.com" />
        </label>
        <label className="form-field">
          <span>Password</span>
          <div className="password-field">
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={10} value={form.password} onChange={updateField('password')} placeholder="Enter your password" />
            <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </label>

        <Button className="login-submit" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : isEmployee ? 'Sign in as employee' : 'Sign in as HR'}
          {!submitting && <ArrowRight size={18} />}
        </Button>
        {isEmployee ? (
          <>
            <p className="auth-switch">Organization administrator? <Link to="/organization/login">HR sign in</Link></p>
            <p className="login-help">Your account must first be activated through the invitation sent by HR.</p>
          </>
        ) : (
          <>
            <p className="auth-switch">Setting up a new organization? <Link to="/organization/register">Create a workspace</Link></p>
            <p className="login-help">Employee? <Link to="/employee/login">Go to employee sign in</Link></p>
          </>
        )}
      </form>
    </AuthShell>
  );
}
