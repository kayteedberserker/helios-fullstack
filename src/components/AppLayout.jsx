import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Beaker, Bot, ChevronRight, CreditCard, LayoutDashboard, LogOut, Menu, MessageCircle, ShieldCheck, Sparkles, UserRound, UsersRound, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { IS_DEMO } from '../lib/api.js';
import { SupportProvider, useSupport } from '../lib/SupportContext.jsx';
import { ContactSupportButton } from './SupportChat.jsx';
import { Brand, initials, useToast } from './ui.jsx';

const userLinks = [{ to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: '/app/agent', label: 'My Agent', icon: Bot }, { to: '/app/profile', label: 'Profile', icon: UserRound }];
const adminLinks = [{ to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard }, { to: '/admin/users', label: 'Users', icon: UsersRound }, { to: '/admin/agents', label: 'Agents & plans', icon: Bot }, { to: '/admin/payments', label: 'Payments', icon: CreditCard }, { to: '/admin/support', label: 'Support', icon: MessageCircle }];

export default function AppLayout({ admin = false }) {
  return <SupportProvider key={admin ? 'admin' : 'user'} admin={admin}><WorkspaceLayout admin={admin} /></SupportProvider>;
}
function WorkspaceLayout({ admin }) {
  const { summary, summaryError } = useSupport();
  const supportCount = summary?.attention || 0;
  const { user, signOut, signIn } = useAuth(); const navigate = useNavigate(), location = useLocation(), toast = useToast();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === 'Escape') { setOpen(false); document.getElementById('hx-menu-toggle')?.focus(); } };
    document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close);
  }, [open]);
  const logout = async () => { try { await signOut(); navigate(admin ? '/admin/login' : '/login'); } catch (error) { toast(error.message); } };
  const switchDemo = async () => { await signIn('/auth/demo', { role: admin ? 'user' : 'admin' }); navigate(admin ? '/app/dashboard' : '/admin/dashboard'); };
  const links = admin ? adminLinks : userLinks;
  const active = links.find(item => location.pathname.startsWith(item.to));
  return <div className="hx-app"><a className="skip-link" href="#workspace-main">Skip to content</a>
    {open && <button className="hx-sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`hx-sidebar ${open ? 'hx-sidebar-open' : ''}`} id="hx-sidebar"><div className="hx-sidebar-brand"><Brand /><button className="hx-icon-button hx-sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <p className="hx-sidebar-label">{admin ? 'ADMINISTRATION' : 'PERSONAL WORKSPACE'}</p>
      <nav aria-label={admin ? 'Admin navigation' : 'Workspace navigation'}>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `hx-nav-link ${isActive ? 'hx-nav-active' : ''}`}><Icon size={19} /><span>{label}</span>{to === '/admin/support' && supportCount > 0 && <span className="hx-support-count" aria-label={`${supportCount} support conversations need attention`}>{supportCount > 99 ? '99+' : supportCount}</span>}<ChevronRight size={15} /></NavLink>)}</nav>
      <div className="hx-sidebar-note"><span className="hx-sidebar-note-icon">{admin ? <ShieldCheck size={21} /> : <Sparkles size={21} />}</span><h3>{admin ? 'A little oversight.' : 'A little more headspace.'}</h3><p>{admin ? 'Keep your agents, people, and plans running smoothly.' : 'Your ideas, plans, and next steps. A calmer place for all of them.'}</p><Link to="/">Visit the Helios website <ChevronRight size={13} /></Link></div>
      <div className="hx-sidebar-bottom"><Link className="hx-account" to={admin ? '/admin/profile' : '/app/profile'}><span className="hx-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span>{admin ? 'Administrator' : 'Personal account'}</span></div><ChevronRight size={16} /></Link><button className="hx-sign-out" onClick={logout}><LogOut size={16} />Sign out</button></div>
    </aside>
    <div className="hx-main-shell"><header className="hx-topbar"><div className="hx-topbar-left"><button className="hx-icon-button hx-mobile-menu" id="hx-menu-toggle" aria-controls="hx-sidebar" aria-expanded={open} aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={21} /></button><span>{admin ? 'Admin workspace' : 'My workspace'}</span><ChevronRight size={13} /><strong>{active?.label || 'Profile'}</strong></div><div className="hx-topbar-right">{admin ? <Link to="/admin/support" className="hx-support-trigger" aria-label={`Support inbox${supportCount ? `, ${supportCount} conversations need attention` : ''}`} title={summaryError ? 'Support updates unavailable. Open the inbox to retry.' : 'Open support inbox'}><MessageCircle size={17} /><span>Support</span>{supportCount > 0 && <span className="hx-support-count" aria-label={`${supportCount} support conversations need attention`}>{supportCount > 99 ? '99+' : supportCount}</span>}</Link> : <ContactSupportButton />}<span className="hx-workspace-label"><i className="hx-live-dot" />{IS_DEMO ? 'Demo workspace' : 'Helios workspace'}</span><Link to={admin ? '/admin/profile' : '/app/profile'} className="hx-topbar-avatar" aria-label="Your profile">{initials(user.name)}</Link></div></header>
      {IS_DEMO && <div className="hx-demo-banner"><Beaker size={16} /><p>Preview mode <span>· Demo data, sample AI responses, and no real payments.</span></p><button onClick={switchDemo}>Explore {admin ? 'user' : 'admin'} view <ChevronRight size={14} /></button></div>}
      <main className="hx-main" id="workspace-main" tabIndex={-1}><Outlet /></main><footer className="hx-app-footer"><span>Helios. A little less to think about.</span><span>© {new Date().getFullYear()}</span></footer>
    </div>
  </div>;
}
