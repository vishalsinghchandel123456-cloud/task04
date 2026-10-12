// scripts/seed.js — creates the three demo accounts used for testing.
// Run: npm run seed   (safe to run more than once)
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const PASSWORD = 'Demo@123';
const accounts = [
  { name: 'Alice Admin', email: 'admin@support.test', role: 'admin' },
  { name: 'Adam Agent', email: 'agent@support.test', role: 'agent' },
  { name: 'Uma User', email: 'user@support.test', role: 'user' },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/support_desk');
    const hashed = await bcrypt.hash(PASSWORD, 10);
    for (const a of accounts) {
      await User.updateOne({ email: a.email }, { $set: { ...a, password: hashed } }, { upsert: true });
      console.log(`✔ ${a.role.padEnd(5)} ${a.email}`);
    }
    console.log(`All demo accounts use the password: ${PASSWORD}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
