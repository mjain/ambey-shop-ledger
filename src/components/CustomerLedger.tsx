import type { LedgerTransaction } from '../firebase/config';

interface Props {
  transactions: LedgerTransaction[];
}

export function CustomerLedger({ transactions }: Props) {
  return (
    <section className="card">
      <h2>Ledger</h2>
      <p>{transactions.length} entries.</p>
    </section>
  );
}
