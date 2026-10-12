// socket.js — Socket.IO: the real-time layer of the Support Desk.
// Flow: 1) authenticate the socket with the same JWT as the REST API
//       2) join a "ticket room" only after an authorization check
//       3) messages / typing / status changes are broadcast to that room
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const Ticket = require('./models/Ticket');
const User = require('./models/User');
const { canViewTicket } = require('./middleware/auth');

let io = null;

const roomOf = (ticketId) => `ticket:${ticketId}`;

async function initSocket(httpServer) {
  const allowed = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
  io = new Server(httpServer, { cors: { origin: allowed } });

  // --- Step 1: no valid JWT, no socket connection ---
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.id;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = await User.findById(socket.userId);
    if (!user) return socket.disconnect(true);
    socket.user = user;

    // --- Step 2: joining a ticket = same permission check as the REST API ---
    socket.on('join_ticket', async (ticketId, ack) => {
      try {
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return ack && ack({ ok: false, error: 'Ticket not found' });
        if (!canViewTicket(ticket, user)) {
          return ack && ack({ ok: false, error: 'You are not allowed to view this ticket' });
        }
        socket.join(roomOf(ticketId));
        ack && ack({ ok: true });
      } catch (err) {
        ack && ack({ ok: false, error: 'Server error' });
      }
    });

    socket.on('leave_ticket', (ticketId) => socket.leave(roomOf(ticketId)));

    // --- Step 3: a chat message: validate → store in MongoDB → broadcast ---
    socket.on('send_message', async (payload, ack) => {
      const ticketId = payload && payload.ticketId;
      const text = payload && payload.text ? String(payload.text).trim() : '';
      try {
        if (!text) return ack && ack({ ok: false, error: 'Message text is required' });
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return ack && ack({ ok: false, error: 'Ticket not found' });
        if (!canViewTicket(ticket, user)) {
          return ack && ack({ ok: false, error: 'You are not allowed to view this ticket' });
        }
        if (ticket.status === 'CLOSED') {
          return ack && ack({ ok: false, error: 'Cannot send messages on a closed ticket' });
        }
        const message = await Message.create({ ticket: ticket._id, sender: user._id, text });
        await message.populate('sender', 'name email role');
        io.to(roomOf(ticketId)).emit('new_message', { ticketId: String(ticketId), message });
        ack && ack({ ok: true, message });
      } catch (err) {
        ack && ack({ ok: false, error: err.message || 'Server error' });
      }
    });

    // --- Step 4: typing indicator: relay to everyone else in the room ---
    socket.on('typing', (payload) => {
      const ticketId = payload && payload.ticketId;
      if (!ticketId) return;
      socket
        .to(roomOf(ticketId))
        .emit('typing', { ticketId: String(ticketId), name: user.name, isTyping: !!(payload && payload.isTyping) });
    });
  });

  return io;
}

function getIO() {
  return io;
}

// Helpers used by the REST routes so HTTP updates are pushed in real time too
function emitNewMessage(ticketId, message) {
  if (io) io.to(roomOf(ticketId)).emit('new_message', { ticketId: String(ticketId), message });
}

function emitTicketUpdate(ticketId, data) {
  if (io) io.to(roomOf(ticketId)).emit('ticket_updated', { ticketId: String(ticketId), ...data });
}

module.exports = { initSocket, getIO, emitNewMessage, emitTicketUpdate };
