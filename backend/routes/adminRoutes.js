// routes/adminRoutes.js — admin-only APIs: manage users/agents and stats.
const router = require('express').Router();
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const { protect, authorize } = require('../middleware/auth');
const { wrap } = require('../middleware/errorHandler');

// Every route here requires the admin role (authentication + RBAC together)
router.use(protect, authorize('admin'));

const ROLES = ['user', 'agent', 'admin'];
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/users?role=agent&search=ali — also used for the assignment dropdown
router.get(
  '/users',
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.role) {
      if (!ROLES.includes(req.query.role)) {
        return res.status(400).json({ message: 'Invalid role filter. Use ' + ROLES.join(', ') });
      }
      filter.role = req.query.role;
    }
    if (req.query.search) {
      const rx = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const users = await User.find(filter).sort({ name: 1 });
    res.json({ results: users });
  })
);

// PATCH /api/admin/users/:id/role — promote a user to agent (or demote an agent)
router.patch(
  '/users/:id/role',
  wrap(async (req, res) => {
    const { role } = req.body;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Use ' + ROLES.join(', ') });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }

    user.role = role;
    await user.save();
    res.json({ user });
  })
);

// GET /api/admin/stats — tiny dashboard (nice for the demo)
router.get(
  '/stats',
  wrap(async (req, res) => {
    const [users, tickets, openTickets] = await Promise.all([
      User.countDocuments(),
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'OPEN' }),
    ]);
    res.json({ users, tickets, openTickets });
  })
);

module.exports = router;
