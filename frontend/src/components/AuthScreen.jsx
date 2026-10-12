// src/components/AuthScreen.jsx — login and register forms.
import { useState } from 'react';
import { api } from '../api';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const data = await api(path, { method: 'POST', body });
      onAuth(data); // save token + user and enter the app
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth" onSubmit={submit}>
        <h1>🎫 Support Desk</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</p>

        {mode === 'register' && (
          <label>
            Name
            <input value={form.name} onChange={set('name')} placeholder="Your name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
        </button>

        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>

        <div className="demo-box">
          <b>Demo accounts</b> (password <code>Demo@123</code>):
          <div>user@support.test · agent@support.test · admin@support.test</div>
        </div>
      </form>
    </div>
  );
}
