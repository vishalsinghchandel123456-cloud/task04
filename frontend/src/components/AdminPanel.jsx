// src/components/AdminPanel.jsx — admin only: list users and change their roles.
import { useEffect, useState } from 'react';
import { api, getUser } from '../api';

const ROLES = ['user', 'agent', 'admin'];

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const me = getUser();

  function load() {
    api('/api/admin/users')
      .then((data) => setUsers(data.results))
      .catch((err) => setError(err.message));
  }
  useEffect(load, []);

  async function changeRole(id, role) {
    setError('');
    try {
      await api(`/api/admin/users/${id}/role`, { method: 'PATCH', body: { role } });
      load(); // refresh the list
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2>Users & agents</h2>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u._id === me.id} onChange={(e) => changeRole(u._id, e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  {u._id === me.id && <span className="muted"> (you)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
