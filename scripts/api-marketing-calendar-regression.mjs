import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4000';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `marketing-calendar-user-${runId}`;

async function request(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed ${response.status}: ${text}`);
  }
  return body;
}

const adminSession = await request('/admin/login', {
  method: 'POST',
  body: JSON.stringify({
    username: adminUsername,
    password: adminPassword,
  }),
});

assert(adminSession && adminSession.token, 'admin login must return a token for marketing calendar regression');

const candidates = await request('/design-tasks/generate-candidates', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${adminSession.token}`,
  },
  body: JSON.stringify({ operator: 'marketing-calendar-regression' }),
});

assert(candidates.marketingContext, 'candidate generation must return marketing context');
assert.match(candidates.marketingContext.promptSummary, /当前营销节点/, 'marketing context must include active node summary');
assert(Array.isArray(candidates.tasks), 'candidate generation must return tasks');
assert(candidates.tasks.length >= 1, 'candidate generation must create at least one task');
assert(candidates.tasks.every((task) => task.status === 'candidate'), 'generated tasks must remain candidate before manual publish');
assert(candidates.tasks.some((task) => task.marketingNodeId || task.marketingTitle), 'generated tasks must include marketing metadata');

const selected = candidates.tasks.slice(0, 1).map((task) => task.id);
const published = await request('/design-tasks/publish-today', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${adminSession.token}`,
  },
  body: JSON.stringify({
    operator: 'marketing-calendar-regression',
    taskIds: selected,
  }),
});

assert.equal(published.publishedCount, 1, 'publish-today must publish selected candidate');
assert.equal(published.tasks[0].status, 'active', 'published task must become active');
assert.equal(published.tasks[0].id, selected[0], 'publish-today must publish requested task id');

const today = await request(`/design-tasks/today?userId=${userId}`);
assert(today.tasks.some((task) => task.id === selected[0]), 'today tasks must include manually published task');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'api-marketing-calendar-task-engine',
      publishedTaskId: selected[0],
      marketingNode: published.tasks[0].marketingTitle || published.tasks[0].marketingNodeId,
    },
    null,
    2,
  ),
);
