// src/App.jsx — top-level layout: switches between login, ticket list,
// ticket conversation and the admin panel based on the logged-in role.
import { useState } from 'react';
import AuthScreen from './components/AuthScreen';
import TicketList from './components/TicketList';
import TicketDetail from './components/TicketDetail';
import AdminPanel from './components/AdminPanel';
import { getUser, setSession, clearSession } from './api';

export default function App() {
  const [user, setUser] = useState(getUser());
  const [view, setView] = useState({ screen: 'list' });

  function handleAuth(data) {
    setSession(data.token, data.user);
    setUser(data.user);
    setView({ screen: 'list' });
  }

  function logout() {
    clearSession();
    setUser(null);
    setView({ screen: 'list' });
  }

  if (!user) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1>🎫 Support Desk</h1>
        <nav>
          <button className={view.screen === 'list' ? 'active' : ''} onClick={() => setView({ screen: 'list' })}>
            Tickets
          </button>
          {user.role === 'admin' && (
            <button className={view.screen === 'admin' ? 'active' : ''} onClick={() => setView({ screen: 'admin' })}>
              Users
            </button>
          )}
        </nav>
        <div className="who">
          <span>
            {user.name} · <b>{user.role}</b>
          </span>
          <button className="ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main>
        {view.screen === 'list' && <TicketList user={user} onOpen={(ticketId) => setView({ screen: 'detail', ticketId })} />}
        {view.screen === 'detail' && (
          <TicketDetail user={user} ticketId={view.ticketId} onBack={() => setView({ screen: 'list' })} />
        )}
        {view.screen === 'admin' && <AdminPanel />}
      </main>
    </div>
  );
}
