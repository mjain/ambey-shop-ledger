import { initializeApp } from 'firebase/app';
import {
  collection,
  getCountFromServer,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  Timestamp,
  where,
  writeBatch
} from 'firebase/firestore';

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

export type TransactionType = 'CREDIT' | 'PAYMENT';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  currentBalance: number;
  lastActivity?: Timestamp;
}

export interface LedgerTransaction {
  id: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  note: string;
  date: Timestamp;
  balanceAfter: number;
}

export interface SaveCustomerInput {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
}

export interface SaveTransactionInput {
  id?: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  note?: string;
  date: Date;
}

export type AppUserRole = 'ADMIN' | 'STAFF';

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  password: string;
  role: AppUserRole;
  approved: boolean;
  createdAt?: Timestamp;
}

interface SignUpInput {
  name: string;
  phone: string;
  password: string;
}

const SHOPS = collection(db, 'shops');
const SHOP_ID = 'ambey-garments';
const shopRef = doc(SHOPS, SHOP_ID);
const customersRef = collection(shopRef, 'customers');
const transactionsRef = collection(shopRef, 'transactions');
const usersRef = collection(shopRef, 'users');



const ADMIN_USER: Omit<AppUser, 'id'> = {
  name: 'Megha Jain',
  phone: import.meta.env.VITE_ADMIN_PHONE?.trim(),
  password: import.meta.env.VITE_ADMIN_PASSWORD?.trim(),
  role: 'ADMIN',
  approved: true
};

function normalizeTransactionType(raw: string): TransactionType {
  if (raw === 'PAYMENT' || raw === 'OUT') {
    return 'PAYMENT';
  }
  return 'CREDIT';
}

function customerFromDoc(id: string, data: Record<string, unknown>): Customer {
  return {
    id,
    name: String(data.name ?? ''),
    phone: String(data.phone ?? ''),
    address: String(data.address ?? ''),
    notes: String(data.notes ?? ''),
    currentBalance: Number(data.currentBalance ?? 0),
    lastActivity: data.lastActivity as Timestamp | undefined
  };
}

function userFromDoc(id: string, data: Record<string, unknown>): AppUser {
  return {
    id,
    name: String(data.name ?? ''),
    phone: String(data.phone ?? ''),
    password: String(data.password ?? ''),
    role: data.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
    approved: Boolean(data.approved),
    createdAt: data.createdAt as Timestamp | undefined
  };
}

export async function ensureAdminUser(): Promise<void> {
  const snapshot = await getDocs(query(usersRef, where('phone', '==', ADMIN_USER.phone)));

  if (snapshot.empty) {
    const adminRef = doc(usersRef);
    await runTransaction(db, async (tx) => {
      tx.set(adminRef, {
        ...ADMIN_USER,
        createdAt: Timestamp.now()
      });
    });
    return;
  }

  const existingAdminRef = snapshot.docs[0].ref;
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(existingAdminRef);
    if (!existing.exists()) {
      return;
    }

    tx.update(existingAdminRef, {
      name: ADMIN_USER.name,
      role: 'ADMIN',
      approved: true
    });
  });
}

export async function signUpUser(input: SignUpInput): Promise<void> {
  const name = input.name.trim();
  const phone = input.phone.trim();
  const password = input.password.trim();

  if (!name || !phone || !password) {
    throw new Error('Name, phone and password are required.');
  }

  const existing = await getCountFromServer(query(usersRef, where('phone', '==', phone)));
  if (existing.data().count > 0) {
    throw new Error('Phone number is already registered.');
  }

  const userRef = doc(usersRef);
  await runTransaction(db, async (tx) => {
    tx.set(userRef, {
      name,
      phone,
      password,
      role: 'STAFF',
      approved: false,
      createdAt: Timestamp.now()
    });
  });
}

export async function loginUser(phone: string, password: string): Promise<AppUser> {
  const cleanPhone = phone.trim();
  const cleanPassword = password.trim();
  const snapshot = await getDocs(query(usersRef, where('phone', '==', cleanPhone), where('password', '==', cleanPassword)));

  if (snapshot.empty) {
    throw new Error('Invalid phone number or password.');
  }

  const user = userFromDoc(snapshot.docs[0].id, snapshot.docs[0].data());
  if (user.role !== 'ADMIN' && !user.approved) {
    throw new Error('Your login request is pending admin approval from Megha Jain.');
  }

  return user;
}

export async function getPendingUsers(): Promise<AppUser[]> {
  const snapshot = await getDocs(query(usersRef, where('approved', '==', false)));
  return snapshot.docs
    .map((item) => userFromDoc(item.id, item.data()))
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
}

export async function approveUser(userId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const targetRef = doc(usersRef, userId);
    const existing = await tx.get(targetRef);

    if (!existing.exists()) {
      throw new Error('User not found.');
    }

    tx.update(targetRef, { approved: true });
  });
}

