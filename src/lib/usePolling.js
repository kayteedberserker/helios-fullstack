import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// One request at a time; pause hidden tabs and discard superseded responses.
export function usePolling(path, { enabled = true, interval = 5000, onData } = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const listener = useRef(onData), runRef = useRef(null);
  listener.current = onData;
  const refresh = useCallback(() => runRef.current?.(), []);
  useEffect(() => {
    let disposed = false, timer, controller, version = 0, failures = 0;
    setState({ data: null, loading: enabled, error: '' });
    if (!enabled) { runRef.current = null; return; }
    const run = async () => {
      clearTimeout(timer); controller?.abort();
      const attempt = ++version;
      if (document.visibilityState === 'hidden' || disposed) return;
      controller = new AbortController();
      try {
        const data = await api(path, { signal: controller.signal });
        if (disposed || attempt !== version) return;
        failures = 0; setState({ data, loading: false, error: '' }); listener.current?.(data);
      } catch (error) {
        if (disposed || attempt !== version || error.name === 'AbortError') return;
        failures++; setState(previous => ({ ...previous, loading: false, error: error.message }));
        if (error.status === 401 || error.status === 403) return;
      }
      if (!disposed && attempt === version) timer = setTimeout(run, Math.min(60000, interval * 2 ** failures));
    };
    runRef.current = run;
    const visible = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); version++; controller?.abort(); } else run(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', run); window.addEventListener('focus', run);
    run();
    return () => { disposed = true; version++; clearTimeout(timer); controller?.abort(); runRef.current = null;
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', run); window.removeEventListener('focus', run); };
  }, [path, enabled, interval]);
  return { ...state, refresh };
}
