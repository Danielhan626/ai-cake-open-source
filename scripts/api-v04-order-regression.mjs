const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `v04-buyer-${runId}`;
const bakerUserId = 'demo-baker-user';

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

const createdWork = await request('/works', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    title: `v04订单回归蛋糕-${runId}`,
    prompt: '适合第一阶段撮合验证的鲜果蛋糕',
    imageUrl: 'mock://v04-order-regression-cake',
    scenario: '生日',
    style: '清新水果',
    color: '白绿',
    size: '6寸',
    budget: '200-399元',
  }),
});
assert(createdWork.id, 'created work must have id');

await request(`/works/${createdWork.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});

const approvedWork = await admin(`/admin/works/${createdWork.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-regression' }),
});
assert(approvedWork.reviewStatus === 'approved', 'work must be approved before demand');

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: createdWork.id,
    title: `制作 v04 回归蛋糕-${runId}`,
    description: '希望本地蛋糕师按图制作，允许可食用材料调整。',
    city: '长治',
    district: '潞州区',
    expectedDate: '2026-07-01',
    budget: '200-399元',
    servings: '4-6人',
    deliveryMethod: '同城配送',
    allowAdjustments: true,
    contact: 'wechat_v04_buyer',
  }),
});
assert(demand.reviewStatus === 'pending', 'new demand must start pending review');

const approvedDemand = await admin(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'v04-regression' }),
});
assert(approvedDemand.status === 'quoting', 'approved demand must enter quoting');

const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakerUserId,
    demandId: demand.id,
    bakerId: 'demo-baker',
    amount: 328,
    deliveryFee: 20,
    availableDate: '2026-06-29',
    productionDays: 2,
    adjustmentNote: '水果摆放会按配送稳定性调整。',
    message: '可以制作，建议提前确认口味。',
  }),
});
assert(quote.status === 'active', 'created quote must start active');

const selectedQuote = await request(`/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});
assert(selectedQuote.status === 'selected', 'quote must be selected before order creation');

const order = await request('/orders', {
  method: 'POST',
  body: JSON.stringify({ userId, quoteId: selectedQuote.id }),
});
assert(order.id, 'order must have id');
assert(order.status === 'intent_confirmed', 'order must start as confirmed intent');
assert(order.fulfillment.status === 'created', 'fulfillment must start created');
assert(order.work.id === createdWork.id, 'order must include related work');
assert(order.demand.id === demand.id, 'order must include related demand');
assert(order.quote.id === quote.id, 'order must include selected quote');
assert(order.baker.id === 'demo-baker', 'order must include baker');
assert(order.amount === 348, 'order amount must include quote and delivery fee');

const duplicate = await request('/orders', {
  method: 'POST',
  body: JSON.stringify({ userId, quoteId: selectedQuote.id }),
});
assert(duplicate.id === order.id, 'same quote/user must return existing order');

const orders = await request(`/orders?userId=${userId}`);
assert(Array.isArray(orders), 'orders list must be an array');
assert(orders.length >= 1, 'orders list must include the created order');
assert(orders[0].id === order.id, 'newest user order must be first');

const detail = await request(`/orders/${order.id}?userId=${userId}`);
assert(detail.id === order.id, 'order detail must be readable by owner');
assert(detail.fulfillment.status === 'created', 'order detail must include fulfillment');

const updated = await admin(`/orders/${order.id}/fulfillment`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'baker_confirmed',
    operator: 'v04-regression',
    note: '蛋糕师已确认制作排期。',
  }),
});
assert(updated.status === 'merchant_confirmed', 'order status must align after baker confirmation');
assert(updated.fulfillment.status === 'baker_confirmed', 'fulfillment status must update');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      orderId: order.id,
      quoteId: quote.id,
      orderStatus: updated.status,
      fulfillmentStatus: updated.fulfillment.status,
    },
    null,
    2,
  ),
);
