import { useState } from 'react';
import { currencies } from '../../shared/pricing.js';
import './currency-selector.css';

const symbols = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' };

export function useCurrency() {
  const [currency, setCurrency] = useState(() => {
    try {
      const saved = localStorage.getItem('nooky-currency');
      if (currencies.includes(saved)) return saved;
    } catch {}
    return 'USD';
  });
  return [currency, value => {
    setCurrency(value);
    try { localStorage.setItem('nooky-currency', value); } catch {}
  }];
}

export default function CurrencySelector({ currency, onChange, disabled = false }) {
  return <div className="currency-switch">
    <span className="currency-switch-label" aria-hidden="true">Currency</span>
    <div className="currency-segments" role="group" aria-label="Currency">
      {currencies.map(code => <button type="button" key={code} aria-pressed={currency === code}
        disabled={disabled} onClick={() => onChange(code)}>
        <span className="currency-symbol" aria-hidden="true">{symbols[code]}</span>
        <span>{code}</span>
      </button>)}
    </div>
  </div>;
}
