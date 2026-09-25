const base = process.env.API_BASE || 'http://localhost:4000';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `v03-player-${runId}`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loginAdmin() {
  const session = await request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      username: adminUsername,
      password: adminPassword,
    }),
  });
  assert(session && session.token, 'admin login must return a token');
  return session.token;
}

const today = await request(`/design-tasks/today?userId=${userId}`);
assert(Array.isArray(today.tasks), 'today tasks must be an array');
assert(today.tasks.length > 0, 'today tasks must include active design tasks');

const task = today.tasks[0];
assert(task.rewardAmount >= 20 && task.rewardAmount <= 100, 'task reward must stay in inspiration coupon range');
assert(task.rewardStatus === 'available', 'new user task reward status must be available');

const join = await request(`/design-tasks/${task.id}/join`, {
  method: 'POST',
  body: JSON.stringify({ userId }),
});
assert(join.task.joined === true, 'joined task must be marked joined');

const generated = await request('/works/generate', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    title: `${task.scenario} · ${task.style}`,
    prompt: task.prompt,
    scenario: task.scenario,
    style: task.style,
    color: task.color,
    size: '6寸',
    budget: '200-399元',
  }),
});
assert(generated.work.id, 'generated work must have id');

const completion = await request(`/design-tasks/${task.id}/complete`, {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: generated.work.id,
  }),
});
assert(completion.created === true, 'first completion must be created');
assert(completion.completion.status === 'pending', 'completion reward must be pending');
assert(completion.wallet.rewardPending >= task.rewardAmount, 'wallet must include pending inspiration coupon reward');

const duplicate = await request(`/design-tasks/${task.id}/complete`, {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: generated.work.id,
  }),
});
assert(duplicate.created === false, 'same user must not complete the same task twice');

const adminToken = await loginAdmin();
const candidates = await request('/design-tasks/generate-candidates', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${adminToken}`,
  },
  body: JSON.stringify({ operator: 'v03-regression' }),
});
assert(Array.isArray(candidates.tasks), 'candidate generation must return tasks');
assert(candidates.tasks.every((item) => item.status === 'candidate'), 'generated Bot tasks must stay candidate before review');

const reviews = await request('/bot-reviews/work', {
  method: 'POST',
  body: JSON.stringify(generated.work),
});
assert(Array.isArray(reviews.items), 'bot reviews must return items');
assert(reviews.items.length === 6, 'bot reviews must return 6 domestic role reviews');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      taskId: task.id,
      workId: generated.work.id,
      rewardPending: completion.wallet.rewardPending,
      duplicateCreated: duplicate.created,
      reviewCount: reviews.items.length,
    },
    null,
    2,
  ),
);
