import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Home } from './pages/Home';
import {
  approveUser,
  ensureAdminUser,
  getPendingUsers,
  loginUser,
  signUpUser,
  type AppUser
} from './firebase/config';

type AuthMode = 'LOGIN' | 'SIGNUP';

const STORAGE_KEY = 'ambey-ledger-user';

function App() {
  const [mode, setMode] = useState<AuthMode>('LOGIN');
  const [user, setUser] = useState<AppUser | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    ensureAdminUser();

    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        setUser(JSON.parse(cached) as AppUser);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') {
      setPendingUsers([]);
      return;
    }

    getPendingUsers().then(setPendingUsers);
  }, [user]);

  const pendingCountLabel = useMemo(() => {
    if (!pendingUsers.length) {
      return 'No pending approvals';
    }
    return `${pendingUsers.length} pending approval${pendingUsers.length > 1 ? 's' : ''}`;
  }, [pendingUsers]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const form = event.currentTarget;
    const formData = new FormData(form);
    const phone = String(formData.get('phone') ?? '');
    const password = String(formData.get('password') ?? '');

    try {
      if (mode === 'SIGNUP') {
        await signUpUser({
          name: String(formData.get('name') ?? ''),
          phone,
          password
        });
        setMode('LOGIN');
        setMessage('Signup submitted. Ask Megha Jain to approve your login request.');
        form.reset();
        return;
      }

      const loggedIn = await loginUser(phone, password);
      setUser(loggedIn);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedIn));
      form.reset();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Something went wrong.');
    }
  }

  async function handleApprove(userId: string) {
    await approveUser(userId);
    const refreshed = await getPendingUsers();
    setPendingUsers(refreshed);
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  if (!user) {
    return (
      <main className="container">
        <section className="card stack-gap auth-card">
          <h1>Ambey Garments Ledger</h1>
          <p className="auth-help">Login with phone number and password.</p>

          <div className="segmented">
            <button className={mode === 'LOGIN' ? 'active' : ''} onClick={() => setMode('LOGIN')} type="button">
              Login
            </button>
            <button className={mode === 'SIGNUP' ? 'active' : ''} onClick={() => setMode('SIGNUP')} type="button">
              Sign Up
            </button>
          </div>

          <form className="stack-gap" onSubmit={handleAuth}>
            {mode === 'SIGNUP' ? (
              <label>
                Full Name
                <input name="name" placeholder="Enter your name" required />
              </label>
            ) : null}
            <label>
              Phone Number
              <input inputMode="numeric" name="phone" pattern="[0-9]{10}" placeholder="10-digit phone" required />
            </label>
            <label>
              Password
              <input minLength={6} name="password" placeholder="Enter password" required type="password" />
            </label>
            <button className="save-button" type="submit">
              {mode === 'LOGIN' ? 'Login' : 'Create Account'}
            </button>
          </form>

          {error ? <p className="danger-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}

          <div className="auth-note card">
            <strong>Admin approver</strong>
            <p>Megha Jain approves new login requests.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {user.role === 'ADMIN' ? (
        <section className="container">
          <div className="card stack-gap">
            <div className="admin-approval-head">
              <strong>Welcome, {user.name}</strong>
              <button onClick={handleLogout} type="button">
                Logout
              </button>
            </div>
            <p>{pendingCountLabel}</p>
            {pendingUsers.map((pendingUser) => (
              <div className="approval-item" key={pendingUser.id}>
                <div>
                  <strong>{pendingUser.name}</strong>
                  <small>{pendingUser.phone}</small>
                </div>
                <button className="save-button" onClick={() => handleApprove(pendingUser.id)} type="button">
                  Approve
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="container">
          <div className="card admin-approval-head">
            <strong>Welcome, {user.name}</strong>
            <button onClick={handleLogout} type="button">
              Logout
            </button>
          </div>
        </section>
      )}
      <Home />
    </>
  );
}

export default App;
