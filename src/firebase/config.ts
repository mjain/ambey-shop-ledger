import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export type TransactionType = 'IN' | 'OUT';

export interface Customer {
  id: string;
  name: string;
  currentBalance: number;
}

export interface LedgerTransaction {
  id: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  note: string;
  date: Timestamp;
  billImageUrl?: string;
  balanceAfter: number;
}

const SHOPS = collection(db, 'shops');
const SHOP_ID = 'ambey-garments';
const shopRef = doc(SHOPS, SHOP_ID);
const customersRef = collection(shopRef, 'customers');
const transactionsRef = collection(shopRef, 'transactions');

export async function getCustomers(searchTerm = ''): Promise<Customer[]> {
  const snapshot = await getDocs(customersRef);
  const allCustomers: Customer[] = snapshot.docs.map((d) => ({
    id: d.id,
    name: String(d.data().name ?? ''),
    currentBalance: Number(d.data().currentBalance ?? 0)
  }));

  const lowered = searchTerm.trim().toLowerCase();
  return allCustomers
    .filter((c) => c.name.toLowerCase().includes(lowered))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createCustomer(name: string): Promise<string> {
  const customerDoc = doc(customersRef);
  await runTransaction(db, async (tx) => {
    tx.set(customerDoc, {
      name: name.trim(),
      currentBalance: 0
    });
  });
  return customerDoc.id;
}

export async function addTransaction(params: {
  customerId: string;
  type: TransactionType;
  amount: number;
  note: string;
  billFile?: File;
}): Promise<void> {
  let billImageUrl = '';

  if (params.billFile) {
    const fileRef = ref(
      storage,
      `shops/${SHOP_ID}/bills/${params.customerId}/${Date.now()}-${params.billFile.name}`
    );
    await uploadBytes(fileRef, params.billFile);
    billImageUrl = await getDownloadURL(fileRef);
  }

  const customerRef = doc(customersRef, params.customerId);
  const transactionRef = doc(transactionsRef);

  await runTransaction(db, async (tx) => {
    const customerSnap = await tx.get(customerRef);
    if (!customerSnap.exists()) {
      throw new Error('Customer does not exist.');
    }

    const currentBalance = Number(customerSnap.data().currentBalance ?? 0);
    const delta = params.type === 'IN' ? params.amount : -params.amount;
    const updatedBalance = currentBalance + delta;

    tx.update(customerRef, {
      currentBalance: increment(delta)
    });

    tx.set(transactionRef, {
      customerId: params.customerId,
      type: params.type,
      amount: params.amount,
      note: params.note.trim(),
      date: serverTimestamp(),
      billImageUrl,
      balanceAfter: updatedBalance
    });
  });
}

export async function getTransactionsForCustomer(customerId: string): Promise<LedgerTransaction[]> {
  const q = query(
    transactionsRef,
    where('customerId', '==', customerId),
    orderBy('date', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      customerId: String(data.customerId),
      type: data.type as TransactionType,
      amount: Number(data.amount),
      note: String(data.note ?? ''),
      date: data.date as Timestamp,
      billImageUrl: String(data.billImageUrl ?? ''),
      balanceAfter: Number(data.balanceAfter ?? 0)
    };
  });
}
