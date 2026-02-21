import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  deleteCustomer,
  deleteTransaction,
  getCustomers,
  getTransactionsForCustomer,
  saveCustomer,
  saveTransaction,
  type Customer,
  type LedgerTransaction,
  type TransactionType
} from '../firebase/config';

type SortMode = 'RECENT' | 'HIGHEST_DUE';
type View =
  | { name: 'dashboard' }
  | { name: 'customers' }
  | { name: 'customer-form'; customer?: Customer }
  | { name: 'profile'; customer: Customer }
  | { name: 'transaction-form'; customer: Customer; transaction?: LedgerTransaction };

function formatAmount(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN')}`;
}

function formatDateInput(date?: Date): string {
  if (!date) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('RECENT');
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);

  async function reloadCustomers() {
    const list = await getCustomers();
    setCustomers(list);
    return list;
  }

  useEffect(() => {
    reloadCustomers().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view.name !== 'profile') {
      return;
    }

    getTransactionsForCustomer(view.customer.id).then(setTransactions);
  }, [view]);

  const filteredDashboardCustomers = useMemo(() => {
    const search = dashboardSearch.trim().toLowerCase();
    const matched = customers.filter((customer) => {
      if (!search) {
        return true;
      }
      return [customer.name, customer.phone, customer.notes].join(' ').toLowerCase().includes(search);
    });

    if (sortMode === 'HIGHEST_DUE') {
      return [...matched].sort((a, b) => b.currentBalance - a.currentBalance);
    }

    return [...matched].sort((a, b) => {
      const aTime = a.lastActivity?.toMillis() ?? 0;
      const bTime = b.lastActivity?.toMillis() ?? 0;
      return bTime - aTime;
    });
  }, [customers, dashboardSearch, sortMode]);

  const filteredCustomerList = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) =>
        [customer.name, customer.phone, customer.address, customer.notes]
          .join(' ')
          .toLowerCase()
          .includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, customerSearch]);

  const totalOutstanding = useMemo(
    () => customers.reduce((total, customer) => total + Math.max(0, customer.currentBalance), 0),
    [customers]
  );

  async function openProfile(customer: Customer) {
    setView({ name: 'profile', customer });
    const ledger = await getTransactionsForCustomer(customer.id);
    setTransactions(ledger);
  }

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>, existing?: Customer) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await saveCustomer({
      id: existing?.id,
      name: String(formData.get('name') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
      notes: String(formData.get('notes') ?? '')
    });

    const list = await reloadCustomers();
    if (existing) {
      const updated = list.find((customer) => customer.id === existing.id);
      if (updated) {
        setView({ name: 'profile', customer: updated });
        return;
      }
    }

    setView({ name: 'customers' });
  }

  async function handleDeleteCustomer(customer: Customer) {
    if (!window.confirm(`Delete ${customer.name}? This will remove all transactions.`)) {
      return;
    }

    await deleteCustomer(customer.id);
    await reloadCustomers();
    setView({ name: 'customers' });
  }

  async function handleSaveTransaction(event: FormEvent<HTMLFormElement>, customer: Customer, existing?: LedgerTransaction) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await saveTransaction({
      id: existing?.id,
      customerId: customer.id,
      amount: Number(formData.get('amount') ?? 0),
      type: String(formData.get('type') ?? 'CREDIT') as TransactionType,
      note: String(formData.get('note') ?? ''),
      date: new Date(String(formData.get('date') ?? ''))
    });

    const list = await reloadCustomers();
    const updatedCustomer = list.find((item) => item.id === customer.id) ?? customer;
    const ledger = await getTransactionsForCustomer(customer.id);
    setTransactions(ledger);
    setView({ name: 'profile', customer: updatedCustomer });
  }

  async function handleDeleteTransaction(transaction: LedgerTransaction, customer: Customer) {
    if (!window.confirm('Delete this transaction?')) {
      return;
    }

    await deleteTransaction(transaction.id);
    const list = await reloadCustomers();
    const updatedCustomer = list.find((item) => item.id === customer.id) ?? customer;
    const ledger = await getTransactionsForCustomer(customer.id);
    setTransactions(ledger);
    setView({ name: 'profile', customer: updatedCustomer });
  }

  return (
    <main className="container">
      <header className="card nav-bar">
        <h1>Ambey Garments Ledger</h1>
        <div className="nav-buttons">
          <button onClick={() => setView({ name: 'dashboard' })} type="button">Home</button>
          <button onClick={() => setView({ name: 'customers' })} type="button">Customers</button>
        </div>
      </header>

      {loading ? <p>Loading...</p> : null}

      {view.name === 'dashboard' ? (
        <section className="card stack-gap">
          <h2>Dashboard</h2>
          <div className="balance-highlight danger">
            <span>Total Outstanding</span>
            <strong>{formatAmount(totalOutstanding)}</strong>
          </div>

          <input
            onChange={(event) => setDashboardSearch(event.target.value)}
            placeholder="Quick search customer"
            value={dashboardSearch}
          />

          <div className="segmented">
            <button
              className={sortMode === 'RECENT' ? 'active' : ''}
              onClick={() => setSortMode('RECENT')}
              type="button"
            >
              Recent activity
            </button>
            <button
              className={sortMode === 'HIGHEST_DUE' ? 'active' : ''}
              onClick={() => setSortMode('HIGHEST_DUE')}
              type="button"
            >
              Highest due
            </button>
          </div>

          <div className="customer-list">
            {filteredDashboardCustomers.map((customer) => (
              <button className="customer-item" key={customer.id} onClick={() => openProfile(customer)} type="button">
                <span>{customer.name}</span>
                <strong className={customer.currentBalance >= 0 ? 'danger-text' : 'success-text'}>
                  {customer.currentBalance >= 0 ? formatAmount(customer.currentBalance) : `+${formatAmount(customer.currentBalance)}`}
                </strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view.name === 'customers' ? (
        <section className="card stack-gap">
          <h2>Customer List</h2>
          <button className="save-button" onClick={() => setView({ name: 'customer-form' })} type="button">
            + Add New Customer
          </button>

          <input
            onChange={(event) => setCustomerSearch(event.target.value)}
            placeholder="Search & filter"
            value={customerSearch}
          />

          <div className="customer-list">
            {filteredCustomerList.map((customer) => (
              <button className="customer-item" key={customer.id} onClick={() => openProfile(customer)} type="button">
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.phone}</small>
                </div>
                <strong className={customer.currentBalance >= 0 ? 'danger-text' : 'success-text'}>
                  {customer.currentBalance >= 0 ? formatAmount(customer.currentBalance) : `+${formatAmount(customer.currentBalance)}`}
                </strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view.name === 'customer-form' ? (
        <form className="card stack-gap" onSubmit={(event) => handleSaveCustomer(event, view.customer)}>
          <h2>{view.customer ? 'Edit Customer' : 'Add Customer'}</h2>
          <label>
            Name
            <input defaultValue={view.customer?.name ?? ''} name="name" required />
          </label>
          <label>
            Phone Number
            <input defaultValue={view.customer?.phone ?? ''} name="phone" />
          </label>
          <label>
            Address
            <textarea defaultValue={view.customer?.address ?? ''} name="address" rows={2} />
          </label>
          <label>
            Notes
            <textarea defaultValue={view.customer?.notes ?? ''} name="notes" rows={2} />
          </label>
          <button className="save-button" type="submit">
            Save
          </button>
        </form>
      ) : null}

      {view.name === 'profile' ? (
        <section className="card stack-gap">
          <h2>Customer Profile</h2>
          <div className="profile-header">
            <div>
              <h3>{view.customer.name}</h3>
              <p>{view.customer.phone || 'No phone'}</p>
              <p>{view.customer.notes || 'No notes'}</p>
            </div>
            <div className={view.customer.currentBalance >= 0 ? 'balance-highlight danger' : 'balance-highlight success'}>
              <span>Current Balance</span>
              <strong>
                {view.customer.currentBalance >= 0
                  ? formatAmount(view.customer.currentBalance)
                  : `Advance ${formatAmount(view.customer.currentBalance)}`}
              </strong>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => setView({ name: 'customer-form', customer: view.customer })} type="button">
              Edit Customer
            </button>
            <button className="out" onClick={() => handleDeleteCustomer(view.customer)} type="button">
              Delete Customer
            </button>
          </div>

          <button
            className="save-button"
            onClick={() => setView({ name: 'transaction-form', customer: view.customer })}
            type="button"
          >
            + Add Transaction
          </button>

          <h3>Ledger</h3>
          <div className="ledger-grid ledger-header">
            <span>Date</span>
            <span>Description</span>
            <span>Debit</span>
            <span>Credit</span>
            <span>Balance</span>
          </div>
          {transactions.map((transaction) => (
            <button
              className="ledger-grid ledger-row"
              key={transaction.id}
              onClick={() => setView({ name: 'transaction-form', customer: view.customer, transaction })}
              type="button"
            >
              <span>{transaction.date?.toDate?.().toLocaleDateString() ?? '-'}</span>
              <span>{transaction.note || transaction.type}</span>
              <span>{transaction.type === 'CREDIT' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{transaction.type === 'PAYMENT' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{formatAmount(transaction.balanceAfter)}</span>
            </button>
          ))}
        </section>
      ) : null}

      {view.name === 'transaction-form' ? (
        <form
          className="card stack-gap"
          onSubmit={(event) => handleSaveTransaction(event, view.customer, view.transaction)}
        >
          <h2>{view.transaction ? 'Edit Transaction' : 'Add Transaction'}</h2>

          <label>
            Date
            <input
              defaultValue={formatDateInput(view.transaction?.date?.toDate?.())}
              name="date"
              required
              type="date"
            />
          </label>

          <label>
            Amount
            <input
              defaultValue={view.transaction?.amount ?? ''}
              inputMode="numeric"
              min="1"
              name="amount"
              required
              type="number"
            />
          </label>

          <label>
            Type
            <select defaultValue={view.transaction?.type ?? 'CREDIT'} name="type">
              <option value="CREDIT">Credit given</option>
              <option value="PAYMENT">Payment received</option>
            </select>
          </label>

          <label>
            Note / Description
            <textarea defaultValue={view.transaction?.note ?? ''} name="note" rows={2} />
          </label>

          <button className="save-button" type="submit">
            Save
          </button>

          {view.transaction ? (
            <button className="out" onClick={() => handleDeleteTransaction(view.transaction!, view.customer)} type="button">
              Delete Transaction
            </button>
          ) : null}
        </form>
      ) : null}
    </main>
  );
}
