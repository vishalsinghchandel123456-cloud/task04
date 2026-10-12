# BRL Task 4 — Real-Time Support Desk

A support-desk application where users create support tickets and talk to
support agents **in real time**. Built to demonstrate how authentication, RBAC,
REST APIs, MongoDB, WebSockets, validation and deployment work together.

> **Demo tip — two roles on one device:** the session is stored per browser tab
> (`sessionStorage`), so you can log in as a **user** in one tab and an
> **agent/admin** in another and watch messages and status changes appear live.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + Express.js |
| Real-time | Socket.IO (WebSockets) |
| Database | MongoDB + Mongoose |
| Auth | JWT (`jsonwebtoken`) + bcrypt password hashing |
| Frontend | React 18 + Vite |
| API docs | Postman collection (root of this repo) |

## Features

- Register / login with bcrypt-hashed passwords and JWT-protected routes
- Three roles — **user**, **agent**, **admin** — with RBAC enforced **in the backend**
- Tickets: create, view, edit, status transitions, assignment, close
- List endpoint with **pagination**, **filtering** (status/priority) and **search**
- Per-ticket conversation: REST history + real-time chat over WebSockets
- Typing indicators and **live ticket status updates** (no page refresh)
- Server-side authorization on every socket room join (knowing an id is not enough)
- Central validation and error handling with proper HTTP status codes
- Automated test suites for both REST and realtime behaviour

## Project structure

```
BRL_Task4/
├─ BRL_Task4.postman_collection.json   # API documentation
├─ backend/
│  ├─ server.js                        # Express + Socket.IO entry point
│  ├─ socket.js                        # WebSocket auth, rooms, events
│  ├─ db.js                            # MongoDB connection
│  ├─ middleware/
│  │   ├─ auth.js                      # protect (JWT) + authorize (RBAC) + ownership
│  │   └─ errorHandler.js              # wrap() + central error handler
│  ├─ models/                          # User, Ticket, Message
│  ├─ routes/                          # authRoutes, ticketRoutes, adminRoutes
│  ├─ scripts/                         # seed.js, api.test.js, realtime.test.js
│  └─ .env.example
└─ frontend/
   └─ src/
      ├─ api.js                        # fetch helper (adds JWT automatically)
      ├─ socket.js                     # Socket.IO client (sends JWT on handshake)
      ├─ App.jsx                       # role-aware navigation
      └─ components/                   # Auth, TicketList, TicketDetail, AdminPanel
```

## Setup (local)

**Prerequisites:** Node.js 18+, MongoDB running locally (or an Atlas URI).

### Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit values (set a strong JWT_SECRET)
npm run seed              # creates the 3 demo accounts below
npm run dev               # http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

### Demo accounts (password `Demo@123`)

| Email | Role |
|---|---|
| `user@support.test` | user — creates tickets, chats on own tickets |
| `agent@support.test` | agent — sees assigned tickets, changes status, replies |
| `admin@support.test` | admin — sees all tickets, assigns, manages users |

## How to test it

```bash
cd backend
npm test               # 41 REST checks: auth, RBAC, tickets, error codes
npm run test:realtime  # 13 WebSocket checks: join auth, live messages, typing,
                       # status broadcast, closed-ticket rejection
```

Both suites need the server running and `npm run seed` executed once.

Manual walkthrough (what the evaluator will do):

1. Log in as **user** → create a ticket → open it → type a message.
2. In a second tab log in as **admin** → assign the ticket to the agent →
   watch the status change appear in tab 1 **without refreshing**.
3. In a third tab log in as **agent** → open the assigned ticket → reply →
   the user sees it instantly; try typing to see the typing indicator.
4. Try forbidden things: a normal user calling `/api/admin/users` → **403**,
   opening someone else's ticket → **403**, sending to a closed ticket → **400**.

## REST API overview

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | create account (201 / 400 / 409) |
| POST | `/api/auth/login` | public | get JWT (200 / 400 / 401) |
| GET | `/api/auth/me` | any logged-in | current user (200 / 401) |
| POST | `/api/tickets` | user+ | create ticket (201 / 400) |
| GET | `/api/tickets` | any | role-scoped list, `?status=&priority=&search=&page=&limit=` |
| GET | `/api/tickets/:id` | owner / assigned agent / admin | ticket details (200 / 403 / 404) |
| PATCH | `/api/tickets/:id` | owner / admin | edit details (400 if closed) |
| PATCH | `/api/tickets/:id/status` | agent / admin | change status (400 invalid, 403 wrong role) |
| PATCH | `/api/tickets/:id/assign` | admin | assign agent (404 if not an agent) |
| PATCH | `/api/tickets/:id/close` | owner / assigned / admin | close ticket |
| GET | `/api/tickets/:id/messages` | ticket viewers | conversation history (paginated) |
| POST | `/api/tickets/:id/messages` | ticket viewers | send via REST (400 if closed) |
| GET | `/api/admin/users` | admin | list users, `?role=agent` |
| PATCH | `/api/admin/users/:id/role` | admin | change a user's role |
| GET | `/api/admin/stats` | admin | counts |
| GET | `/health` | public | deployment health check |

