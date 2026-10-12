// scripts/realtime.test.js — automated end-to-end test of the real-time features.
// Prerequisites: server running (`npm run dev`) and demo accounts created (`npm run seed`).
// Run: npm run test:realtime
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const DEMO = { email: 'admin@support.test', password: 'Demo@123' }; // admin may open any ticket
const DEMO_USER = { email: 'user@support.test', password: 'Demo@123' };

let passed = 0;
let failed = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? '✔' : '✘'} ${name}`);
  cond ? passed++ : failed++;
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const connect = (token) => io(BASE, { auth: { token }, transports: ['websocket'] });

const waitFor = (socket, event, ms = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const ack = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

async function main() {
  // 1) Login with the seeded demo accounts
  const adminLogin = await api('/api/auth/login', { method: 'POST', body: DEMO });
  if (adminLogin.status !== 200) {
    console.error('Cannot log in. Is the server running and "npm run seed" executed?');
    process.exit(1);
  }
  const userLogin = await api('/api/auth/login', { method: 'POST', body: DEMO_USER });
  const adminToken = adminLogin.data.token;
  const userToken = userLogin.data.token;
  check('login as seeded admin and user', !!adminToken && !!userToken);

  // 2) The user creates a ticket over REST
  const created = await api('/api/tickets', {
    method: 'POST',
    token: userToken,
    body: { title: 'Realtime test ticket', description: 'Created by the automated test', priority: 'HIGH' },
  });
  check('user creates a ticket (201)', created.status === 201);
  const ticketId = created.data.ticket._id;

  // 3) Connect two sockets: the user and an admin
  const userSocket = connect(userToken);
  const adminSocket = connect(adminToken);
  await Promise.all([waitFor(userSocket, 'connect'), waitFor(adminSocket, 'connect')]);
  check('both sockets connect with a valid JWT', true);

  // 4) A socket with a bad token must be rejected
  const badSocket = io(BASE, { auth: { token: 'not-a-real-token' }, transports: ['websocket'] });
  const rejected = await new Promise((resolve) => {
    badSocket.on('connect_error', () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  check('socket with invalid token is rejected', rejected);

  // 5) Join the ticket room (authorization check happens server-side)
  const joinUser = await ack(userSocket, 'join_ticket', ticketId);
  const joinAdmin = await ack(adminSocket, 'join_ticket', ticketId);
  check('user joins own ticket room', joinUser.ok === true);
  check('admin joins any ticket room', joinAdmin.ok === true);

  // 6) Real-time message: sent by the user, received by the admin
  const adminReceives = waitFor(adminSocket, 'new_message');
  const senderAck = await ack(userSocket, 'send_message', { ticketId, text: 'Hello from the user!' });
  const received = await adminReceives;
  check('message send acknowledged', senderAck.ok === true);
  check('admin receives the message live', received.message.text === 'Hello from the user!');

  // 7) Typing indicator relayed to the other participant
  const typingSeen = waitFor(adminSocket, 'typing');
  userSocket.emit('typing', { ticketId, isTyping: true });
  const typing = await typingSeen;
  check('admin receives typing indicator', typing.isTyping === true && typing.name === 'Uma User');

  // 8) REST status change is pushed to the room as a ticket_updated event
  const statusSeen = waitFor(userSocket, 'ticket_updated');
  const statusRes = await api(`/api/tickets/${ticketId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'IN_PROGRESS' },
  });
  const update = await statusSeen;
  check('status update via REST succeeds', statusRes.status === 200);
  check('user receives ticket_updated live', update.status === 'IN_PROGRESS');

  // 9) Sending to a closed ticket must fail with 400
  await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', token: adminToken, body: { status: 'CLOSED' } });
  const closedAck = await ack(userSocket, 'send_message', { ticketId, text: 'too late' });
  check('message on closed ticket is rejected', closedAck.ok === false);

  // 10) RBAC: a plain user cannot hit admin-only endpoints
  const forbidden = await api('/api/admin/users', { token: userToken });
  check('admin endpoint returns 403 for a normal user', forbidden.status === 403);

  userSocket.close();
  adminSocket.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Test crashed:', err.message);
  process.exit(1);
});
