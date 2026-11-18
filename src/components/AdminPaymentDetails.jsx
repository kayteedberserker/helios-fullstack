import { useState } from 'react';
import { AlertCircle, Copy, RefreshCw } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { paymentPresentation } from '../../shared/billing.js';
import { Badge, Button, ErrorMessage, Field, Modal, ResourceState, dateLabel, money, useToast } from './ui.jsx';

const dateTime = value => value ? new Date(value).toLocaleString() : '—';
const reviewLabel = { checkout_replaced: 'Checkout replaced', renewal_too_early: 'Renewal too early', active_higher_plan: 'Higher plan active' };
const providerName = payment => payment.provider === 'flutterwave' ? 'Flutterwave' : 'Paystack';

function DetailsGrid({ rows }) {
  return <dl className="hx-payment-details-grid">
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
  </dl>;
}

export default function AdminPaymentDetails({ id, onClose, onChanged }) {
  const path = `/admin/payments/${id}`;
  const resource = useResource(path);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(''), [action, setAction] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [reason, setReason] = useState('');
  const toast = useToast();
  const detail = result ?? resource.data;
  const { payment, customer, subscription, history } = detail ?? {};
  const provider = payment && providerName(payment);
  const snapshot = payment?.providerCheck;
  const failAllowed = payment?.status === 'pending' && !['success', 'successful'].includes(snapshot?.status);
  const run = async (operation, body) => {
    setBusy(operation); setError(''); setNotice('');
    try {
      const data = await api(`${path}/${operation}`, { method: 'POST', body });
      setResult(data); setAction(''); setReason(''); setNotice(data.notice || '');
      onChanged();
      if (!data.notice) toast(operation === 'verify' ? 'Provider check updated.' : operation === 'fail' ? 'Checkout closed.' : 'Subscription ended.');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(payment.reference); toast('Payment reference copied.'); }
    catch { toast('Select the payment reference to copy it.'); }
  };
  return <Modal title="Payment details" subtitle={IS_DEMO ? 'Sample records for this preview.' : 'Review the purchase, provider result, and current access.'}
    onClose={() => { if (!busy) onClose(); }} wide>
    <ResourceState resource={resource}>{detail && <>
      <div className="hx-payment-detail-heading"><div><h3>{payment.planName} · {money(payment.amount, payment.currency)}</h3>
        <p>{customer?.name || 'Customer'}{customer?.email ? ` · ${customer.email}` : ''}</p></div>
        <Badge status={paymentPresentation(payment).badge}>{paymentPresentation(payment).label}</Badge>
      </div>
      <section className="hx-payment-detail-section">
        <h3>Nooky purchase</h3>
        <DetailsGrid rows={[
          ['Payment reference', <span className="hx-payment-reference"><code>{payment.reference}</code><button className="hx-icon-button" type="button" onClick={copy} aria-label="Copy payment reference"><Copy size={14} /></button></span>],
          ['Provider', provider], ['Access period', payment.period === 'yearly' ? '365 days' : '30 days'],
          ['Created', dateTime(payment.createdAt)], ['Paid', dateTime(payment.paidAt)], ['Recorded transaction ID', payment.providerId], ['Applied to account', dateTime(payment.appliedAt)],
          ...(payment.reviewReason ? [['Review reason', reviewLabel[payment.reviewReason] || payment.reviewReason]] : []),
        ]} />
      </section>
      <section className="hx-payment-detail-section">
        <div className="hx-payment-detail-heading"><h3>{provider} verification</h3>
          {!IS_DEMO && <Button variant="secondary" busy={busy === 'verify'} disabled={!!busy || !!action}
            onClick={() => run('verify', {})}><RefreshCw size={15} />Check with {provider}</Button>}
        </div>
        {notice && <p className="hx-payment-action-note" role="status"><AlertCircle size={15} />{notice}</p>}
        {snapshot ? <DetailsGrid rows={[
          ['Provider status', snapshot.status], ['Checked', dateTime(snapshot.checkedAt)], ['Transaction ID', snapshot.transactionId],
          [`${provider} reference`, snapshot.providerReference], ['Returned purchase reference', snapshot.reference],
          ['Purchase amount', snapshot.amount != null && snapshot.currency ? money(snapshot.amount, snapshot.currency) : null],
          ['Amount charged', snapshot.chargedAmount != null && snapshot.currency ? money(snapshot.chargedAmount, snapshot.currency) : null],
          ['Method', snapshot.method], ['Transaction date', dateTime(snapshot.transactionDate)],
        ]} /> : <p className="hx-muted">{IS_DEMO ? 'Provider checks are unavailable in preview.' : 'Run a check to see the latest status and transaction details from the provider.'}</p>}
      </section>
      <section className="hx-payment-detail-section">
        <div className="hx-payment-detail-heading"><h3>Customer’s current subscription</h3>
          {subscription?.active && !IS_DEMO && <Button variant="secondary" disabled={!!busy || !!action || !subscription.revision}
            onClick={() => { setError(''); setNotice(''); setAction('cancel-subscription'); }}>Cancel subscription</Button>}
        </div>
        {subscription ? <DetailsGrid rows={[
          ['Plan', subscription.planName || subscription.planCode],
          ['State', subscription.active ? 'Active' : subscription.cancelledAt ? 'Cancelled · Free access' : 'Expired · Free access'],
          ['Started', dateLabel(subscription.startsAt)], ['Ends', dateTime(subscription.endsAt)],
        ]} /> : <p className="hx-muted">No paid subscription. The customer has Free access.</p>}
      </section>
      {!IS_DEMO && failAllowed && !action && <div className="hx-payment-detail-actions">
        <Button variant="secondary" disabled={!!busy} onClick={() => { setError(''); setNotice(''); setAction('fail'); }}>Mark checkout failed</Button>
        <span className="hx-muted">A successful charge can only be recorded after a provider check.</span>
      </div>}
      {action && <form className="hx-payment-action-form hx-form" onSubmit={event => {
        event.preventDefault();
        run(action, { reason, ...(action === 'cancel-subscription' ? { revision: subscription.revision } : {}) });
      }}>
        <h3>{action === 'fail' ? 'Close this pending checkout?' : 'End paid access now?'}</h3>
        <p>{action === 'fail' ? 'Check the provider first if you’re unsure whether the customer paid. A later confirmed charge will go to review without activating a plan.' : 'The customer returns to Free immediately and their pending checkouts are replaced. This does not issue a refund.'}</p>
        <Field as="textarea" label="Reason (admin only)" value={reason} onChange={event => setReason(event.target.value)} required minLength={5} maxLength={240} rows={2} />
        <div className="hx-payment-detail-actions">
          <Button variant="secondary" disabled={!!busy} onClick={() => { setAction(''); setReason(''); setError(''); }}>Go back</Button>
          <Button type="submit" busy={!!busy} disabled={reason.trim().length < 5}>{action === 'fail' ? 'Confirm failed status' : 'Confirm cancellation'}</Button>
        </div>
      </form>}
      <ErrorMessage message={error} />
      {!!history?.length && <section className="hx-payment-detail-section"><h3>Admin history</h3>
        <ul className="hx-payment-audit">{history.map(entry => <li key={entry._id}>
          <strong>{entry.text}</strong><p>{entry.billingNote}</p>
          <small>{entry.actorId?.name || 'Administrator'} · {dateTime(entry.createdAt)}</small>
        </li>)}</ul>
      </section>}
    </>}</ResourceState>
  </Modal>;
}