Status codes used: **200/201** success · **400** invalid input · **401** no/bad
token · **403** forbidden role/ownership · **404** missing ticket/user ·
**409** duplicate email · **500** unexpected.

## Real-time protocol (Socket.IO)

Connect with the JWT: `io(URL, { auth: { token } })` — an invalid or missing
token rejects the connection (`connect_error`).

**Client → server**

| Event | Payload | Notes |
|---|---|---|
| `join_ticket` | `ticketId`, ack callback | server re-checks permission, then joins room `ticket:<id>` |
| `leave_ticket` | `ticketId` | leaves the room |
| `send_message` | `{ ticketId, text }`, ack | validates, stores in MongoDB, broadcasts |
| `typing` | `{ ticketId, isTyping }` | relayed to everyone else in the room |

**Server → client**

| Event | Payload | When |
|---|---|---|
| `new_message` | `{ ticketId, message }` | message sent (socket **or** REST) |
| `typing` | `{ ticketId, name, isTyping }` | other participant is typing |
| `ticket_updated` | `{ ticketId, status, assignedTo, updatedBy }` | status/assign/close over REST |

## Deployment

1. **MongoDB Atlas** (free tier): create a cluster → Database Access: add a user →
   Network Access: allow `0.0.0.0/0` (or Render's IPs) → copy the SRV URI into `MONGO_URI`.
2. **Backend on Render**: New → Web Service → root directory `backend` →
   build `npm install` → start `npm start` → set env vars
   `MONGO_URI`, `JWT_SECRET` (long random string), `CLIENT_URL` (your frontend URL),
   `PORT` (Render sets this automatically).
   *WebSockets work out of the box on Render; the free tier sleeps, so the first
   request after idle takes ~30 s.*
3. **Frontend on Vercel/Netlify**: root directory `frontend`, build `npm run build`,
   output `dist`, env var `VITE_API_URL=https://your-backend.onrender.com`.
   Add the deployed frontend URL to `CLIENT_URL` on Render and redeploy so CORS allows it.
4. Verify: open two browser windows, log in as user and agent, and confirm live
   messaging on the deployed URLs (`/health` should return `{"status":"ok"}`).

**Never commit `.env`** — only `.env.example` is in the repo.

## Postman

Import `BRL_Task4.postman_collection.json` from the repository root.
Run **Login — success** first (it saves `{{authToken}}`), then **Create ticket**
(saves `{{ticketId}}`), and the *Admin Token* / *Agent Token* requests when you
need those roles. Every request documents its expected status codes.

## How to explain this project (viva guide)

| Requirement | Where it lives | One-line explanation |
|---|---|---|
| Password hashing | `routes/authRoutes.js` | bcrypt hashes before save, compares on login |
| JWT authentication | `middleware/auth.js` → `protect` | verifies `Authorization: Bearer …`, loads user from DB |
| Role-based access | `middleware/auth.js` → `authorize` | one-liner middleware applied per route, e.g. `authorize('admin')` |
| Ownership checks | `middleware/auth.js` → `canViewTicket` | user = creator, agent = assigned, admin = all |
| REST + pagination | `routes/ticketRoutes.js` | `skip/limit` + `countDocuments` in parallel, role-scoped filter |
| Validation & errors | `middleware/errorHandler.js` | one central handler maps Mongoose errors to status codes |
| WebSockets | `socket.js` | JWT on handshake → room per ticket → broadcast to that room only |
| Realtime + REST consistency | `emitTicketUpdate` / `emitNewMessage` | REST handlers push the same events as the socket handlers |
| Database design | `models/` | 3 schemas; indexes on `createdBy/assignedTo/status` for fast lists |

Three questions you will almost certainly be asked:

1. **"How do you know a user may open this ticket?"** — the same
   `canViewTicket` check runs on the REST route *and* on `join_ticket`, so the
   frontend is never trusted.
2. **"What happens if someone sends a forged JWT?"** — `jwt.verify` fails →
   connection/request rejected with 401 before any handler runs.
3. **"Why WebSockets instead of polling?"** — the server pushes instantly to a
   room of only the participants; no repeated empty requests, low latency.
#
