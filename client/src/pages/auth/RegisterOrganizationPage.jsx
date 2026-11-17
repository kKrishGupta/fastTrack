import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../../components/auth/AuthShell';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';

function createSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function RegisterOrganizationPage() {
  const [form, setForm] = useState({
    organizationName: '',
    workspaceSlug: '',
    adminName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(user.role === 'HR' ? '/hr' : '/employee', { replace: true });
  }, [navigate, user]);

  const update = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'organizationName' && !slugEdited ? { workspaceSlug: createSlug(value) } : {}),
    }));
  };

  const updateSlug = (event) => {
    setSlugEdited(true);
    setForm((current) => ({ ...current, workspaceSlug: createSlug(event.target.value) }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const { confirmPassword, ...payload } = form;
      const registeredUser = await authService.registerOrganization(payload);
      setUser(registeredUser);
      navigate('/hr', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="login-form login-form--wide" onSubmit={submit}>
        <div className="login-form__heading">
          <p className="eyebrow">Start your organization</p>
          <h2>Create a workspace</h2>
          <p>You become the HR administrator and can invite employees after setup.</p>
        </div>

        {error && <div className="form-alert" role="alert">{error}</div>}

        <div className="form-grid">
          <label className="form-field form-grid__wide">
            <span>Organization name</span>
            <input autoFocus required minLength={2} value={form.organizationName} onChange={update('organizationName')} placeholder="Acme Labs Private Limited" />
          </label>
          <label className="form-field form-grid__wide">
            <span>Workspace ID</span>
            <div className="field-with-icon">
              <Building2 size={17} />
              <input required minLength={3} value={form.workspaceSlug} onChange={updateSlug} placeholder="acme-labs" />
            </div>
            <small>Employees will enter this ID when signing in. It cannot contain spaces.</small>
          </label>
          <label className="form-field">
            <span>Your full name</span>
            <input required minLength={2} autoComplete="name" value={form.adminName} onChange={update('adminName')} placeholder="HR administrator" />
          </label>
          <label className="form-field">
            <span>Work email</span>
            <input required type="email" autoComplete="email" value={form.email} onChange={update('email')} placeholder="hr@company.com" />
          </label>
          <label className="form-field">
            <span>Password</span>
            <div className="password-field">
              <input required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={update('password')} placeholder="At least 10 characters" />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <label className="form-field">
            <span>Confirm password</span>
            <input required minLength={10} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={update('confirmPassword')} placeholder="Repeat password" />
          </label>
        </div>

        <Button className="login-submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating workspace…' : 'Create organization'}
          {!submitting && <ArrowRight size={18} />}
        </Button>
        <p className="auth-switch">Already have a workspace? <Link to="/organization/login">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
