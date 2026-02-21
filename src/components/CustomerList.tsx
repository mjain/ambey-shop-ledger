import type { Customer } from '../firebase/config';

interface Props {
  customers: Customer[];
}

export function CustomerList({ customers }: Props) {
  return (
    <section className="card">
      <h2>Customer List</h2>
      <p>{customers.length} customers.</p>
    </section>
  );
}
