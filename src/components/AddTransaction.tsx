import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addTransaction, createCustomer, type Customer, type TransactionType } from '../firebase/config';

interface Props {
  customers: Customer[];
  defaultCustomerId?: string;
  defaultType: TransactionType;
  onSaved: () => Promise<void>;
}

export function AddTransaction({ customers, defaultCustomerId = '', defaultType, onSaved }: Props) {
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>(defaultType);
  const [note, setNote] = useState('');
  const [billFile, setBillFile] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);

  const hasCustomers = useMemo(() => customers.length > 0, [customers.length]);

  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  useEffect(() => {
    setCustomerId(defaultCustomerId);
  }, [defaultCustomerId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setSaving(true);
    try {
      let effectiveCustomerId = customerId;
      if (!effectiveCustomerId && newCustomerName.trim()) {
        effectiveCustomerId = await createCustomer(newCustomerName);
      }

      if (!effectiveCustomerId) {
        alert('Please select or create a customer.');
        return;
      }

      await addTransaction({
        customerId: effectiveCustomerId,
        type,
        amount: parsedAmount,
        note,
        billFile
      });

      setAmount('');
      setNote('');
      setBillFile(undefined);
      setNewCustomerName('');
      await onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save transaction.';
      alert(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Add Transaction</h2>

      <label>
        Customer
        <select onChange={(e) => setCustomerId(e.target.value)} value={customerId}>
          <option value="">Select customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>

      {!hasCustomers || !customerId ? (
        <label>
          New customer name (optional)
          <input
            onChange={(e) => setNewCustomerName(e.target.value)}
            placeholder="Type customer name"
            value={newCustomerName}
          />
        </label>
      ) : null}

      <label>
        Amount (₹)
        <input
          inputMode="numeric"
          min="1"
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          type="number"
          value={amount}
        />
      </label>

      <div className="segmented">
        <button
          className={type === 'IN' ? 'active in' : 'in'}
          onClick={() => setType('IN')}
          type="button"
        >
          ➕ Cash IN
        </button>
        <button
          className={type === 'OUT' ? 'active out' : 'out'}
          onClick={() => setType('OUT')}
          type="button"
        >
          ➖ Cash OUT
        </button>
      </div>

      <label>
        Note
        <input onChange={(e) => setNote(e.target.value)} placeholder="Optional note" value={note} />
      </label>

      <label>
        Bill photo
        <input
          accept="image/*"
          capture="environment"
          onChange={(e) => setBillFile(e.target.files?.[0])}
          type="file"
        />
      </label>

      <button className="save-button" disabled={saving} type="submit">
        {saving ? 'Saving...' : 'Save Transaction'}
      </button>
    </form>
  );
}
