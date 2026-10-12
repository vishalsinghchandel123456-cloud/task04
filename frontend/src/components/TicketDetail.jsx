// src/components/TicketDetail.jsx — opens one ticket: info, status controls,
// assignment (admin) and the real-time conversation over Socket.IO.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { connectSocket } from '../socket';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function TicketDetail({ user, ticketId, onBack }) {
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [agents, setAgents] = useState([]);
  const [typingName, setTypingName] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const typingTimer = useRef(null);

  // --- load ticket + conversation ---
  useEffect(() => {
    Promise.all([api(`/api/tickets/${ticketId}`), api(`/api/tickets/${ticketId}/messages`)])
      .then(([t, m]) => {
        setTicket(t.ticket);
        setMessages(m.results);
      })
      .catch((err) => setError(err.message));
  }, [ticketId]);

  // --- admins also load the agent list for the assign dropdown ---
  useEffect(() => {
    if (user.role !== 'admin') return;
    api('/api/admin/users?role=agent')
      .then((d) => setAgents(d.results))
      .catch(() => {});
  }, [user.role]);

  // --- socket: connect once, join the ticket room, listen for live events ---
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit('join_ticket', ticketId, (res) => {
      if (res && !res.ok) setError(res.error);
    });

    socket.on('new_message', (payload) => {
      if (payload.ticketId === ticketId) setMessages((prev) => [...prev, payload.message]);
    });

    socket.on('typing', (payload) => {
      if (payload.ticketId !== ticketId) return;
      setTypingName(payload.isTyping ? payload.name : '');
    });

    socket.on('ticket_updated', (payload) => {
      if (payload.ticketId !== ticketId) return;
      setTicket((prev) => (prev ? { ...prev, status: payload.status, assignedTo: payload.assignedTo } : prev));
    });

    // cleanup when leaving the conversation
    return () => {
      socket.emit('leave_ticket', ticketId);
      socket.close();
      clearTimeout(typingTimer.current);
    };
  }, [ticketId]);

  function sendMessage(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    socketRef.current.emit('send_message', { ticketId, text: value }, (res) => {
      if (!res.ok) setError(res.error); // e.g. "closed ticket"
    });
    setText('');
    socketRef.current.emit('typing', { ticketId, isTyping: false });
  }

  function onType(e) {
    setText(e.target.value);
    socketRef.current.emit('typing', { ticketId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current.emit('typing', { ticketId, isTyping: false }), 1200);
  }

  async function updateStatus(status) {
    setError('');
    try {
      const { ticket: updated } = await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', body: { status } });
      setTicket(updated); // the socket event also broadcasts it to everyone else
    } catch (err) {
      setError(err.message);
    }
  }

  async function assign(agentId) {
    setError('');
    try {
      const { ticket: updated } = await api(`/api/tickets/${ticketId}/assign`, { method: 'PATCH', body: { agentId } });
      setTicket(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function closeTicket() {
    setError('');
    try {
      const { ticket: updated } = await api(`/api/tickets/${ticketId}/close`, { method: 'PATCH' });
      setTicket(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!ticket) return <div className="card muted">{error || 'Loading…'}</div>;

  const isOwner = ticket.createdBy?._id === user.id;
  const isAssigned = ticket.assignedTo?._id === user.id;
  const canManageStatus = user.role === 'admin' || (user.role === 'agent' && isAssigned);
  const canClose = isOwner || isAssigned || user.role === 'admin';

  return (
    <div className="detail">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <div className="card">
        <div className="ticket-top">
          <h2>{ticket.title}</h2>
          <span className={`badge status-${ticket.status}`}>{ticket.status}</span>
        </div>
        <p>{ticket.description}</p>
        <div className="ticket-meta">
          <span className={`badge priority-${ticket.priority}`}>{ticket.priority}</span>
          <span>Category: {ticket.category}</span>
          <span>By: {ticket.createdBy?.name}</span>
          <span>Assigned: {ticket.assignedTo ? ticket.assignedTo.name : '—'}</span>
        </div>

        {(canManageStatus || user.role === 'admin' || canClose) && (
          <div className="row controls">
            {canManageStatus && (
              <label>
                Status
                <select value={ticket.status} onChange={(e) => updateStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
            {user.role === 'admin' && (
              <label>
                Assign to
                <select
                  value={ticket.assignedTo?._id || ''}
                  onChange={(e) => e.target.value && assign(e.target.value)}
                >
                  <option value="">— unassigned —</option>
                  {agents.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canClose && ticket.status !== 'CLOSED' && (
              <button className="ghost" onClick={closeTicket}>
                Close ticket
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card chat">
        <h3>Conversation</h3>
        <div className="messages">
          {messages.length === 0 && <div className="muted">No messages yet — say hello 👋</div>}
          {messages.map((m) => {
            const mine = m.sender?._id === user.id;
            return (
              <div key={m._id} className={`msg ${mine ? 'mine' : ''}`}>
                <div className="msg-head">
                  <b>{m.sender?.name}</b> <span className="muted">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
                <div>{m.text}</div>
              </div>
            );
          })}
        </div>

        <div className="typing">{typingName ? `${typingName} is typing…` : ''}</div>

        {ticket.status === 'CLOSED' ? (
          <div className="muted">This ticket is closed — no new messages.</div>
        ) : (
          <form className="chat-input" onSubmit={sendMessage}>
            <input value={text} onChange={onType} placeholder="Type a message…" />
            <button className="primary">Send</button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
