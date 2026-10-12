// routes/authRoutes.js — register / login / current user (JWT authentication)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { wrap } = require('../middleware/errorHandler');

// Create a signed JWT (valid for 1 day)
function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

// The shape of a user we return to the client (password is never included)
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

// POST /api/auth/register — open to everyone, creates a normal "user" account
router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email is already registered' });

    const hashed = await bcrypt.hash(String(password), 10); // password hashing
    const user = await User.create({ name, email, password: hashed }); // role defaults to "user"
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

// POST /api/auth/login — returns a JWT for protected routes and sockets
router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
    // Same message for both cases so we do not reveal which one was wrong
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// GET /api/auth/me — protected route example: returns the logged-in user
router.get('/me', protect, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
