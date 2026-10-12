// db.js — connects to MongoDB with Mongoose.
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/support_desk';
  await mongoose.connect(uri);
  console.log('MongoDB connected:', mongoose.connection.name);
}

module.exports = connectDB;
