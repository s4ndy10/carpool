import { useEffect, useState } from 'react';
import { ReceiptText, ShieldCheck } from 'lucide-react';
import { errorMessage, request } from './api';
import type { User } from './api';
import { money } from './format';

type Account = {
  user: User & { joinedAt: string };
  currency: 'INR';
  summary: { orders: number; vehicles: number; totalSpent: number };
  purchases: { id: string; vehicleId: string; make: string; model: string; category: string; unitPrice: number; quantity: number; totalPrice: number; purchasedAt: string }[];
};
const date = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

export default function AccountProfile() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError('');
    request<Account>('/account', { signal: controller.signal })
      .then((data) => { if (active) setAccount(data); })
      .catch((err) => { if (active) setError(errorMessage(err)); });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  if (error) return <div className="account-error"><p className="error-box" role="alert">{error}</p><button className="button primary" onClick={() => setRetry((value) => value + 1)}>Retry account</button></div>;
  if (!account) return <p className="account-loading" role="status"><span className="loading-ring" /> Loading your account...</p>;
  return <div className="account-content">
    <section className="account-identity" aria-label="Account details">
      <span className="account-avatar" aria-hidden="true">{account.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>
      <div><h3>{account.user.name}</h3><p>{account.user.email}</p><span className="account-role">{account.user.role === 'admin' ? 'Administrator' : 'Carpool member'}</span></div>
    </section>
    <dl className="account-details">
      <div><dt>Member since</dt><dd>{date(account.user.joinedAt)}</dd></div>
      <div><dt>Preferred currency</dt><dd>Indian Rupee (INR)</dd></div>
      <div className="account-id"><dt>Account ID</dt><dd>{account.user.id}</dd></div>
    </dl>
    <section className="account-totals" aria-label="Purchase summary">
      <div><strong>{account.summary.orders}</strong><span>Purchases</span></div>
      <div><strong>{account.summary.vehicles}</strong><span>Vehicles</span></div>
      <div><strong>{money(account.summary.totalSpent)}</strong><span>Total purchase value</span></div>
    </section>
    <section className="purchase-history" aria-label="Purchase history">
      <h3><ReceiptText size={20} /> Your purchases</h3>
      <p className="field-hint">History starts from this feature's launch. These are inventory purchases; no payment has been collected.</p>
      {account.purchases.length === 0 ? <div className="account-empty"><ReceiptText size={30} /><h4>Your next journey starts here.</h4><p>Your purchases will appear here once you choose a vehicle.</p></div> :
        <ol className="purchase-list">{account.purchases.map((purchase) => <li key={purchase.id}>
          <div className="purchase-heading"><div><span className="purchase-category">{purchase.category}</span><h4>{purchase.make} {purchase.model}</h4><time dateTime={purchase.purchasedAt}>{date(purchase.purchasedAt)}</time></div><strong>{money(purchase.totalPrice)}</strong></div>
          <p>{purchase.quantity} {purchase.quantity === 1 ? 'vehicle' : 'vehicles'} at {money(purchase.unitPrice)} each</p>
          <details><summary>Purchase reference</summary><code>{purchase.id}</code></details>
        </li>)}</ol>}
    </section>
    <p className="account-security"><ShieldCheck size={16} /> Only you can view your purchase history. Your session stays in this browser tab.</p>
  </div>;
}
