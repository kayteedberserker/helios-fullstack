import AdminPaymentDetails from '../components/AdminPaymentDetails.jsx';
import { currencies, isPrice, maximumPrice, minimumPrice, pricePeriods, resolvePlanPrices } from '../../shared/pricing.js';
import { paymentPresentation } from '../../shared/billing.js';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Check, CheckCircle2, Copy, CreditCard, Download, Mail, MessageSquare, Plus, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { downloadCsv } from '../lib/exportCsv.js';
import { ActivityList, Badge, Button, dateLabel, Empty, ErrorMessage, Field, initials, Modal, money, OrbitArt, PageIntro, Pagination, Panel, PanelTitle, ResourceState, SmallLink, useToast } from '../components/ui.jsx';
import AgentCard from '../components/AgentCard.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';

function PaymentTable({ payments, compact = false, onOpen }) { return payments.length ? <div className="hx-table-wrap"><table className="hx-table"><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th>{!compact && <th>Reference</th>}<th>Date</th>{onOpen && <th>Details</th>}</tr></thead><tbody>{payments.map(payment => <tr key={payment._id}><td><div className="hx-table-person"><span className="hx-small-avatar">{initials(payment.userId?.name)}</span><div><strong>{payment.userId?.name || 'Customer'}</strong><small>{payment.userId?.email}</small></div></div></td><td><strong>{payment.planName}</strong><small>{payment.period}</small></td><td>{money(payment.amount, payment.currency)}</td><td><Badge status={paymentPresentation(payment).badge}>{payment.demo ? `Demo · ${payment.status}` : paymentPresentation(payment).label}</Badge>{payment.reviewReason && <small>{({ checkout_replaced: 'Checkout replaced', renewal_too_early: 'Renewal too early', active_higher_plan: 'Higher plan active' })[payment.reviewReason]}</small>}</td>{!compact && <td><code title={payment.reference}>{payment.reference}</code></td>}<td>{dateLabel(payment.paidAt || payment.createdAt)}</td>{onOpen && <td><Button variant="secondary" className="hx-payment-open" onClick={() => onOpen(payment._id)} aria-label={`Open payment details for ${payment.reference}`}>View details</Button></td>}</tr>)}</tbody></table></div> : <Empty icon={CreditCard} title="No payments here yet" description="Verified purchases will appear here as your customers join." />; }

export function AdminDashboard() {
  const resource = useResource('/admin/dashboard'), data = resource.data;
  const [paymentId, setPaymentId] = useState(null);
  return <><PageIntro eyebrow="THE BIGGER PICTURE" title="A little oversight." description="Your people, your agents, and everything that keeps Nooky moving." actions={<Button variant="secondary" onClick={resource.refresh} disabled={resource.loading}><RefreshCw size={15} />Refresh</Button>} /><ResourceState resource={resource}>{data && <>
    <div className="hx-stats hx-admin-stats">{[{ label: 'Customers', value: data.stats.users, note: 'All customer accounts', icon: UsersRound, color: 'blue' }, { label: 'Active agents', value: data.stats.agents, note: 'Ready to help', icon: Bot, color: 'purple' }, { label: 'Revenue this month', value: Object.entries(data.stats.revenueByCurrency || { NGN: data.stats.revenue }).map(([code, total]) => money(total, code)).join(' · ') || '—', note: IS_DEMO ? 'Sample payments' : 'Verified payments by currency', icon: CreditCard, color: 'gold' }, { label: 'Responses this month', value: data.stats.responses, note: 'Across your workspace', icon: MessageSquare, color: 'blue' }].map(({ label, value, note, icon: Icon, color }) => <Panel className="hx-stat" key={label}><span className={`hx-stat-icon hx-${color}`}><Icon size={19} /></span><p>{label}</p><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><small>{note}</small></Panel>)}</div>
    <div className="hx-admin-overview-row"><section className="hx-admin-welcome"><div><span className="hx-welcome-kicker"><ShieldCheck size={14} />BEHIND THE CALM</span><h2>Good help.<br />Well looked after.</h2><p>Give your customers a little more room to think.</p><Link className="hx-button hx-button-white" to="/admin/agents">Look after your agents<ArrowRight size={16} /></Link></div><OrbitArt /></section><Panel className="hx-services"><PanelTitle title="The essentials" subtitle={IS_DEMO ? 'Preview uses browser-only demo data.' : 'Your connected services.'} />{[{ key: 'database', label: 'Database', icon: UsersRound }, { key: 'ai', label: 'AI service', icon: Bot }, { key: 'payments', label: 'Payments', icon: CreditCard }, { key: 'mail', label: 'Reset emails', icon: Mail }].map(({ key, label, icon: Icon }) => <div className="hx-service" key={key}><span><Icon size={17} />{label}</span><Badge status={data.services[key] ? 'active' : 'neutral'}>{IS_DEMO ? 'Demo' : data.services[key] ? 'Configured' : 'Awaiting setup'}</Badge></div>)}<p className="hx-panel-footnote">{IS_DEMO ? 'Use the full project to connect MongoDB, AI, and Paystack.' : 'Configured means credentials are present. Confirm each connection before launch.'}</p></Panel></div>
    <Panel><PanelTitle title="Recent payments" subtitle={IS_DEMO ? 'Illustrative transactions. No real charges.' : 'The latest verified purchases.'}><SmallLink to="/admin/payments">View all</SmallLink></PanelTitle><PaymentTable payments={data.recentPayments} compact onOpen={setPaymentId} /></Panel><Panel className="hx-admin-activity"><PanelTitle title="A few things, lately" subtitle="Activity across your Nooky workspace." /><ActivityList items={data.activity} admin /></Panel>
  </>}</ResourceState>{paymentId && <AdminPaymentDetails key={paymentId} id={paymentId} onClose={() => setPaymentId(null)} onChanged={resource.refresh} />}</>;
}

