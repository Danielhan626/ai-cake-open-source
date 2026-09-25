const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `v04-baker-buyer-${runId}`;
const bakerUserId = 'demo-baker-user';
const wrongBakerUserId = `wrong-baker-${runId}`;

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

async function expectFailure(path, options, expectedStatus, expectedText) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (response.status !== expectedStatus || !text.includes(expectedText)) {
    throw new Error(`Expected ${expectedStatus} containing "${expectedText}", got ${response.status} ${text}`);
  }
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

const createdWork = await request('/works', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    title: `v04商家履约蛋糕-${runId}`,
    prompt: '用于验证蛋糕师端履约入口的鲜果蛋糕',
    imageUrl: 'mock://v04-baker-fulfillment-cake',
    scenario: '生日',
    style: '清新水果',
    color: '白绿',
    size: '6寸',
    budget: '200-399元',
  }),
});

await request(`/works/${createdWork.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});

await admin(`/admin/works/${createdWork.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-baker-regression' }),
});

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: createdWork.id,
    title: `制作商家履约回归蛋糕-${runId}`,
    description: '验证蛋糕师可以在小程序端推进履约状态。',
    city: '长治',
    district: '潞州区',
    expectedDate: '2026-07-02',
    budget: '200-399元',
    servings: '4-6人',
    deliveryMethod: '同城配送',
    allowAdjustments: true,
    contact: 'wechat_v04_baker_fulfillment',
  }),
});

await admin(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-baker-regression' }),
});

const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakerUserId,
    demandId: demand.id,
    bakerId: 'demo-baker',
    amount: 328,
    deliveryFee: 20,
    availableDate: '2026-07-01',
    productionDays: 2,
    adjustmentNote: '按配送稳定性调整水果摆放。',
    message: '可以制作，确认后安排排期。',
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
assert(order.fulfillment.status === 'created', 'order must start with created fulfillment');

const bakerOrders = await request(`/orders/baker?userId=${bakerUserId}&bakerId=demo-baker`);
assert(Array.isArray(bakerOrders), 'baker orders must be a list');
assert(bakerOrders.some((item) => item.id === order.id), 'baker orders must include selected quote order');

await expectFailure(
  `/orders/baker?userId=${wrongBakerUserId}&bakerId=demo-baker`,
  {},
  403,
  'Only the verified baker account can manage this order',
);

const confirmed = await request(`/orders/${order.id}/baker-fulfillment`, {
  method: 'PATCH',
  body: JSON.stringify({
    userId: bakerUserId,
    bakerId: 'demo-baker',
    status: 'baker_confirmed',
    note: '蛋糕师已在小程序端确认制作排期。',
  }),
});
assert(confirmed.status === 'merchant_confirmed', 'order status must become merchant_confirmed');
assert(confirmed.fulfillment.status === 'baker_confirmed', 'fulfillment must become baker_confirmed');

await expectFailure(
  `/orders/${order.id}/baker-fulfillment`,
  {
    method: 'PATCH',
    body: JSON.stringify({
      userId: wrongBakerUserId,
      bakerId: 'demo-baker',
      status: 'producing',
      note: 'wrong account should not update',
    }),
  },
  403,
  'Only the verified baker account can manage this order',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      orderId: order.id,
      orderStatus: confirmed.status,
      fulfillmentStatus: confirmed.fulfillment.status,
    },
    null,
    2,
  ),
);
