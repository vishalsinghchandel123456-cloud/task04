// routes/ticketRoutes.js — everything about tickets:
// create, list (pagination + filter + search), view, edit, status, assign, close,
// plus the conversation (messages) for each ticket.
const router = require('express').Router();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect, authorize, canViewTicket } = require('../middleware/auth');
const { wrap } = require('../middleware/errorHandler');
const { emitNewMessage, emitTicketUpdate } = require('../socket');

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

// Every route in this file requires a logged-in user
router.use(protect);

// ---------- small helpers ----------
async function findTicket(id) {
  if (!mongoose.isValidObjectId(id)) return null; // malformed id → treated as "not found"
  return Ticket.findById(id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');
}

// Loads the ticket and runs the ownership check. Returns null after sending 403/404.
async function loadTicketIfAllowed(req, res) {
  const ticket = await findTicket(req.params.id);
  if (!ticket) {
    res.status(404).json({ message: 'Ticket not found' });
    return null;
  }
  if (!canViewTicket(ticket, req.user)) {
    res.status(403).json({ message: 'You are not allowed to view this ticket' });
    return null;
  }
  return ticket;
}

const isOwner = (ticket, user) => String(ticket.createdBy._id || ticket.createdBy) === String(user._id);
const isAssigned = (ticket, user) =>
  !!ticket.assignedTo && String(ticket.assignedTo._id || ticket.assignedTo) === String(user._id);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Push the change to everyone watching the ticket (REST changes are realtime too)
function broadcastUpdate(ticket, user) {
  emitTicketUpdate(ticket._id, {
    status: ticket.status,
    assignedTo: ticket.assignedTo,
    updatedBy: user.name,
  });
}

// ---------- CREATE: any logged-in user creates their own ticket ----------
router.post(
  '/',
  wrap(async (req, res) => {
    const { title, description, category, priority } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'title and description are required' });
    }
    if (priority && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority. Use LOW, MEDIUM or HIGH' });
    }
    const ticket = await Ticket.create({
      title,
      description,
      category: category || 'General',
      priority: priority || 'MEDIUM',
      createdBy: req.user._id,
    });
    res.status(201).json({ ticket });
  })
);

// ---------- LIST: role scoped + filtering + search + pagination ----------
router.get(
  '/',
  wrap(async (req, res) => {
    const { status, priority, search, page, limit } = req.query;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter. Use ' + STATUSES.join(', ') });
    }
    if (priority && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority filter. Use ' + PRIORITIES.join(', ') });
    }

    const filter = {};
    if (req.user.role === 'user') filter.createdBy = req.user._id; // only my tickets
    else if (req.user.role === 'agent') filter.assignedTo = req.user._id; // only tickets assigned to me
    // admin: no restriction → sees all tickets

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ title: rx }, { description: rx }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    const [tickets, totalItems] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('createdBy', 'name email role')
        .populate('assignedTo', 'name email role'),
      Ticket.countDocuments(filter),
    ]);

    res.json({
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(Math.ceil(totalItems / limitNum), 1),
      totalItems,
      results: tickets,
    });
  })
);

// ---------- VIEW ONE (owner / assigned agent / admin) ----------
router.get(
  '/:id',
  wrap(async (req, res) => {
    const ticket = await loadTicketIfAllowed(req, res);
    if (!ticket) return;
    res.json({ ticket });
  })
);

// ---------- EDIT ticket details (owner only, not after closing) ----------
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const ticket = await loadTicketIfAllowed(req, res);
    if (!ticket) return;
    if (!isOwner(ticket, req.user) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only the ticket creator can edit this ticket' });
    }
    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ message: 'Closed tickets cannot be edited' });
    }

    const { title, description, category, priority } = req.body;
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority. Use LOW, MEDIUM or HIGH' });
    }
    if (title !== undefined) ticket.title = title;
    if (description !== undefined) ticket.description = description;
    if (category !== undefined) ticket.category = category;
    if (priority !== undefined) ticket.priority = priority;
    if (!ticket.title || !ticket.description) {
      return res.status(400).json({ message: 'title and description cannot be empty' });
    }

    await ticket.save();
    res.json({ ticket });
  })
);

// ---------- UPDATE STATUS (agent / admin; agents only on assigned tickets) ----------
router.patch(
  '/:id/status',
  authorize('agent', 'admin'),
  wrap(async (req, res) => {
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid ticket status. Use ' + STATUSES.join(', ') });
    }
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (req.user.role === 'agent' && !isAssigned(ticket, req.user)) {
      return res.status(403).json({ message: 'You can only update tickets assigned to you' });
    }

    ticket.status = status;
    await ticket.save();
    broadcastUpdate(ticket, req.user);
    res.json({ ticket });
  })
);

// ---------- ASSIGN to a support agent (admin only) ----------
router.patch(
  '/:id/assign',
  authorize('admin'),
  wrap(async (req, res) => {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ message: 'agentId is required' });
    if (!mongoose.isValidObjectId(agentId)) return res.status(400).json({ message: 'Invalid agentId' });
    const agent = await User.findOne({ _id: agentId, role: 'agent' });
    if (!agent) return res.status(404).json({ message: 'Support agent not found' });

    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.assignedTo = agent._id;
    if (ticket.status === 'OPEN') ticket.status = 'IN_PROGRESS'; // someone is now working on it
    await ticket.save();
    broadcastUpdate(ticket, req.user);
    res.json({ ticket });
  })
);

// ---------- CLOSE (owner, assigned agent or admin) ----------
router.patch(
  '/:id/close',
  wrap(async (req, res) => {
    const ticket = await findTicket(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    const allowed = isOwner(ticket, req.user) || isAssigned(ticket, req.user) || req.user.role === 'admin';
    if (!allowed) {
      return res.status(403).json({ message: 'Only the creator, the assigned agent or an admin can close this ticket' });
    }

    ticket.status = 'CLOSED';
    await ticket.save();
    broadcastUpdate(ticket, req.user);
    res.json({ ticket });
  })
);

// ---------- MESSAGES: read the conversation (paginated, newest page first) ----------
router.get(
  '/:id/messages',
  wrap(async (req, res) => {
    const ticket = await loadTicketIfAllowed(req, res);
    if (!ticket) return;

    const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    const [messages, totalItems] = await Promise.all([
      Message.find({ ticket: ticket._id })
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('sender', 'name email role'),
      Message.countDocuments({ ticket: ticket._id }),
    ]);

    res.json({
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(Math.ceil(totalItems / limitNum), 1),
      totalItems,
      results: messages.reverse(), // return in chronological order
    });
  })
);

// ---------- MESSAGES: send over REST (same rules as the socket) ----------
router.post(
  '/:id/messages',
  wrap(async (req, res) => {
    const ticket = await loadTicketIfAllowed(req, res);
    if (!ticket) return;
    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ message: 'Cannot send messages on a closed ticket' });
    }
    const text = req.body.text ? String(req.body.text).trim() : '';
    if (!text) return res.status(400).json({ message: 'text is required' });

    const message = await Message.create({ ticket: ticket._id, sender: req.user._id, text });
    await message.populate('sender', 'name email role');
    emitNewMessage(ticket._id, message); // everyone in the ticket room sees it live
    res.status(201).json({ message });
  })
);

module.exports = router;
