import { useEffect, useState } from 'react';
import { ArrowLeft, Headphones, Inbox, RefreshCw, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { usePolling } from '../lib/usePolling.js';
import { useSupport } from '../lib/SupportContext.jsx';
import { SupportConversation } from '../components/SupportChat.jsx';
import { Badge, Button, Empty, ErrorMessage, initials, PageIntro, Pagination } from '../components/ui.jsx';

const filters = [['all', 'All'], ['waiting', 'Awaiting reply'], ['unread', 'Unread'], ['resolved', 'Resolved']];
export default function AdminSupportPage() {
  const [params, setParams] = useSearchParams(), selected = params.get('thread') || '';
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [page, setPage] = useState(1);
  const { updateSummary, summary } = useSupport();
  const [cachedConversation, setCachedConversation] = useState(null);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(timer); }, [search]);
  const path = `/admin/support?${new URLSearchParams({ status, search: query, page: String(page), ...(selected ? { selected } : {}) })}`;
  const resource = usePolling(path, { onData: data => { updateSummary(data.summary); setCachedConversation(data.conversation); } }), data = resource.data;
  const select = id => setParams(id ? { thread: id } : {});
  const conversation = cachedConversation?.thread._id === selected ? cachedConversation : null;
  return <><PageIntro eyebrow="PEOPLE HELPING PEOPLE" title="A little human help." description="Your customers’ questions, all in one place." actions={<Button variant="secondary" onClick={resource.refresh}><RefreshCw size={15} />Refresh</Button>} />
    <div className="hx-support-metrics">{[['waiting', 'Awaiting reply'], ['unread', 'Unread conversations'], ['open', 'Open'], ['resolved', 'Resolved']].map(([key, label]) => <div key={key}><span>{label}</span><strong>{summary?.[key] ?? '—'}</strong></div>)}</div>
    <div className={`hx-support-inbox ${selected ? 'hx-support-selected' : ''}`}>
      <section className="hx-support-list" aria-label="Support inbox"><div className="hx-support-list-heading"><span className="hx-support-icon"><Headphones size={21} /></span><div><h2>Support inbox</h2><p>Replies from the Helios team</p></div></div>
        <label className="hx-support-search"><Search size={16} /><span className="hx-sr-only">Search customers by name or email</span><input type="search" maxLength={80} placeholder="Find a customer…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="hx-support-filters" aria-label="Conversation filter">{filters.map(([value, label]) => <button key={value} aria-pressed={value === status} className={value === status ? 'hx-support-filter-active' : ''} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}</div>
        {resource.error && <ErrorMessage message={resource.error} />}
        <div className="hx-support-threads" aria-busy={resource.loading}>{!data ? <p className="hx-support-empty-note" role="status">{resource.error ? 'Could not load the inbox. Use Refresh to retry.' : 'Loading support inbox…'}</p> : !data.threads.length ? <Empty icon={Inbox} title="All clear here." description="Customer messages matching this filter will appear here." /> : data.threads.map(thread => <button key={thread._id} className={`hx-support-thread ${selected === thread._id ? 'hx-support-thread-active' : ''}`} onClick={() => select(thread._id)} aria-pressed={selected === thread._id}><span className="hx-avatar">{initials(thread.customer?.name)}</span><div><div><strong>{thread.customer?.name || 'Customer'}</strong>{thread.unread > 0 && <span className="hx-support-count" aria-label={`${thread.unread} unread messages`}>{thread.unread > 99 ? '99+' : thread.unread}</span>}</div><p>{thread.lastSenderRole === 'admin' ? 'Support: ' : ''}{thread.lastMessageText}</p><div><Badge status={thread.status === 'resolved' ? 'active' : thread.needsReply ? 'pending' : 'blue'}>{thread.status === 'resolved' ? 'Resolved' : thread.needsReply ? 'Awaiting reply' : 'Replied'}</Badge><time dateTime={thread.lastMessageAt}>{new Date(thread.lastMessageAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time></div></div></button>)}</div>
        {data && <Pagination data={data} onChange={setPage} />}
      </section>
      <section className="hx-support-detail" aria-label="Selected support conversation">{!selected ? <Empty icon={MessageIcon} title="Good help starts with listening." description="Choose a conversation to read the messages and send a reply." /> : !conversation ? <div className="hx-support-detail-loading"><Button variant="secondary" onClick={() => select('')}><ArrowLeft size={15} />Back to inbox</Button><p role="status">{resource.error ? 'Conversation unavailable. Return to the inbox or refresh.' : 'Loading conversation…'}</p></div> : <><header className="hx-support-customer"><button className="hx-support-back hx-icon-button" onClick={() => select('')} aria-label="Back to support inbox"><ArrowLeft size={20} /></button><span className="hx-avatar">{initials(conversation.thread.customer?.name)}</span><div><h2>{conversation.thread.customer?.name || 'Customer'}</h2><p>{conversation.thread.customer?.email}</p></div></header><SupportConversation key={selected} role="admin" endpoint={`/admin/support/${selected}`} payload={conversation} refresh={resource.refresh} loading={resource.loading} error={resource.error} onThreadChange={() => resource.refresh()} /></>}</section>
    </div><p className="hx-support-team-note">Unread counts are shared across the support team. Reading a conversation clears its unread badge; “Awaiting reply” stays until an admin responds or resolves it.</p>
  </>;
}
const MessageIcon = Headphones;
