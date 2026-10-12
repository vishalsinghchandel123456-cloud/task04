// models/User.js — every account in the system (user / agent / admin).
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // one account per email
      lowercase: true,
      trim: true,
    },
    // select:false keeps the hash out of query results unless we ask for it
    password: { type: String, required: [true, 'Password is required'], select: false },
    role: { type: String, enum: ['user', 'agent', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
