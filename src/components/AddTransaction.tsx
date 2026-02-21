import type { Customer } from '../firebase/config';

interface Props {
  customers: Customer[];
}

export function AddTransaction({ customers }: Props) {
  return (
    <section className="card">
      <h2>Transactions moved to dedicated form</h2>
      <p>{customers.length} customers available.</p>
    </section>
  );
}
