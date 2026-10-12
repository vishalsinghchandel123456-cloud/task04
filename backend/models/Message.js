// models/Message.js — one chat message inside a ticket conversation.
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: [true, 'Message text is required'], trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Load a conversation page in chronological order
messageSchema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
