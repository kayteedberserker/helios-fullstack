import { useEffect, useState } from 'react';
import { api, IS_DEMO } from '../lib/api.js';

export const googleErrors = {
  not_configured: 'Google sign-in is not configured yet. Use email and password.',
  expired: 'Your Google sign-in expired. Please try again.', cancelled: 'Google sign-in was cancelled.',
  account_exists: 'Sign in with your password, then connect Google from Profile. If Google is already connected, use that same Google account.',
  account_unavailable: 'This account is unavailable or the Google email does not match. Contact support.',
  failed: 'Google sign-in could not be completed. Please try again.',
};
export default function GoogleSignIn({ link = false }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let active = true; if (!IS_DEMO) api('/auth/providers').then(data => { if (active) setEnabled(data.google); }).catch(() => {}); return () => { active = false; }; }, []);
  if (!enabled) return null;
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  return <div className="hx-google-signin"><a className="hx-button hx-button-secondary hx-full-width" href={`${base}/auth/google/start${link ? '?mode=link' : ''}`}>{link ? 'Connect Google sign-in' : 'Continue with Google'}</a>{!link && <p>or use your email</p>}{link && <p>Choose the Google account matching your email. Google-only accounts can set a password using the password-reset email flow.</p>}</div>;
}
