import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, CreditCard } from 'lucide-react';
import { api, IS_DEMO } from '../lib/api.js';
import { Button, ButtonLink, ErrorMessage, Loading, money, PageIntro, Panel } from '../components/ui.jsx';

export default function PaymentCallback() {
  const [query] = useSearchParams(), [payment, setPayment] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true); const started = useRef(false);
  const reference = query.get('reference') || query.get('trxref');
  const verify = async () => { setBusy(true); setError(''); try { if (IS_DEMO) throw new Error('This preview does not process payments. Open your dashboard to explore the plans.'); if (!reference) throw new Error('No payment reference was supplied. Check your billing history or contact support.'); const result = await api('/payments/verify', { method: 'POST', body: { reference } }); setPayment(result.payment); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  useEffect(() => { if (!started.current) { started.current = true; verify(); } }, []);
  return <><PageIntro title="Your payment" description="One last check before your extra headspace is ready." /><Panel className="hx-payment-result">{busy ? <Loading /> : payment ? <><span className="hx-payment-success-icon"><CheckCircle2 size={38} /></span><h2>A little more room.</h2><p>Your {payment.planName} access is active.</p><strong>{money(payment.amount)}</strong><span>{payment.reference}</span><ButtonLink to="/app/dashboard">Back to your dashboard</ButtonLink></> : <><span className="hx-icon-tile"><CreditCard size={28} /></span><h2>Let’s check that payment.</h2><ErrorMessage message={error} /><div className="hx-modal-actions"><ButtonLink variant="secondary" to="/app/dashboard">Go to dashboard</ButtonLink>{!IS_DEMO && reference && <Button onClick={verify} busy={busy}>Check again</Button>}</div></>}</Panel></>;
}
