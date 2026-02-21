import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  deleteCustomer,
  deleteParty,
  deletePartyTransaction,
  deleteTransaction,
  getAllTransactions,
  getCustomers,
  getParties,
  getTransactionsForCustomer,
  getTransactionsForParty,
  saveCustomer,
  saveParty,
  savePartyTransaction,
  saveTransaction,
  type Customer,
  type LedgerTransaction,
  type Party,
  type PartyTransaction,
  type PaymentMode,
  type TransactionType
} from '../firebase/config';

type SortMode = 'RECENT' | 'HIGHEST_DUE';
type View =
  | { name: 'dashboard' }
  | { name: 'customers' }
  | { name: 'customer-form'; customer?: Customer }
  | { name: 'profile'; customer: Customer }
  | { name: 'transaction-form'; customer: Customer; transaction?: LedgerTransaction }
  | { name: 'parties' }
  | { name: 'party-form'; party?: Party }
  | { name: 'party-profile'; party: Party }
  | { name: 'party-transaction-form'; party: Party; transaction?: PartyTransaction };

function formatAmount(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN')}`;
}

function formatDateInput(date?: Date): string {
  if (!date) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function startOfDay(dateValue: string): number {
  return new Date(`${dateValue}T00:00:00`).getTime();
}

function endOfDay(dateValue: string): number {
  return new Date(`${dateValue}T23:59:59.999`).getTime();
}

function paymentModeLabel(mode: PaymentMode): string {
  if (mode === 'ONLINE') {
    return 'Online';
  }
  if (mode === 'PARTY_DIRECT') {
    return 'Direct to Party';
  }
  return 'Cash';
}

export function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('RECENT');
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [partyTransactions, setPartyTransactions] = useState<PartyTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<LedgerTransaction[]>([]);
  const [transactionType, setTransactionType] = useState<TransactionType>('CREDIT');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatDateInput(date);
  });
  const [toDate, setToDate] = useState(() => formatDateInput());

  async function reloadCustomers() {
    const list = await getCustomers();
    setCustomers(list);
    return list;
  }

  async function reloadParties() {
    const list = await getParties();
    setParties(list);
    return list;
  }

  async function reloadAllTransactions() {
    const list = await getAllTransactions();
    setAllTransactions(list);
    return list;
  }

  useEffect(() => {
    Promise.all([reloadCustomers(), reloadParties(), reloadAllTransactions()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view.name === 'profile') {
      getTransactionsForCustomer(view.customer.id).then(setTransactions);
      return;
    }

    if (view.name === 'party-profile') {
      getTransactionsForParty(view.party.id).then(setPartyTransactions);
    }
  }, [view]);

  useEffect(() => {
    if (view.name !== 'transaction-form') {
      return;
    }

    setTransactionType(view.transaction?.type ?? 'CREDIT');
    setPaymentMode(view.transaction?.paymentMode ?? 'CASH');
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

  const filteredPartyList = useMemo(() => {
    const search = partySearch.trim().toLowerCase();
    return parties
      .filter((party) => [party.name, party.phone, party.notes].join(' ').toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, partySearch]);

  const customerNameById = useMemo(() => {
    return customers.reduce<Record<string, string>>((map, customer) => {
      map[customer.id] = customer.name;
      return map;
    }, {});
  }, [customers]);

  const totalOutstanding = useMemo(
    () => customers.reduce((total, customer) => total + Math.max(0, customer.currentBalance), 0),
    [customers]
  );

  const totalPartyDue = useMemo(() => parties.reduce((total, party) => total + Math.max(0, party.currentDue), 0), [parties]);

  const dateFilteredTransactions = useMemo(() => {
    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);

    return allTransactions.filter((transaction) => {
      const time = transaction.date?.toMillis?.() ?? 0;
      return time >= start && time <= end;
    });
  }, [allTransactions, fromDate, toDate]);

  const dashboardMetrics = useMemo(() => {
    const customerTotals: Record<string, number> = {};
    let creditTotal = 0;
    let paymentTotal = 0;
    let cashPaymentTotal = 0;
    let onlinePaymentTotal = 0;
    let partyDirectPaymentTotal = 0;

    dateFilteredTransactions.forEach((transaction) => {
      const delta = transaction.type === 'CREDIT' ? transaction.amount : -transaction.amount;
      customerTotals[transaction.customerId] = (customerTotals[transaction.customerId] ?? 0) + delta;
      if (transaction.type === 'CREDIT') {
        creditTotal += transaction.amount;
      } else {
        paymentTotal += transaction.amount;
        const mode = transaction.paymentMode ?? 'CASH';
        if (mode === 'ONLINE') {
          onlinePaymentTotal += transaction.amount;
        } else if (mode === 'PARTY_DIRECT') {
          partyDirectPaymentTotal += transaction.amount;
        } else {
          cashPaymentTotal += transaction.amount;
        }
      }
    });

    const topCustomerId = Object.entries(customerTotals).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCustomer = customers.find((customer) => customer.id === topCustomerId);

    return {
      creditTotal,
      paymentTotal,
      cashPaymentTotal,
      onlinePaymentTotal,
      partyDirectPaymentTotal,
      netMovement: creditTotal - paymentTotal,
      transactionCount: dateFilteredTransactions.length,
      topCustomerName: topCustomer?.name ?? 'N/A'
    };
  }, [customers, dateFilteredTransactions]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, { credit: number; payment: number; count: number; cash: number; online: number; partyDirect: number }>();

    dateFilteredTransactions.forEach((transaction) => {
      const key = transaction.date?.toDate?.().toLocaleDateString('en-IN') ?? '-';
      const current = groups.get(key) ?? { credit: 0, payment: 0, count: 0, cash: 0, online: 0, partyDirect: 0 };
      if (transaction.type === 'CREDIT') {
        current.credit += transaction.amount;
      } else {
        current.payment += transaction.amount;
        const mode = transaction.paymentMode ?? 'CASH';
        if (mode === 'ONLINE') {
          current.online += transaction.amount;
        } else if (mode === 'PARTY_DIRECT') {
          current.partyDirect += transaction.amount;
        } else {
          current.cash += transaction.amount;
        }
      }
      current.count += 1;
      groups.set(key, current);
    });

    return Array.from(groups.entries()).map(([date, stats]) => ({ date, ...stats }));
  }, [dateFilteredTransactions]);

  async function openProfile(customer: Customer) {
    setView({ name: 'profile', customer });
    const ledger = await getTransactionsForCustomer(customer.id);
    setTransactions(ledger);
  }

  async function openPartyProfile(party: Party) {
    setView({ name: 'party-profile', party });
    const ledger = await getTransactionsForParty(party.id);
    setPartyTransactions(ledger);
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

  async function handleSaveParty(event: FormEvent<HTMLFormElement>, existing?: Party) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await saveParty({
      id: existing?.id,
      name: String(formData.get('name') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      notes: String(formData.get('notes') ?? '')
    });

    const list = await reloadParties();
    if (existing) {
      const updated = list.find((party) => party.id === existing.id);
      if (updated) {
        setView({ name: 'party-profile', party: updated });
        return;
      }
    }

    setView({ name: 'parties' });
  }

  async function handleDeleteCustomer(customer: Customer) {
    if (!window.confirm(`Delete ${customer.name}? This will remove all transactions.`)) {
      return;
    }

    await deleteCustomer(customer.id);
    await Promise.all([reloadCustomers(), reloadAllTransactions()]);
    setView({ name: 'customers' });
  }

  async function handleDeleteParty(party: Party) {
    if (!window.confirm(`Delete ${party.name}?`)) {
      return;
    }

    await deleteParty(party.id);
    await reloadParties();
    setView({ name: 'parties' });
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
      date: new Date(String(formData.get('date') ?? '')),
      paymentMode: String(formData.get('paymentMode') ?? 'CASH') as PaymentMode,
      partyId: String(formData.get('partyId') ?? '')
    });

    const [list, ledger] = await Promise.all([reloadCustomers(), getTransactionsForCustomer(customer.id), reloadAllTransactions()]);
    await reloadParties();
    const updatedCustomer = list.find((item) => item.id === customer.id) ?? customer;
    setTransactions(ledger);
    setView({ name: 'profile', customer: updatedCustomer });
  }

  async function handleSavePartyTransaction(event: FormEvent<HTMLFormElement>, party: Party, existing?: PartyTransaction) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    await savePartyTransaction({
      id: existing?.id,
      partyId: party.id,
      type: String(formData.get('type') ?? 'PURCHASE') as 'PURCHASE' | 'PAYMENT' | 'DISCOUNT',
      amount: Number(formData.get('amount') ?? 0),
      note: String(formData.get('note') ?? ''),
      date: new Date(String(formData.get('date') ?? ''))
    });

    const [list, ledger] = await Promise.all([reloadParties(), getTransactionsForParty(party.id)]);
    const updatedParty = list.find((item) => item.id === party.id) ?? party;
    setPartyTransactions(ledger);
    setView({ name: 'party-profile', party: updatedParty });
  }

  async function handleDeleteTransaction(transaction: LedgerTransaction, customer: Customer) {
    if (!window.confirm('Delete this transaction?')) {
      return;
    }

    await deleteTransaction(transaction.id);
    const [list, ledger] = await Promise.all([reloadCustomers(), getTransactionsForCustomer(customer.id), reloadAllTransactions()]);
    await reloadParties();
    const updatedCustomer = list.find((item) => item.id === customer.id) ?? customer;
    setTransactions(ledger);
    setView({ name: 'profile', customer: updatedCustomer });
  }

  async function handleDeletePartyTransaction(transaction: PartyTransaction, party: Party) {
    if (!window.confirm('Delete this party entry?')) {
      return;
    }

    await deletePartyTransaction(transaction.id);
    const [list, ledger] = await Promise.all([reloadParties(), getTransactionsForParty(party.id)]);
    const updatedParty = list.find((item) => item.id === party.id) ?? party;
    setPartyTransactions(ledger);
    setView({ name: 'party-profile', party: updatedParty });
  }

  return (
    <main className="container">
      <header className="card nav-bar hero-card">
        <h1>Ambey Garments Ledger</h1>
        <p>Track dues, payments and daily movement quickly.</p>
        <div className="nav-buttons nav-buttons-3">
          <button onClick={() => setView({ name: 'dashboard' })} type="button">Home</button>
          <button onClick={() => setView({ name: 'customers' })} type="button">Customers</button>
          <button onClick={() => setView({ name: 'parties' })} type="button">Parties</button>
        </div>
      </header>

      {loading ? <p>Loading...</p> : null}

      {view.name === 'dashboard' ? (
        <section className="card stack-gap">
          <h2>Dashboard</h2>
          <div className="stats-grid">
            <div className="balance-highlight danger">
              <span>Total Customer Outstanding</span>
              <strong>{formatAmount(totalOutstanding)}</strong>
            </div>
            <div className="balance-highlight party-due">
              <span>Total Party Due</span>
              <strong>{formatAmount(totalPartyDue)}</strong>
            </div>
          </div>

          <div className="date-filter-grid">
            <label>
              From
              <input max={toDate} onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
            </label>
            <label>
              To
              <input min={fromDate} onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
            </label>
          </div>

          <div className="stats-grid">
            <article className="metric-card">
              <small>Credit given</small>
              <strong>{formatAmount(dashboardMetrics.creditTotal)}</strong>
            </article>
            <article className="metric-card">
              <small>Payment received</small>
              <strong>{formatAmount(dashboardMetrics.paymentTotal)}</strong>
            </article>
            <article className="metric-card">
              <small>Net movement</small>
              <strong>{formatAmount(dashboardMetrics.netMovement)}</strong>
            </article>
            <article className="metric-card">
              <small>Transactions</small>
              <strong>{dashboardMetrics.transactionCount}</strong>
            </article>
            <article className="metric-card">
              <small>Cash received</small>
              <strong>{formatAmount(dashboardMetrics.cashPaymentTotal)}</strong>
            </article>
            <article className="metric-card">
              <small>Online received</small>
              <strong>{formatAmount(dashboardMetrics.onlinePaymentTotal)}</strong>
            </article>
            <article className="metric-card">
              <small>Direct to party</small>
              <strong>{formatAmount(dashboardMetrics.partyDirectPaymentTotal)}</strong>
            </article>
          </div>

          <p className="auth-help">Top due in selected range: <strong>{dashboardMetrics.topCustomerName}</strong></p>

          <div className="datewise-list">
            {groupedByDate.length ? groupedByDate.map((item) => (
              <div className="datewise-item" key={item.date}>
                <strong>{item.date}</strong>
                <span>Credit: {formatAmount(item.credit)}</span>
                <span>Payment: {formatAmount(item.payment)}</span>
                <span>Cash / Online / Party: {formatAmount(item.cash)} / {formatAmount(item.online)} / {formatAmount(item.partyDirect)}</span>
                <span>Txns: {item.count}</span>
              </div>
            )) : <p className="auth-help">No transactions in this date range.</p>}
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

      {view.name === 'parties' ? (
        <section className="card stack-gap">
          <h2>Party List</h2>
          <button className="save-button" onClick={() => setView({ name: 'party-form' })} type="button">
            + Add New Party
          </button>

          <input onChange={(event) => setPartySearch(event.target.value)} placeholder="Search party" value={partySearch} />

          <div className="customer-list">
            {filteredPartyList.map((party) => (
              <button className="customer-item" key={party.id} onClick={() => openPartyProfile(party)} type="button">
                <div>
                  <strong>{party.name}</strong>
                  <small>{party.phone}</small>
                </div>
                <strong className={party.currentDue >= 0 ? 'danger-text' : 'success-text'}>{formatAmount(party.currentDue)}</strong>
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

      {view.name === 'party-form' ? (
        <form className="card stack-gap" onSubmit={(event) => handleSaveParty(event, view.party)}>
          <h2>{view.party ? 'Edit Party' : 'Add Party'}</h2>
          <label>
            Party Name
            <input defaultValue={view.party?.name ?? ''} name="name" required />
          </label>
          <label>
            Phone Number
            <input defaultValue={view.party?.phone ?? ''} name="phone" />
          </label>
          <label>
            Notes
            <textarea defaultValue={view.party?.notes ?? ''} name="notes" rows={2} />
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
              <span>
                {transaction.note || transaction.type}
                {transaction.type === 'PAYMENT' ? ` (${paymentModeLabel(transaction.paymentMode ?? 'CASH')})` : ''}
              </span>
              <span>{transaction.type === 'CREDIT' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{transaction.type === 'PAYMENT' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{formatAmount(transaction.balanceAfter)}</span>
            </button>
          ))}
        </section>
      ) : null}

      {view.name === 'party-profile' ? (
        <section className="card stack-gap">
          <h2>Party Profile</h2>
          <div className="profile-header">
            <div>
              <h3>{view.party.name}</h3>
              <p>{view.party.phone || 'No phone'}</p>
              <p>{view.party.notes || 'No notes'}</p>
            </div>
            <div className="balance-highlight danger">
              <span>Current Due</span>
              <strong>{formatAmount(view.party.currentDue)}</strong>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => setView({ name: 'party-form', party: view.party })} type="button">
              Edit Party
            </button>
            <button className="out" onClick={() => handleDeleteParty(view.party)} type="button">
              Delete Party
            </button>
          </div>

          <button
            className="save-button"
            onClick={() => setView({ name: 'party-transaction-form', party: view.party })}
            type="button"
          >
            + Add Party Entry
          </button>

          <h3>Party Ledger</h3>
          <div className="ledger-grid ledger-header party-ledger-grid">
            <span>Date</span>
            <span>Description</span>
            <span>Add Due</span>
            <span>Less</span>
            <span>Due</span>
          </div>
          {partyTransactions.map((transaction) => (
            <button
              className="ledger-grid ledger-row party-ledger-grid"
              key={transaction.id}
              onClick={() => {
                if (transaction.type !== 'CUSTOMER_DIRECT') {
                  setView({ name: 'party-transaction-form', party: view.party, transaction });
                }
              }}
              type="button"
            >
              <span>{transaction.date?.toDate?.().toLocaleDateString() ?? '-'}</span>
              <span>
                {transaction.note || transaction.type}
                {transaction.type === 'CUSTOMER_DIRECT'
                  ? ` (from ${customerNameById[transaction.customerId ?? ''] ?? 'customer'} payment)`
                  : ''}
              </span>
              <span>{transaction.type === 'PURCHASE' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{transaction.type !== 'PURCHASE' ? formatAmount(transaction.amount) : '-'}</span>
              <span>{formatAmount(transaction.dueAfter)}</span>
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
            <select
              defaultValue={view.transaction?.type ?? 'CREDIT'}
              name="type"
              onChange={(event) => setTransactionType(event.target.value as TransactionType)}
            >
              <option value="CREDIT">Credit given</option>
              <option value="PAYMENT">Payment received</option>
            </select>
          </label>

          {transactionType === 'PAYMENT' ? (
            <>
              <label>
                Payment Mode
                <select
                  defaultValue={view.transaction?.paymentMode ?? 'CASH'}
                  name="paymentMode"
                  onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
                >
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online</option>
                  <option value="PARTY_DIRECT">Direct to Party</option>
                </select>
              </label>

              {paymentMode === 'PARTY_DIRECT' ? (
                <label>
                  Party
                  <select defaultValue={view.transaction?.partyId ?? ''} name="partyId" required>
                    <option value="">Select party</option>
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>{party.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

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

      {view.name === 'party-transaction-form' ? (
        <form className="card stack-gap" onSubmit={(event) => handleSavePartyTransaction(event, view.party, view.transaction)}>
          <h2>{view.transaction ? 'Edit Party Entry' : 'Add Party Entry'}</h2>

          <label>
            Date
            <input defaultValue={formatDateInput(view.transaction?.date?.toDate?.())} name="date" required type="date" />
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
            <select defaultValue={view.transaction?.type ?? 'PURCHASE'} name="type">
              <option value="PURCHASE">Purchase (Add due)</option>
              <option value="PAYMENT">Payment to party (Less due)</option>
              <option value="DISCOUNT">Discount promised (Less due)</option>
            </select>
          </label>

          <label>
            Note / Description
            <textarea defaultValue={view.transaction?.note ?? ''} name="note" rows={2} />
          </label>

          <button className="save-button" type="submit">
            Save
          </button>

          {view.transaction && view.transaction.type !== 'CUSTOMER_DIRECT' ? (
            <button className="out" onClick={() => handleDeletePartyTransaction(view.transaction!, view.party)} type="button">
              Delete Entry
            </button>
          ) : null}
        </form>
      ) : null}
    </main>
  );
}
