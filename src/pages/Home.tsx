import { useEffect, useState } from 'react';
import { AddTransaction } from '../components/AddTransaction';
import { CustomerLedger } from '../components/CustomerLedger';
import { CustomerList } from '../components/CustomerList';
import {
  getCustomers,
  getTransactionsForCustomer,
  type Customer,
  type LedgerTransaction,
  type TransactionType
} from '../firebase/config';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [quickType, setQuickType] = useState<TransactionType>('IN');
  const [loading, setLoading] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  async function refreshCustomers() {
    const list = await getCustomers(search);
    setCustomers(list);
    if (!selectedCustomerId && list[0]) {
      setSelectedCustomerId(list[0].id);
    }
  }

  useEffect(() => {
    setLoading(true);
    refreshCustomers().finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setTransactions([]);
      return;
    }

    getTransactionsForCustomer(selectedCustomerId).then(setTransactions);
  }, [selectedCustomerId]);

  async function onSaved() {
    await refreshCustomers();
    if (selectedCustomerId) {
      const next = await getTransactionsForCustomer(selectedCustomerId);
      setTransactions(next);
    }
  }

  async function handleInstall() {
    if (!installEvent) {
      return;
    }
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <main className="container">
      <header className="card">
        <h1>Ambey Garments Ledger</h1>
        <input
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer"
          value={search}
        />

        {installEvent ? (
          <button className="save-button" onClick={handleInstall} type="button">
            Install App
          </button>
        ) : null}

        <div className="quick-actions">
          <button className="in" onClick={() => setQuickType('IN')} type="button">
            ➕ Cash IN
          </button>
          <button className="out" onClick={() => setQuickType('OUT')} type="button">
            ➖ Cash OUT
          </button>
        </div>
      </header>

      {loading ? <p>Loading...</p> : null}

      <AddTransaction
        customers={customers}
        defaultCustomerId={selectedCustomerId}
        defaultType={quickType}
        onSaved={onSaved}
      />

      <CustomerList
        customers={customers}
        onSelect={setSelectedCustomerId}
        selectedCustomerId={selectedCustomerId}
      />

      <CustomerLedger transactions={transactions} />
    </main>
  );
}
