import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    let active = true;
    api('/auth/me').then(data => { if (active) setUser(data.user); }).catch(error => { if (active && error.status !== 401) setConnectionError(error.message); }).finally(() => { if (active) setLoading(false); });
    const expired = () => setUser(null);
    window.addEventListener('helios:unauthorized', expired);
    return () => { active = false; window.removeEventListener('helios:unauthorized', expired); };
  }, []);
  const signIn = async (path, body) => { const data = await api(path, { method: 'POST', body }); setUser(data.user); setConnectionError(''); return data.user; };
  const signOut = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, connectionError, signIn, signOut, setUser }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
