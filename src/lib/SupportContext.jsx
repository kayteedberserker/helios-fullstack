import { createContext, useCallback, useContext, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePolling } from './usePolling.js';

const Context = createContext(null);
export function SupportProvider({ admin, children }) {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false), [summary, setSummary] = useState(null);
  const receive = useCallback(data => setSummary(admin ? data.summary : data.thread), [admin]);
  const poll = usePolling(admin ? '/admin/support/summary' : '/support/summary', {
    interval: 30000, enabled: admin ? location.pathname !== '/admin/support' : !chatOpen, onData: receive,
  });
  return <Context.Provider value={{ summary, updateSummary: setSummary, chatOpen, setChatOpen, refreshSummary: poll.refresh, summaryError: poll.error }}>{children}</Context.Provider>;
}
export const useSupport = () => useContext(Context);
