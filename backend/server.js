// server.js — entry point: the REST API and Socket.IO share one HTTP server.
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const { errorHandler } = require('./middleware/errorHandler');
const { initSocket } = require('./socket');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());

app.use(cors({ origin: CLIENT_URLS })); // only the frontend may call this API
app.use(express.json()); // parse JSON request bodies

// Health check (used by Render and by the Postman collection)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes); // tickets + messages
app.use('/api/admin', adminRoutes);

// Unknown route → JSON 404
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Central error handler (must come after the routes)
app.use(errorHandler);

// One server for both HTTP (REST) and WebSockets (Socket.IO)
const server = http.createServer(app);
initSocket(server);

// Number(...) so a stray/empty PORT falls back to 5000 (a real deployment PORT still wins)
const PORT = Number(process.env.PORT) || 5000;
connectDB()
  .then(() => server.listen(PORT, () => console.log(`Support Desk running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
