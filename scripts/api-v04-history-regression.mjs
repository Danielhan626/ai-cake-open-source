const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `v04-history-${runId}`;

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

function admin(path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      'x-admin-password': adminPassword,
      ...(options.headers || {}),
    },
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const work = await request('/works', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    title: `v04历史作品-${runId}`,
    prompt: '用于我的历史列表回归的鲜果蛋糕',
    imageUrl: 'mock://v04-history-cake',
    scenario: '生日',
    style: '鲜果',
    color: '白绿',
    size: '6寸',
    budget: '200-399元',
  }),
});
await request(`/works/${work.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});
await admin(`/admin/works/${work.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-history-regression' }),
});

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: work.id,
    title: `v04历史需求-${runId}`,
    description: '希望按图制作并同城配送。',
    city: '长治',
    district: '潞州区',
    expectedDate: '2026-07-02',
    budget: '200-399元',
    servings: '4-6人',
    deliveryMethod: '同城配送',
    allowAdjustments: true,
    contact: 'wechat_history_user',
  }),
});
await admin(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-history-regression' }),
});

const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'demo-baker-user',
    demandId: demand.id,
    bakerId: 'demo-baker',
    amount: 298,
    deliveryFee: 18,
    availableDate: '2026-06-30',
    productionDays: 2,
    adjustmentNote: '可制作为鲜果奶油款。',
    message: '可以做，建议提前确认祝福语。',
  }),
});
await request(`/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});
const order = await request('/orders', {
  method: 'POST',
  body: JSON.stringify({ userId, quoteId: quote.id }),
});

const history = await request(`/profile/history?userId=${userId}`);
assert(history.userId === userId, 'history must identify the user');
assert(history.summary.works >= 1, 'history summary must count works');
assert(history.summary.demands >= 1, 'history summary must count demands');
assert(history.summary.quotes >= 1, 'history summary must count quotes');
assert(history.summary.orders >= 1, 'history summary must count orders');
assert(history.works.some((item) => item.id === work.id), 'history must include created work');
assert(history.demands.some((item) => item.id === demand.id), 'history must include created demand');
assert(history.quotes.some((item) => item.id === quote.id), 'history must include quote on owned demand');
assert(history.orders.some((item) => item.id === order.id), 'history must include created order');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      userId,
      summary: history.summary,
    },
    null,
    2,
  ),
);