export async function getCustomers(searchTerm = ''): Promise<Customer[]> {
  const snapshot = await getDocs(customersRef);
  const lowered = searchTerm.trim().toLowerCase();

  return snapshot.docs
    .map((d) => customerFromDoc(d.id, d.data()))
    .filter((customer) =>
      [customer.name, customer.phone, customer.address, customer.notes]
        .join(' ')
        .toLowerCase()
        .includes(lowered)
    );
}

export async function getCustomer(customerId: string): Promise<Customer | null> {
  const customerSnap = await getDoc(doc(customersRef, customerId));
  if (!customerSnap.exists()) {
    return null;
  }

  return customerFromDoc(customerSnap.id, customerSnap.data());
}

export async function saveCustomer(input: SaveCustomerInput): Promise<string> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('Customer name is required.');
  }

  const customerRef = input.id ? doc(customersRef, input.id) : doc(customersRef);

  await runTransaction(db, async (tx) => {
    if (!input.id) {
      tx.set(customerRef, {
        name: trimmedName,
        phone: input.phone.trim(),
        address: input.address?.trim() ?? '',
        notes: input.notes?.trim() ?? '',
        currentBalance: 0
      });
      return;
    }

    const existing = await tx.get(customerRef);
    if (!existing.exists()) {
      throw new Error('Customer not found.');
    }

    tx.update(customerRef, {
      name: trimmedName,
      phone: input.phone.trim(),
      address: input.address?.trim() ?? '',
      notes: input.notes?.trim() ?? ''
    });
  });

  return customerRef.id;
}

async function recalculateCustomerBalance(customerId: string): Promise<void> {
  const ledgerQuery = query(transactionsRef, where('customerId', '==', customerId));
  const snapshot = await getDocs(ledgerQuery);
  const orderedTransactions = [...snapshot.docs].sort((a, b) => {
    const aDate = (a.data().date as Timestamp | undefined)?.toMillis() ?? 0;
    const bDate = (b.data().date as Timestamp | undefined)?.toMillis() ?? 0;
    return aDate - bDate;
  });

  let runningBalance = 0;
  let lastActivity: Timestamp | null = null;
  const batch = writeBatch(db);

  orderedTransactions.forEach((transactionDoc) => {
    const data = transactionDoc.data();
    const type = normalizeTransactionType(String(data.type ?? 'CREDIT'));
    const amount = Number(data.amount ?? 0);
    const delta = type === 'CREDIT' ? amount : -amount;
    runningBalance += delta;

    const txnDate = data.date as Timestamp | undefined;
    if (txnDate) {
      lastActivity = txnDate;
    }

    batch.update(transactionDoc.ref, {
      type,
      balanceAfter: runningBalance
    });
  });

  batch.update(doc(customersRef, customerId), {
    currentBalance: runningBalance,
    lastActivity
  });

  await batch.commit();
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const ledgerQuery = query(transactionsRef, where('customerId', '==', customerId));
  const snapshot = await getDocs(ledgerQuery);
  const batch = writeBatch(db);

  snapshot.docs.forEach((transactionDoc) => {
    batch.delete(transactionDoc.ref);
  });

  batch.delete(doc(customersRef, customerId));
  await batch.commit();
}

export async function saveTransaction(input: SaveTransactionInput): Promise<string> {
  if (!input.customerId) {
    throw new Error('Customer is required.');
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error('Amount should be greater than zero.');
  }

  const transactionRef = input.id ? doc(transactionsRef, input.id) : doc(transactionsRef);
  const payload = {
    customerId: input.customerId,
    type: input.type,
    amount: input.amount,
    note: input.note?.trim() ?? '',
    date: Timestamp.fromDate(input.date)
  };

  if (input.id) {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(transactionRef);
      if (!existing.exists()) {
        throw new Error('Transaction not found.');
      }
      tx.update(transactionRef, payload);
    });
  } else {
    await runTransaction(db, async (tx) => {
      tx.set(transactionRef, payload);
    });
  }

  await recalculateCustomerBalance(input.customerId);
  return transactionRef.id;
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const transactionRef = doc(transactionsRef, transactionId);
  const snapshot = await getDoc(transactionRef);
  if (!snapshot.exists()) {
    return;
  }

  const customerId = String(snapshot.data().customerId ?? '');
  await deleteDoc(transactionRef);

  if (customerId) {
    await recalculateCustomerBalance(customerId);
  }
}

export async function getTransactionsForCustomer(customerId: string): Promise<LedgerTransaction[]> {
  const q = query(transactionsRef, where('customerId', '==', customerId));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        customerId: String(data.customerId),
        type: normalizeTransactionType(String(data.type ?? 'CREDIT')),
        amount: Number(data.amount ?? 0),
        note: String(data.note ?? ''),
        date: data.date as Timestamp,
        balanceAfter: Number(data.balanceAfter ?? 0)
      };
    })
    .sort((a, b) => b.date.toMillis() - a.date.toMillis());
}
