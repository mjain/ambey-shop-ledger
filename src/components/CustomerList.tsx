import type { Customer } from '../firebase/config';

interface Props {
  customers: Customer[];
  selectedCustomerId: string;
  onSelect: (customerId: string) => void;
}

export function CustomerList({ customers, selectedCustomerId, onSelect }: Props) {
  return (
    <section className="card">
      <h2>Customers</h2>
      <div className="customer-list">
        {customers.map((customer) => (
          <button
            className={`customer-item ${selectedCustomerId === customer.id ? 'active' : ''}`}
            key={customer.id}
            onClick={() => onSelect(customer.id)}
            type="button"
          >
            <span>{customer.name}</span>
            <strong>₹{customer.currentBalance}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
