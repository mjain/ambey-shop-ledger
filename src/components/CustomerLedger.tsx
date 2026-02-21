import type { LedgerTransaction } from '../firebase/config';

interface Props {
  transactions: LedgerTransaction[];
}

export function CustomerLedger({ transactions }: Props) {
  return (
    <section className="card">
      <h2>Customer Ledger</h2>
      <div className="ledger-grid ledger-header">
        <span>Date</span>
        <span>Type</span>
        <span>Amount</span>
        <span>Balance After</span>
      </div>
      {transactions.map((txn) => (
        <div className="ledger-grid" key={txn.id}>
          <span>{txn.date?.toDate ? txn.date.toDate().toLocaleDateString() : '-'}</span>
          <span className={txn.type === 'IN' ? 'in' : 'out'}>{txn.type}</span>
          <span>₹{txn.amount}</span>
          <span>₹{txn.balanceAfter}</span>
        </div>
      ))}
      {transactions.length === 0 ? <p className="empty">No transactions yet.</p> : null}
    </section>
  );
}
