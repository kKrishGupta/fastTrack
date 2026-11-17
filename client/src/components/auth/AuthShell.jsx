import { Check, LockKeyhole, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { Brand } from '../common/Brand';

export function AuthShell({ children }) {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-story__glow login-story__glow--one" />
        <div className="login-story__glow login-story__glow--two" />
        <Brand inverse />
        <div className="login-story__content">
          <span className="login-kicker"><Sparkles size={14} /> Organization attendance, simplified</span>
          <h1>One workspace.<br /><em>Your people only.</em></h1>
          <p>Create a private organization workspace, invite employees, and keep every attendance record isolated to your team.</p>
          <div className="login-benefits">
            <div><span><MapPin size={18} /></span><p><strong>Verified location</strong>Server-side geofence decisions</p></div>
            <div><span><ShieldCheck size={18} /></span><p><strong>Tenant isolation</strong>Every query is scoped to one organization</p></div>
            <div><span><LockKeyhole size={18} /></span><p><strong>Invite-only access</strong>Employees activate one-time invitations</p></div>
          </div>
        </div>
        <p className="login-story__foot"><Check size={15} /> Built for accountable, human-reviewed attendance</p>
      </section>

      <section className="login-panel">
        <div className="login-panel__mobile-brand"><Brand /></div>
        {children}
      </section>
    </main>
  );
}
