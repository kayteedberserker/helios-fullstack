import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CheckCheck, Headphones, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { usePolling } from '../lib/usePolling.js';
import { useSupport } from '../lib/SupportContext.jsx';
import { Badge, Button, ErrorMessage, Modal } from './ui.jsx';
import { mergeSupportMessages, mergeSupportPage } from '../../shared/support-history.js';

const timeLabel = value => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

export function SupportConversation({ payload, role = 'user', endpoint = '/support', refresh, loading, error, onThreadChange }) {
  const [messages, setMessages] = useState([]), [thread, setThread] = useState(null), [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [olderBusy, setOlderBusy] = useState(false), [statusBusy, setStatusBusy] = useState(false);
  const [actionError, setActionError] = useState(''), [away, setAway] = useState(false);
  const scroll = useRef(null), sticky = useRef(true), anchor = useRef(null), replay = useRef(null), alive = useRef(true), sending = useRef(false);
  const read = useRef({ through: 0, busy: false }), acknowledgeRef = useRef(null), onChange = useRef(onThreadChange), composerId = useId();
  const historyRef = useRef(messages); historyRef.current = messages;
  onChange.current = onThreadChange;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!payload) return;
    setThread(previous => !previous || (payload.thread && payload.thread.sequence >= previous.sequence) ? payload.thread : previous);
    const previous = historyRef.current, merged = mergeSupportPage(previous, payload.messages);
    setMessages(merged.messages);
    if (!previous.length || merged.reset) setHasOlder(payload.hasOlder);
  }, [payload]); // Older pages stay in memory when the latest page is polled.
  useLayoutEffect(() => {
    if (!scroll.current) return;
    if (anchor.current) { scroll.current.scrollTop = anchor.current.top + scroll.current.scrollHeight - anchor.current.height; anchor.current = null; }
    else if (sticky.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const acknowledge = async () => {
      if (!thread || !sticky.current || document.visibilityState === 'hidden' || !document.hasFocus() || read.current.busy) return;
      const through = Math.max(0, ...messages.filter(m => m.senderRole !== role).map(m => m.senderCount));
      if (through <= read.current.through) return;
      read.current.busy = true;
      try {
        const data = await api(`${endpoint}/read`, { method: 'POST', body: { through } });
        if (!alive.current) return;
        read.current.through = through;
        setThread(previous => data.thread?.sequence >= (previous?.sequence || 0) ? { ...previous, ...data.thread } : previous);
        onChange.current?.(data.thread);
      } catch { /* A later poll retries the acknowledgement; messages remain readable. */ }
      finally { read.current.busy = false; }
    };
    acknowledgeRef.current = acknowledge;
    acknowledge(); document.addEventListener('visibilitychange', acknowledge); window.addEventListener('focus', acknowledge);
    return () => { acknowledgeRef.current = null; document.removeEventListener('visibilitychange', acknowledge); window.removeEventListener('focus', acknowledge); };
  }, [messages, thread?._id, endpoint, role]);
  const send = async event => {
    event.preventDefault(); const content = draft.trim();
    if (!content || sending.current) return;
    sending.current = true; setBusy(true); setActionError('');
    if (replay.current?.content !== content) replay.current = { content, clientId: crypto.randomUUID() };
    try {
      const result = await api(`${endpoint}/messages`, { method: 'POST', body: replay.current });
      if (!alive.current) return;
      sticky.current = true; setAway(false); setMessages(previous => mergeSupportMessages(previous, [result.message]));
      setThread(previous => ({ ...previous, ...result.thread })); setDraft(''); replay.current = null;
      onChange.current?.(result.thread); refresh();
    } catch (err) { if (alive.current) setActionError(err.message); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  const loadOlder = async () => {
    setOlderBusy(true); setActionError('');
    try {
      const path = role === 'admin' ? `${endpoint}/messages` : '/support/thread';
      const result = await api(`${path}?before=${messages[0].sequence}`);
      if (!alive.current) return;
      anchor.current = { top: scroll.current.scrollTop, height: scroll.current.scrollHeight };
      setMessages(previous => mergeSupportMessages(previous, result.messages)); setHasOlder(result.hasOlder);
    } catch (err) { if (alive.current) setActionError(err.message); }
    finally { if (alive.current) setOlderBusy(false); }
  };
  const setStatus = async () => {
    setStatusBusy(true); setActionError('');
    try {
      const result = await api(endpoint, { method: 'PATCH', body: { status: thread.status === 'resolved' ? 'open' : 'resolved', expectedSequence: thread.sequence } });
      if (!alive.current) return;
      setThread(previous => ({ ...previous, ...result.thread })); onChange.current?.(result.thread); refresh();
    } catch (err) { if (alive.current) { setActionError(err.message); refresh(); } }
    finally { if (alive.current) setStatusBusy(false); }
  };
  return <div className="hx-support-conversation">
    <div className="hx-support-status"><div><Badge status={thread?.status === 'resolved' ? 'active' : thread?.needsReply ? 'pending' : 'blue'}>{thread?.status === 'resolved' ? 'Resolved' : thread?.needsReply ? 'Awaiting reply' : 'Support conversation'}</Badge><span>{IS_DEMO ? 'Demo · ' : ''}{error ? 'Updates paused · retrying' : 'Updates every 5 seconds'}</span></div>
      {role === 'admin' && thread && <Button variant="secondary" busy={statusBusy} disabled={busy} onClick={setStatus}><CheckCheck size={15} />{thread.status === 'resolved' ? 'Reopen' : 'Resolve'}</Button>}
    </div>
    {error && <div className="hx-support-connection"><ErrorMessage message={error} /><Button variant="secondary" onClick={refresh}><RefreshCw size={14} />Retry</Button></div>}
    <div className="hx-support-history" ref={scroll} role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-busy={loading || olderBusy} onScroll={() => { const node = scroll.current; sticky.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70; setAway(!sticky.current); if (sticky.current) acknowledgeRef.current?.(); }}>
      {hasOlder && <Button className="hx-support-older" variant="secondary" busy={olderBusy} onClick={loadOlder}>Load earlier messages</Button>}
      {loading && !payload ? <p className="hx-support-empty-note" role="status">Loading your conversation…</p> : !messages.length ? <div className="hx-support-welcome"><span><Headphones size={27} /></span><h3>A real person, here to help.</h3><p>Questions about your agent, account, or plan? Leave a message for the Helios team. You can return here to see their reply.</p><small>Support messages are separate from your AI agent.</small></div> : messages.map(message => <div key={message._id} className={`hx-support-message ${message.senderRole === role ? 'hx-support-mine' : ''}`}><span>{message.senderRole === role ? 'You' : message.senderName}</span><p>{message.content}</p><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>)}
    </div>
    {away && <button className="hx-support-jump" onClick={() => { sticky.current = true; scroll.current.scrollTop = scroll.current.scrollHeight; setAway(false); }}>Go to latest messages ↓</button>}
    <form className="hx-support-composer" onSubmit={send}><ErrorMessage message={actionError} />
      {thread?.status === 'resolved' && <p className="hx-support-reopen-note">Sending a message reopens this conversation.</p>}
      <label htmlFor={composerId}>{role === 'admin' ? 'Reply to customer' : 'Message Helios support'}</label>
      <div><textarea id={composerId} rows={3} maxLength={4000} placeholder={role === 'admin' ? 'Write a helpful reply…' : 'How can we help?'} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /><Button type="submit" busy={busy} disabled={!draft.trim() || statusBusy || (loading && !payload)} aria-label={role === 'admin' ? 'Send support reply' : 'Send support message'}><Send size={17} /><span>Send</span></Button></div>
      <p><span>Enter to send · Shift + Enter for a new line</span><span>{draft.length}/4,000</span></p>
    </form>
  </div>;
}

export function ContactSupportButton() {
  const { summary, chatOpen, setChatOpen } = useSupport();
  return <><button className="hx-support-trigger" onClick={() => setChatOpen(true)} aria-label={`Contact Helios support${summary?.unread ? `, ${summary.unread} unread replies` : ''}`} aria-haspopup="dialog" aria-expanded={chatOpen}><MessageCircle size={17} /><span>Contact us</span>{summary?.unread > 0 && <span className="hx-support-count" aria-label={`${summary.unread} unread support replies`}>{summary.unread > 99 ? '99+' : summary.unread}</span>}</button>{chatOpen && <CustomerSupportModal />}</>;
}
function CustomerSupportModal() {
  const { setChatOpen, updateSummary, refreshSummary } = useSupport();
  const resource = usePolling('/support/thread', { onData: data => updateSummary(data.thread) });
  const close = () => { setChatOpen(false); refreshSummary(); };
  return <Modal title="Helios support" subtitle="A little help from the people behind Helios." className="hx-support-modal" onClose={close}><SupportConversation payload={resource.data} refresh={resource.refresh} loading={resource.loading} error={resource.error} onThreadChange={thread => { updateSummary(thread); resource.refresh(); }} /></Modal>;
}
