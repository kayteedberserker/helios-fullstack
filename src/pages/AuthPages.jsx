import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Beaker, Check, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Brand, Button, ErrorMessage, Field, Loading, OrbitArt } from '../components/ui.jsx';

function AuthLayout({ children, admin }) { return <main className="hx-auth"><section className="hx-auth-story"><Brand /><div className="hx-auth-story-copy"><p className="hx-eyebrow">{admin ? 'BEHIND THE LITTLE THINGS' : 'A LITTLE LESS TO THINK ABOUT'}</p><h1>{admin ? <>Good things.<br />Well looked after.</> : <>Big day?<br /><em>A little help.</em></>}</h1><p>{admin ? 'A thoughtful home for your agents, your customers, and the work that keeps Helios moving.' : 'Meet the AI agent that helps you turn busy days into clearer plans. Yours to shape. Ready when you are.'}</p><OrbitArt /><div className="hx-auth-story-note"><span><Sparkles size={17} /></span><div><strong>One agent. Yours.</strong><p>Plans, drafts, ideas, and a clear next step.</p></div></div></div><span className="hx-auth-story-footer">More headspace. More possibility.</span></section><section className="hx-auth-form-side"><Link className="hx-back-link" to="/"><ArrowLeft size={15} />Back to Helios</Link><div className="hx-auth-form-wrap">{children}</div><footer><Link to={admin ? '/login' : '/admin/login'}>{admin ? 'Looking for your personal workspace?' : 'Administrator? Visit the admin portal.'}</Link><span>© {new Date().getFullYear()} Helios</span></footer></section></main>; }

export function AuthPage({ signup = false, admin = false }) {
  const { user, loading, connectionError, signIn } = useAuth(), navigate = useNavigate(), location = useLocation(); const [query] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: query.get('email') || '', password: '', token: query.get('token') || '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [visible, setVisible] = useState(false);
  useEffect(() => { document.title = `${admin ? 'Admin ' : ''}${signup ? 'Sign up' : 'Sign in'} · Helios`; }, [admin, signup]);
  const update = key => event => setForm({ ...form, [key]: event.target.value });
  if (loading) return <AuthLayout admin={admin}><Loading /></AuthLayout>;
  if (user) return <Navigate replace to={user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard'} />;
  const submit = async event => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const body = signup ? { name: form.name, email: form.email, password: form.password, ...(admin ? { token: form.token } : {}) } : { email: form.email, password: form.password };
      const value = await signIn(`/auth/${admin ? 'admin/' : ''}${signup ? 'signup' : 'login'}`, body);
      const plan = query.get('plan'); const period = query.get('period') === 'yearly' ? 'yearly' : 'monthly';
      const from = location.state?.from;
      if (value.role === 'user' && typeof from === 'string' && (from.startsWith('/app/') || from.startsWith('/payment/callback?'))) { navigate(from, { replace: true }); return; }
      navigate(value.role === 'admin' ? '/admin/dashboard' : `/app/dashboard${plan && plan !== 'free' ? `?plan=${encodeURIComponent(plan)}&period=${period}` : ''}`, { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const openDemo = async () => { setBusy(true); try { await signIn('/auth/demo', { role: admin ? 'admin' : 'user' }); navigate(admin ? '/admin/dashboard' : '/app/dashboard'); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <AuthLayout admin={admin}><span className="hx-auth-icon">{admin ? <ShieldCheck size={23} /> : <Sparkles size={23} />}</span><p className="hx-eyebrow">{admin ? 'HELIOS ADMIN' : 'YOUR NEXT CHAPTER'}</p><h2>{signup ? admin ? 'Join the admin team.' : 'Make room for more.' : 'Welcome back.'}</h2><p className="hx-auth-description">{signup ? admin ? 'Use your invitation to create your administrator account.' : 'Your own agent. A calmer kind of everyday.' : admin ? 'Sign in to look after your Helios workspace.' : 'Your agent is ready to pick up where you left off.'}</p>
    {IS_DEMO && <div className="hx-auth-demo"><Beaker size={18} /><p>This is a demo. Passwords are never saved. {admin ? 'Use the button below to preview admin tools.' : signup ? 'This form creates a browser-only demo profile.' : 'Signing in opens a sample account.'}</p></div>}
    <ErrorMessage message={error || connectionError} />
    <form className="hx-form" onSubmit={submit}>{signup && <Field label="Your name" value={form.name} onChange={update('name')} placeholder="Maya Thompson" autoComplete="name" minLength={2} maxLength={80} required />}
      <Field label="Email address" type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" autoComplete="email" maxLength={254} required />
      <div className="hx-password-field"><Field label="Password" type={visible ? 'text' : 'password'} value={form.password} onChange={update('password')} placeholder={signup ? 'At least 10 characters' : 'Your password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 10 : 1} maxLength={72} required /><button type="button" className="hx-password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
      {signup && admin && <Field label="Invitation token" value={form.token} onChange={update('token')} placeholder="From your private invitation link" autoComplete="off" required hint="Admin registration is restricted to invited team members." />}
      {!signup && <Link className="hx-forgot-link" to="/forgot-password">Forgot your password?</Link>}
      <Button type="submit" busy={busy} className="hx-full-width">{signup ? admin ? 'Create admin account' : IS_DEMO ? 'Create demo profile' : 'Create account' : 'Sign in'}<ArrowRight size={17} /></Button>
    </form><p className="hx-auth-switch">{signup ? 'Already have an account?' : 'New here?'} <Link to={signup ? admin ? '/admin/login' : '/login' : admin ? '/admin/signup' : '/signup'}>{signup ? 'Sign in' : admin ? 'Accept an invitation' : 'Create an account'}</Link></p>
    {IS_DEMO && <Button variant="secondary" className="hx-full-width" onClick={openDemo} busy={busy}><Beaker size={17} />Open {admin ? 'admin' : 'user'} demo workspace</Button>}
    <p className="hx-auth-secure"><LockKeyhole size={13} />{IS_DEMO ? 'Preview only. No real account or payment.' : 'Your account stays in your hands.'}</p>
  </AuthLayout>;
}

export function PasswordPage({ reset = false }) {
  const [query] = useSearchParams(), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const submit = async event => { event.preventDefault(); setError(''); if (reset && password !== confirm) { setError('The passwords do not match.'); return; } setBusy(true); try { const response = await api(reset ? '/auth/reset-password' : '/auth/forgot-password', { method: 'POST', body: reset ? { token: query.get('token') || '', password } : { email } }); setMessage(response.message); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <AuthLayout><span className="hx-auth-icon"><LockKeyhole size={23} /></span><h2>{reset ? 'A fresh start.' : 'Let’s get you back in.'}</h2><p className="hx-auth-description">{reset ? 'Choose a new password for your Helios account.' : 'Enter your email and we’ll send a password reset link.'}</p><ErrorMessage message={error} />{message ? <div className="hx-success"><Check size={19} /><p>{message}</p></div> : <form className="hx-form" onSubmit={submit}>{reset ? <><Field label="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={10} maxLength={72} autoComplete="new-password" required hint="Use at least 10 characters." /><Field label="Confirm password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={10} maxLength={72} autoComplete="new-password" required /></> : <Field label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />}<Button type="submit" busy={busy} className="hx-full-width">{reset ? 'Update password' : 'Send reset link'}<ArrowRight size={17} /></Button></form>}<p className="hx-auth-switch"><Link to="/login">Back to sign in</Link></p>{IS_DEMO && <p className="hx-muted">Email delivery is available when the real backend and SMTP are configured.</p>}</AuthLayout>;
}
