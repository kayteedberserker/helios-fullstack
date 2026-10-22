import { Component, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import { Button, ButtonLink, Empty, Loading, ToastProvider } from './components/ui.jsx';
import AppLayout from './components/AppLayout.jsx';
import LandingPage from './pages/LandingPage.jsx';
import { AuthPage, PasswordPage } from './pages/AuthPages.jsx';
import UserDashboard from './pages/UserDashboard.jsx';
import AgentPage from './pages/AgentPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AdminSupportPage from './pages/AdminSupportPage.jsx';
import PaymentCallback from './pages/PaymentCallback.jsx';
import { AdminDashboard, AdminUsers, AdminAgents, AdminPayments } from './pages/AdminPages.jsx';

function Protected({ role }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <div className="hx-route-loading"><Loading /></div>;
  if (!user) return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== role) return <Navigate replace to={user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard'} />;
  return <Outlet />;
}
function RouteScroll() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]); return null; }
function NotFound() { const { user } = useAuth(); return <div className="hx-not-found"><Empty icon={Compass} title="A little off the beaten path." description="This page doesn’t exist. Let’s find your way back."><ButtonLink to={user ? user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard' : '/'}>Back to Helios</ButtonLink></Empty></div>; }
class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="hx-not-found"><Empty title="Something needs a fresh start." description="Reload the page to open your Helios workspace again."><Button onClick={() => window.location.reload()}>Reload page</Button></Empty></div> : this.props.children; }
}
export default function App() {
  return <ErrorBoundary><BrowserRouter><AuthProvider><ToastProvider><RouteScroll /><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<AuthPage />} /><Route path="/signup" element={<AuthPage signup />} />
    <Route path="/admin/login" element={<AuthPage admin />} /><Route path="/admin/signup" element={<AuthPage signup admin />} />
    <Route path="/forgot-password" element={<PasswordPage />} /><Route path="/reset-password" element={<PasswordPage reset />} />
    <Route element={<Protected role="user" />}><Route element={<AppLayout />}>
      <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/app/dashboard" element={<UserDashboard />} /><Route path="/app/agent" element={<AgentPage />} />
      <Route path="/app/profile" element={<ProfilePage />} /><Route path="/payment/callback" element={<PaymentCallback />} />
    </Route></Route>
    <Route element={<Protected role="admin" />}><Route element={<AppLayout admin />}>
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} /><Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/agents" element={<AdminAgents />} /><Route path="/admin/payments" element={<AdminPayments />} />
      <Route path="/admin/profile" element={<ProfilePage />} /><Route path="/admin/support" element={<AdminSupportPage />} />
    </Route></Route>
    <Route path="*" element={<NotFound />} />
  </Routes></ToastProvider></AuthProvider></BrowserRouter></ErrorBoundary>;
}
