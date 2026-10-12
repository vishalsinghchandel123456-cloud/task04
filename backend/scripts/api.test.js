// scripts/api.test.js — end-to-end REST tests: auth, RBAC, tickets, error codes.
// Prerequisites: server running (`npm run dev`) and demo accounts created (`npm run seed`).
// Run: npm test
const DEMO = { email: 'admin@support.test', password: 'Demo@123' };
const AGENT = { email: 'agent@support.test', password: 'Demo@123' };
const USER = { email: 'user@support.test', password: 'Demo@123' };
const BASE = process.env.BASE_URL || 'http://localhost:5000';

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

async function main() {
  // ---------- 1. Authentication ----------
  const uniqueEmail = `test-${Date.now()}@example.com`;
  const reg = await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email: uniqueEmail, password: 'secret123' } });
  check('register returns 201 + token', reg.status === 201 && !!reg.data.token);

  const regAgain = await api('/api/auth/register', { method: 'POST', body: { name: 'Test User', email: uniqueEmail, password: 'secret123' } });
  check('duplicate email returns 409', regAgain.status === 409);

  const regInvalid = await api('/api/auth/register', { method: 'POST', body: { name: '', email: uniqueEmail, password: '123' } });
  check('invalid register returns 400', regInvalid.status === 400);

  const badLogin = await api('/api/auth/login', { method: 'POST', body: { email: uniqueEmail, password: 'wrong' } });
  check('wrong password returns 401', badLogin.status === 401);

  const adminLogin = await api('/api/auth/login', { method: 'POST', body: DEMO });
  const agentLogin = await api('/api/auth/login', { method: 'POST', body: AGENT });
  const userLogin = await api('/api/auth/login', { method: 'POST', body: USER });
  const newLogin = await api('/api/auth/login', { method: 'POST', body: { email: uniqueEmail, password: 'secret123' } });
  const adminToken = adminLogin.data.token;
  const agentToken = agentLogin.data.token;
  const userToken = userLogin.data.token;
  const newUserToken = newLogin.data.token;
  check('demo accounts log in', !!adminToken && !!agentToken && !!userToken);

  const noAuth = await api('/api/auth/me');
  check('protected route without token returns 401', noAuth.status === 401);

  const badAuth = await api('/api/auth/me', { token: 'garbage.token.here' });
  check('invalid token returns 401', badAuth.status === 401);

  const me = await api('/api/auth/me', { token: newUserToken });
  check('GET /me returns current user', me.status === 200 && me.data.user.email === uniqueEmail);

  // ---------- 2. Ticket creation + validation ----------
  const noFields = await api('/api/tickets', { method: 'POST', token: newUserToken, body: {} });
  check('create without title/description returns 400', noFields.status === 400);

  const badPriority = await api('/api/tickets', { method: 'POST', token: newUserToken, body: { title: 'x', description: 'y', priority: 'URGENT' } });
  check('invalid priority returns 400', badPriority.status === 400);

  const created = await api('/api/tickets', { method: 'POST', token: newUserToken, body: { title: 'Login is broken', description: 'I cannot sign in to my account', category: 'Account', priority: 'HIGH' } });
  check('create ticket returns 201 with status OPEN', created.status === 201 && created.data.ticket.status === 'OPEN');
  const ticketId = created.data.ticket._id;

  // ---------- 3. Viewing + RBAC on tickets ----------
  const ownView = await api(`/api/tickets/${ticketId}`, { token: newUserToken });
  check('creator can view own ticket', ownView.status === 200);

  const foreignView = await api(`/api/tickets/${ticketId}`, { token: userToken }); // seeded user ≠ ticket owner
  check('another user cannot view the ticket (403)', foreignView.status === 403);

  const missingView = await api('/api/tickets/64b000000000000000000000', { token: adminToken });
  check('non-existent ticket returns 404', missingView.status === 404);

  const malformedView = await api('/api/tickets/not-an-id', { token: adminToken });
  check('malformed id returns 404', malformedView.status === 404);

  const noTokenView = await api(`/api/tickets/${ticketId}`);
  check('ticket without token returns 401', noTokenView.status === 401);

  // ---------- 4. Listing: pagination + filters + scoping ----------
  const list = await api('/api/tickets?page=1&limit=5', { token: newUserToken });
  check('list returns page metadata', list.status === 200 && typeof list.data.totalItems === 'number' && list.data.page === 1);
  check('user only sees own tickets', list.data.results.every((t) => t.createdBy._id === newLogin.data.user.id));

  const filtered = await api('/api/tickets?status=OPEN', { token: newUserToken });
  check('status filter works', filtered.status === 200 && filtered.data.results.every((t) => t.status === 'OPEN'));

  const searched = await api('/api/tickets?search=Login', { token: newUserToken });
  check('search filter works', searched.status === 200 && searched.data.results.length >= 1);

  const badFilter = await api('/api/tickets?status=WHATEVER', { token: newUserToken });
  check('invalid status filter returns 400', badFilter.status === 400);

  const adminList = await api('/api/tickets?limit=100', { token: adminToken });
  const userList = await api('/api/tickets?limit=100', { token: userToken });
  check('admin sees more tickets than a single user', adminList.data.totalItems >= userList.data.totalItems);

  // ---------- 5. Admin: assign + agent restrictions ----------
  const assignAsUser = await api(`/api/tickets/${ticketId}/assign`, { method: 'PATCH', token: newUserToken, body: { agentId: 'x' } });
  check('non-admin assign returns 403', assignAsUser.status === 403);

  const agents = await api('/api/admin/users?role=agent', { token: adminToken });
  const agentId = agents.data.results[0]?._id;
  check('admin lists agents', agents.status === 200 && !!agentId);

  const badAssign = await api(`/api/tickets/${ticketId}/assign`, { method: 'PATCH', token: adminToken, body: { agentId: newLogin.data.user.id } });
  check('assigning a non-agent returns 404', badAssign.status === 404);

  const assign = await api(`/api/tickets/${ticketId}/assign`, { method: 'PATCH', token: adminToken, body: { agentId } });
  check('admin assigns ticket → IN_PROGRESS', assign.status === 200 && assign.data.ticket.status === 'IN_PROGRESS' && !!assign.data.ticket.assignedTo);

  const statusAsUser = await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', token: newUserToken, body: { status: 'RESOLVED' } });
  check('normal user cannot change status (403)', statusAsUser.status === 403);

  const statusBadValue = await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', token: agentToken, body: { status: 'DONE' } });
  check('invalid status value returns 400', statusBadValue.status === 400);

  const statusAsAgent = await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', token: agentToken, body: { status: 'RESOLVED' } });
  check('assigned agent changes status', statusAsAgent.status === 200 && statusAsAgent.data.ticket.status === 'RESOLVED');

  // ---------- 6. Messages ----------
  const msg = await api(`/api/tickets/${ticketId}/messages`, { method: 'POST', token: agentToken, body: { text: 'agent reply' } });
  check('assigned agent sends a message (201)', msg.status === 201);

  const msgs = await api(`/api/tickets/${ticketId}/messages`, { token: newUserToken });
  check('creator reads the conversation', msgs.status === 200 && msgs.data.results.length >= 1);

  const emptyMsg = await api(`/api/tickets/${ticketId}/messages`, { method: 'POST', token: newUserToken, body: { text: '   ' } });
  check('empty message returns 400', emptyMsg.status === 400);

  // ---------- 7. Closing + closed-ticket rules ----------
  const close = await api(`/api/tickets/${ticketId}/close`, { method: 'PATCH', token: newUserToken });
  check('creator closes own ticket', close.status === 200 && close.data.ticket.status === 'CLOSED');

  const editClosed = await api(`/api/tickets/${ticketId}`, { method: 'PATCH', token: newUserToken, body: { title: 'changed' } });
  check('editing a closed ticket returns 400', editClosed.status === 400);

  const msgClosed = await api(`/api/tickets/${ticketId}/messages`, { method: 'POST', token: newUserToken, body: { text: 'too late' } });
  check('messaging a closed ticket returns 400', msgClosed.status === 400);

  // ---------- 8. Admin management ----------
  const adminAsUser = await api('/api/admin/users', { token: newUserToken });
  check('admin endpoint returns 403 for normal user', adminAsUser.status === 403);

  const badRole = await api(`/api/admin/users/${agentId}/role`, { method: 'PATCH', token: adminToken, body: { role: 'superuser' } });
  check('invalid role returns 400', badRole.status === 400);

  const selfRole = await api(`/api/admin/users/${adminLogin.data.user.id}/role`, { method: 'PATCH', token: adminToken, body: { role: 'user' } });
  check('changing own role returns 400', selfRole.status === 400);

  const promote = await api(`/api/admin/users/${newLogin.data.user.id}/role`, { method: 'PATCH', token: adminToken, body: { role: 'agent' } });
  check('admin promotes a user to agent', promote.status === 200 && promote.data.user.role === 'agent');

  const stats = await api('/api/admin/stats', { token: adminToken });
  check('admin stats endpoint works', stats.status === 200 && typeof stats.data.users === 'number');

  // ---------- 9. Unknown route ----------
  const unknown = await api('/api/nope');
  check('unknown route returns 404 JSON', unknown.status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Test crashed:', err.message);
  process.exit(1);
});
