 
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ---------- 1) Authentication: every protected route runs this first ----------
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authenticated. Please log in.' });
    }
    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    // The role is read from the database (not from the token) so it is always current.
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ---------- 2) Authorization: role check, e.g. authorize('admin') ----------
const authorize =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: `Access denied. Allowed roles: ${roles.join(', ')}` });

// ---------- 3) Ownership: who may open this ticket? ----------
function canViewTicket(ticket, user) {
  if (user.role === 'admin') return true; // admin sees everything
  if (user.role === 'agent') {
    const assigned = ticket.assignedTo ? String(ticket.assignedTo._id || ticket.assignedTo) : null;
    return assigned === String(user._id); // agent sees only assigned tickets
  }
  return String(ticket.createdBy._id || ticket.createdBy) === String(user._id); // user sees own
}

module.exports = { protect, authorize, canViewTicket };