function InviteModal({ onClose }) {
  const [email, setEmail] = useState(''), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''); const toast = useToast();
  const submit = async event => { event.preventDefault(); setBusy(true); setError(''); try { setResult(await api('/admin/invites', { method: 'POST', body: { email } })); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(result.url); toast(IS_DEMO ? 'Demo invitation link copied.' : 'Invitation copied. Share it privately with your teammate.'); } catch { toast('Select the link below and copy it manually.'); } };
  return <Modal title="A little more help behind the scenes." subtitle={IS_DEMO ? 'Demo invitations cannot create real admin accounts.' : 'Invite a teammate to manage Nooky. The link is valid for 48 hours.'} onClose={onClose}><ErrorMessage message={error} />{result ? <><div className="hx-success"><CheckCircle2 size={20} /><p>{IS_DEMO ? 'A sample invitation is ready.' : `Invitation created for ${email}.`}</p></div><Field label="Private invitation link" as="textarea" rows={4} value={result.url} readOnly onFocus={event => event.target.select()} /><p className="hx-panel-footnote">{IS_DEMO ? 'This is an example link for the preview.' : 'Share this link directly with your teammate. No email was sent automatically.'}</p><div className="hx-modal-actions"><Button variant="secondary" onClick={onClose}>Done</Button><Button onClick={copy}><Copy size={16} />Copy link</Button></div></> : <form className="hx-form" onSubmit={submit}><Field label="Teammate’s email" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required placeholder="teammate@example.com" /><div className="hx-modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}><Plus size={16} />Create invitation</Button></div></form>}</Modal>;
}

