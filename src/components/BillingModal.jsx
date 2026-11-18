import CurrencySelector, { useCurrency } from './CurrencySelector.jsx';
import { planChange, RENEWAL_WINDOW_DAYS } from '../../shared/billing.js';
import { selectAmount } from '../../shared/pricing.js';
import { useState } from 'react';
import { Check, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { useResource } from '../lib/useResource.js';
import { Badge, Button, dateLabel, ErrorMessage, Modal, money, ResourceState, useToast } from './ui.jsx';

export default function BillingModal({ onClose, onSuccess, currentPlan, subscription, initialPeriod = 'monthly' }) {
  const [currency, setCurrency] = useCurrency();
  const catalog = useResource('/catalog'), [period, setPeriod] = useState(initialPeriod), [busy, setBusy] = useState(''), [error, setError] = useState(''); const toast = useToast();
  const checkout = async plan => { setBusy(plan._id); setError(''); try { const result = await api('/payments/checkout', { method: 'POST', body: { planId: plan._id, period, currency } }); if (result.demo) { toast(result.message); onSuccess(); onClose(); } else window.location.assign(result.checkoutUrl); } catch (err) { setError(err.message); } finally { setBusy(''); } };
  return <Modal title="A little help. Or a whole lot." subtitle={IS_DEMO ? 'Explore the plans. This preview never charges you.' : 'Choose the response allowance that fits your day.'} onClose={onClose} wide><div className="hx-billing-currencies"><CurrencySelector currency={currency} onChange={setCurrency} disabled={!!busy} /></div><div className="hx-billing-toggle" role="group" aria-label="Access period">{['monthly', 'yearly'].map(value => <button key={value} aria-pressed={period === value} className={period === value ? 'hx-selected' : ''} disabled={!!busy} onClick={() => setPeriod(value)}>{value === 'monthly' ? '30 days' : '365 days'}</button>)}</div><ErrorMessage message={error} /><ResourceState resource={catalog}>{catalog.data && <div className="hx-billing-plans">{catalog.data.plans.map(plan => { const change = planChange(subscription, plan.code);
    const amount = selectAmount(plan, currency, period); const available = Number.isSafeInteger(amount) && amount >= (currency === 'NGN' ? 5000 : 1); return <article className={`hx-billing-plan ${plan.featured ? 'hx-billing-featured' : ''}`} key={plan._id}><div><h3>{plan.name}</h3>{currentPlan === plan.code && <Badge status="blue">Your plan</Badge>}</div><p className="hx-plan-price">{plan.code === 'free' ? 'Free' : available ? money(amount, currency) : 'Unavailable'}<span>{plan.code === 'free' ? ' / free' : period === 'monthly' ? ' / 30 days' : ' / 365 days'}</span></p><p>{plan.description}</p><ul>{plan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul><Button variant={plan.featured ? 'primary' : 'secondary'} disabled={plan.code === 'free' || !available || !change.allowed || !!busy} busy={busy === plan._id} onClick={() => checkout(plan)}>{plan.code === 'free' ? 'Included with your account' : IS_DEMO ? `Preview ${plan.name}` : change.kind === 'renew' ? `Renew ${plan.name}` : change.kind === 'upgrade' ? `Upgrade to ${plan.name}` : `Choose ${plan.name}`}{plan.code !== 'free' && (IS_DEMO ? <Check size={15} /> : <ExternalLink size={15} />)}</Button>
      {plan.code !== 'free' && <small className="hx-billing-small">
        {change.kind === 'renew' ? change.allowed
          ? 'Adds the selected period to your current expiry date.'
          : change.renewsAt ? `Renewal opens ${dateLabel(change.renewsAt)}.` : 'This plan has no expiry date.'
          : change.kind === 'downgrade' ? 'Available after your current plan ends.'
          : change.kind === 'upgrade' ? 'Starts a new period today, replacing your current access period.' : null}
      </small>}
    </article>; })}</div>}</ResourceState><div className="hx-billing-note"><ShieldCheck size={17} /><p>{IS_DEMO ? 'Demo plan changes are saved only in this browser. No payment is processed.' : 'Pay securely with Flutterwave. Renewals open in the last ' + RENEWAL_WINDOW_DAYS + ' days of your access. There are no automatic charges.'}</p></div><p className="hx-billing-small"><CreditCard size={14} />Checkout uses the selected currency. Response limits reset on the first day of each month, UTC.</p></Modal>;
}
