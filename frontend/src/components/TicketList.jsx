// src/components/TicketList.jsx — lists tickets (server scopes them by role),
// with filters, search, pagination and a "new ticket" form.
import { useEffect, useState } from 'react';
import { api } from '../api';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

export default function TicketList({ user, onOpen }) {
  const [data, setData] = useState({ results: [], page: 1, totalPages: 1, totalItems: 0 });
  const [filters, setFilters] = useState({ status: '', priority: '', search: '', page: 1 });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'General', priority: 'MEDIUM' });
  const [creating, setCreating] = useState(false);

  // Load tickets whenever a filter/page changes
  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.priority) qs.set('priority', filters.priority);
    if (filters.search) qs.set('search', filters.search);
    qs.set('page', filters.page);
    qs.set('limit', 10);
    api(`/api/tickets?${qs}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  async function createTicket(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const { ticket } = await api('/api/tickets', { method: 'POST', body: form });
      setShowForm(false);
      setForm({ title: '', description: '', category: 'General', priority: 'MEDIUM' });
      onOpen(ticket._id); // jump straight into the conversation
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="list-page">
      <div className="toolbar">
        <div className="filters">
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value, page: 1 })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input
            placeholder="Search title or description…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          />
        </div>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          + New ticket
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={createTicket}>
          <h3>Create a ticket</h3>
          <label>
            Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </label>
          <div className="row">
            <label>
              Category
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <button className="primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create ticket'}
            </button>
            <button type="button" className="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="muted">
        {data.totalItems} ticket{data.totalItems === 1 ? '' : 's'}
        {user.role === 'user' && ' (yours)'}
        {user.role === 'agent' && ' (assigned to you)'}
      </div>

      <div className="ticket-list">
        {data.results.length === 0 && <div className="card muted">No tickets found.</div>}
        {data.results.map((t) => (
          <button key={t._id} className="card ticket" onClick={() => onOpen(t._id)}>
            <div className="ticket-top">
              <b>{t.title}</b>
              <span className={`badge status-${t.status}`}>{t.status}</span>
            </div>
            <div className="ticket-meta">
              <span className={`badge priority-${t.priority}`}>{t.priority}</span>
              <span>{t.category}</span>
              <span>by {t.createdBy?.name}</span>
              {t.assignedTo && <span>→ {t.assignedTo.name}</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="pager">
        <button className="ghost" disabled={data.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
          ← Prev
        </button>
        <span>
          Page {data.page} of {data.totalPages}
        </span>
        <button
          className="ghost"
          disabled={data.page >= data.totalPages}
          onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