export function AdminUsers() {
  const [search, setSearch] = useState(''), [submitted, setSubmitted] = useState(''), [page, setPage] = useState(1), [invite, setInvite] = useState(false), [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''); const toast = useToast();
  const resource = useResource(`/admin/users?page=${page}&search=${encodeURIComponent(submitted)}`);
  const change = async () => { setBusy(true); setError(''); try { const status = selected.status === 'active' ? 'suspended' : 'active'; await api(`/admin/users/${selected._id}`, { method: 'PATCH', body: { status } }); resource.refresh(); setSelected(null); toast(`Customer account ${status === 'active' ? 'reactivated' : 'suspended'}.`); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <><PageIntro title="Your people." description="A little care for everyone who calls Nooky their extra pair of hands." actions={<Button onClick={() => setInvite(true)}><Plus size={16} />Invite administrator</Button>} /><Panel><PanelTitle title="Customers & team" subtitle="Manage access and find the people in your workspace." /><form className="hx-search" onSubmit={event => { event.preventDefault(); setSubmitted(search); setPage(1); }}><Search size={18} /><label className="hx-sr-only" htmlFor="hx-user-search">Search name or email</label><input id="hx-user-search" value={search} onChange={e => setSearch(e.target.value)} maxLength={80} placeholder="Find a name or email…" /><Button variant="secondary" type="submit">Search</Button></form><ResourceState resource={resource}>{resource.data && <>{resource.data.users.length ? <div className="hx-table-wrap"><table className="hx-table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th>Access</th></tr></thead><tbody>{resource.data.users.map(user => <tr key={user._id}><td><div className="hx-table-person"><span className="hx-small-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td><Badge status={user.role === 'admin' ? 'blue' : 'neutral'}>{user.role === 'admin' ? 'Administrator' : 'Customer'}</Badge></td><td><Badge status={user.status}>{user.status}</Badge></td><td>{dateLabel(user.createdAt)}</td><td>{user.role === 'user' ? <button className={`hx-table-action ${user.status === 'active' ? 'hx-table-danger' : ''}`} onClick={() => { setError(''); setSelected(user); }}>{user.status === 'active' ? 'Suspend' : 'Reactivate'}</button> : <span className="hx-muted">Protected</span>}</td></tr>)}</tbody></table></div> : <Empty icon={UsersRound} title="No matches just yet" description="Try another name or email." />}<Pagination data={resource.data} onChange={setPage} /></>}</ResourceState></Panel>{invite && <InviteModal onClose={() => setInvite(false)} />}{selected && <Modal title={selected.status === 'active' ? 'Pause their access?' : 'Welcome them back?'} subtitle={selected.status === 'active' ? `${selected.name} will be signed out and unable to use their account until reactivated.` : `${selected.name} will be able to sign in and use their account again.`} onClose={() => setSelected(null)}><ErrorMessage message={error} /><div className="hx-modal-actions"><Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button><Button variant={selected.status === 'active' ? 'danger' : 'primary'} onClick={change} busy={busy}>{selected.status === 'active' ? 'Suspend account' : 'Reactivate account'}</Button></div></Modal>}</>;
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [form, setForm] = useState(template ? { ...template, features: template.features.join('\n'), prompts: template.prompts.join('\n') } : { key: '', name: '', category: 'Personal', description: '', systemPrompt: '', color: 'blue', icon: 'Sparkles', features: '', prompts: '', published: true });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), publishedId = useId(); const toast = useToast();
  const change = key => event => setForm({ ...form, [key]: event.target.value });
  const submit = async event => { event.preventDefault(); setBusy(true); setError(''); try { const body = { name: form.name, category: form.category, description: form.description, systemPrompt: form.systemPrompt, color: form.color, icon: form.icon, features: form.features.split('\n').map(s => s.trim()).filter(Boolean), prompts: form.prompts.split('\n').map(s => s.trim()).filter(Boolean), published: form.published, ...(!template ? { key: form.key } : {}) }; await api(template ? `/admin/templates/${template._id}` : '/admin/templates', { method: template ? 'PATCH' : 'POST', body }); toast('Agent speciality saved.'); onSaved(); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <Modal title={template ? 'A little fine-tuning.' : 'A new kind of help.'} subtitle="Set the speciality, the starting voice, and what customers see." onClose={onClose} wide><ErrorMessage message={error} /><form className="hx-form" onSubmit={submit}><div className="hx-form-row"><Field label="Speciality name" value={form.name} onChange={change('name')} minLength={2} maxLength={70} required /><Field label="Category" value={form.category} onChange={change('category')} minLength={2} maxLength={30} required /></div>{!template && <Field label="Unique key" value={form.key} onChange={change('key')} pattern="[a-z0-9-]{2,50}" placeholder="customer-success" required hint="Lowercase letters, numbers, and hyphens. Keep this unique." />}<Field label="Description" as="textarea" rows={2} value={form.description} onChange={change('description')} minLength={10} maxLength={400} required /><Field label="Agent system instructions" as="textarea" rows={4} value={form.systemPrompt} onChange={change('systemPrompt')} minLength={10} maxLength={6000} required hint="Describe how the agent helps. Nooky adds its capability boundaries automatically." /><div className="hx-form-row"><Field label="Features · one per line" as="textarea" rows={3} value={form.features} onChange={change('features')} hint="Up to 6 short features." /><Field label="Starter prompts · one per line" as="textarea" rows={3} value={form.prompts} onChange={change('prompts')} hint="Up to 4 conversation starters." /></div><div className="hx-form-row"><Field label="Icon" as="select" value={form.icon} onChange={change('icon')} options={['Sparkles', 'PenLine', 'BriefcaseBusiness', 'Bot', 'Brain', 'Compass']} /><Field label="Colour" as="select" value={form.color} onChange={change('color')} options={['blue', 'purple', 'gold']} /></div><label className="hx-checkbox" htmlFor={publishedId}><input id={publishedId} type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} />Available for customers to choose</label><p className="hx-panel-footnote">Unpublishing hides this speciality from new selections. Existing agents keep working.</p><div className="hx-modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save speciality<Check size={16} /></Button></div></form></Modal>;
}

function PlanPriceSummary({ plan }) {
  if (plan.code === 'free') return <p className="hx-plan-price">Free</p>;
  const prices = resolvePlanPrices(plan);
  const configured = currencies.filter(code => pricePeriods.every(period => isPrice(prices[code]?.[period], code)));
  if (!configured.length) return <p className="hx-muted">No currencies configured</p>;
  return <dl className="hx-admin-price-list" aria-label="30-day prices">
    {configured.map(code => <div key={code}><dt>{code}</dt><dd>{money(prices[code].monthly, code)}</dd></div>)}
  </dl>;
}

function PlanEditor({ plan, onClose, onSaved }) {
  const free = plan.code === 'free';
  const [currency, setCurrency] = useState('USD');
  const [form, setForm] = useState({ ...plan, features: plan.features.join('\n') });
  const [draft, setDraft] = useState(() => {
    const prices = resolvePlanPrices(plan);
    return Object.fromEntries(currencies.map(code => [code, Object.fromEntries(pricePeriods.map(period => {
      const amount = prices[code]?.[period];
      return [period, Number.isSafeInteger(amount) && amount > 0 ? (amount / 100).toFixed(2) : ''];
    }))]));
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const publishedId = useId();
  const toast = useToast();
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const changePrice = period => event => {
    const value = event.target.value;
    setDraft(current => ({ ...current, [currency]: { ...current[currency], [period]: value } }));
  };
  const submit = async event => {
    event.preventDefault();
    setError('');
    const prices = {};
    for (const code of free ? [] : currencies) {
      const row = draft[code];
      if (pricePeriods.every(period => row[period] === '')) continue;
      if (!pricePeriods.every(period => /^(?:\d+|\d*\.\d{1,2})$/.test(row[period])
        && Number(row[period]) <= maximumPrice / 100 && Number(row[period]) >= minimumPrice(code) / 100)) {
        setCurrency(code);
        setError(`Enter both ${code} prices (minimum ${money(minimumPrice(code), code)}, up to two decimal places), or leave both blank.`);
        return;
      }
      prices[code] = Object.fromEntries(pricePeriods.map(period => [period, Math.round(Number(row[period]) * 100)]));
    }
    if (!free && form.published && !Object.keys(prices).length) {
      setError('Add prices in at least one currency before publishing this plan.');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/plans/${plan._id}`, { method: 'PATCH', body: {
        name: form.name, description: form.description, prices, responseLimit: Number(form.responseLimit),
        features: form.features.split('\n').map(s => s.trim()).filter(Boolean), published: form.published,
      } });
      toast('Plan saved. Future purchases use these prices and limits.');
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <Modal title={`Shape the ${plan.name} plan.`} subtitle="Changes apply to future purchases." onClose={onClose}>
    <ErrorMessage message={error} />
    <form className="hx-form" onSubmit={submit}>
      <Field label="Plan name" value={form.name} onChange={change('name')} minLength={2} maxLength={50} required />
      <Field label="Description" value={form.description} onChange={change('description')} minLength={5} maxLength={200} required />
      {!free && <div className="hx-plan-currency-editor">
        <CurrencySelector currency={currency} onChange={setCurrency} disabled={busy} />
        <div className="hx-form-row">
          {pricePeriods.map((period, i) => <Field key={period} label={`${i === 0 ? '30' : '365'}-day price · ${currency}`}
            type="number" inputMode="decimal" min={minimumPrice(currency) / 100} max={maximumPrice / 100} step="0.01"
            value={draft[currency][period]} onChange={changePrice(period)} disabled={busy} />)}
        </div>
        <p className="hx-muted">Enter the price customers will pay, e.g. 25 for $25 in USD. Leave both prices blank to turn off this currency for this plan.</p>
      </div>}
      <Field label="Responses per calendar month" type="number" min={1} max={100000} step="1" value={form.responseLimit} onChange={change('responseLimit')} required />
      <Field label="Features · one per line" as="textarea" rows={4} value={form.features} onChange={change('features')} hint="Up to 8 short features." />
      <label className="hx-checkbox" htmlFor={publishedId}><input id={publishedId} type="checkbox" checked={form.published} disabled={free} onChange={e => setForm({ ...form, published: e.target.checked })} />Available for new purchases</label>
      <div className="hx-modal-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" busy={busy}>Save plan<Check size={16} /></Button></div>
    </form>
  </Modal>;
}

export function AdminAgents() {
  const resource = useResource('/admin/catalog'), [editor, setEditor] = useState(null), [plan, setPlan] = useState(null);
  return <><PageIntro title="A good kind of help." description="Shape the agents and plans your customers make their own." actions={<Button onClick={() => setEditor({ new: true })}><Plus size={16} />New speciality</Button>} /><ResourceState resource={resource}>{resource.data && <><div className="hx-section-label"><h2>Agent specialities</h2><span>{resource.data.templates.length} specialities · {resource.data.agents} customer agents</span></div><div className="hx-agent-grid">{resource.data.templates.map(template => <AgentCard key={template._id} template={template} onSelect={setEditor} admin />)}</div><div className="hx-section-label hx-plans-label"><h2>A little help. Or a whole lot.</h2><span>Plans & response allowances</span></div><div className="hx-admin-plans">{resource.data.plans.map(plan => <Panel key={plan._id}><div className="hx-admin-plan-heading"><h3>{plan.name}</h3><Badge status={plan.published ? 'blue' : 'neutral'}>{plan.published ? 'Available' : 'Hidden'}</Badge></div>{plan.pricingNeedsReview && <p className="hx-error">Set prices in at least one currency, then publish this plan.</p>}<PlanPriceSummary plan={plan} /><p className="hx-muted">{plan.responseLimit.toLocaleString()} responses per month</p><p className="hx-admin-plan-description">{plan.description}</p><Button variant="secondary" onClick={() => setPlan(plan)}>Edit plan<ArrowRight size={15} /></Button></Panel>)}</div><div className="hx-info-note"><ShieldCheck size={18} /><p>Purchase prices and allowances are saved with each transaction. Editing a plan affects future purchases.</p></div></>}</ResourceState>{editor && <TemplateEditor template={editor.new ? null : editor} onClose={() => setEditor(null)} onSaved={resource.refresh} />}{plan && <PlanEditor plan={plan} onClose={() => setPlan(null)} onSaved={resource.refresh} />}</>;
}

export function AdminPayments() {
  const [status, setStatus] = useState('all'), [page, setPage] = useState(1), [paymentId, setPaymentId] = useState(null); const resource = useResource(`/admin/payments?page=${page}&status=${status}`);
  const exportPage = () => downloadCsv([['Reference', 'Customer', 'Email', 'Plan', 'Period', 'Amount', 'Currency', 'Status', 'Date', 'Demo'], ...resource.data.payments.map(p => [p.reference, p.userId?.name, p.userId?.email, p.planName, p.period, (p.amount / 100).toFixed(2), p.currency, paymentPresentation(p).label, p.paidAt || p.createdAt, p.demo ? 'Yes' : 'No'])], `nooky-payments-page-${page}${IS_DEMO ? '-demo' : ''}.csv`);
  return <><PageIntro title="The numbers, clearly." description={IS_DEMO ? 'Sample payment records for the preview. No real transactions.' : 'Verified purchases, pending checkouts, and a clear record of each.'} actions={<Button variant="secondary" onClick={exportPage} disabled={!resource.data?.payments.length}><Download size={16} />Export this page</Button>} /><Panel><PanelTitle title="Payment history" subtitle="Payment status comes from the gateway verification." /><div className="hx-filter-bar" role="group" aria-label="Payment status">{['all', 'success', 'review', 'pending', 'failed'].map(value => <button key={value} className={status === value ? 'hx-filter-active' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }}>{value === 'success' ? 'Paid' : value === 'review' ? 'Needs review' : value[0].toUpperCase() + value.slice(1)}</button>)}<button className="hx-filter-refresh" onClick={resource.refresh} aria-label="Refresh payments"><RefreshCw size={15} /></button></div><ResourceState resource={resource}>{resource.data && <><PaymentTable payments={resource.data.payments} onOpen={setPaymentId} /><Pagination data={resource.data} onChange={setPage} /></>}</ResourceState></Panel><div className="hx-info-note"><ShieldCheck size={18} /><p>{IS_DEMO ? 'These are illustrative records. Real payment verification runs on the Express server.' : 'Open a payment to check its provider status or manage the customer’s paid access.'}</p></div>{paymentId && <AdminPaymentDetails key={paymentId} id={paymentId} onClose={() => setPaymentId(null)} onChanged={resource.refresh} />}</>;
}
