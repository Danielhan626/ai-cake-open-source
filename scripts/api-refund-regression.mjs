const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `refund-buyer-${runId}`;
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

async function createCompletedOrder(suffix) {
  const work = await request('/works', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      title: `退款回归蛋糕-${suffix}`,
      prompt: '用于验证售后退款流程的鲜果蛋糕',
      imageUrl: `mock://refund-regression-cake-${suffix}`,
      scenario: '生日',
      style: '清新水果',
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
    body: JSON.stringify({ status: 'approved', operator: 'refund-regression' }),
  });

  const demand = await request('/demands', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      workId: work.id,
      title: `制作退款回归蛋糕-${suffix}`,
      description: '验证消费者不满意时可以提交证据并发起退款。',
      city: '长治',
      district: '潞州区',
      expectedDate: '2026-07-05',
      budget: '200-399元',
      servings: '4-6人',
      deliveryMethod: '同城配送',
      allowAdjustments: true,
      contact: 'wechat_refund_buyer',
    }),
  });
  await admin(`/admin/demands/${demand.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved', operator: 'refund-regression' }),
  });

  const quote = await request('/quotes', {
    method: 'POST',
    body: JSON.stringify({
      userId: bakerUserId,
      demandId: demand.id,
      bakerId: 'demo-baker',
      amount: 328,
      deliveryFee: 20,
      availableDate: '2026-07-04',
      productionDays: 2,
      adjustmentNote: '按配送稳定性调整装饰。',
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
  await request(`/orders/${order.id}/baker-fulfillment`, {
    method: 'PATCH',
    body: JSON.stringify({
      userId: bakerUserId,
      bakerId: 'demo-baker',
      status: 'completed',
      note: '订单已完成，进入售后周期。',
    }),
  });
  return request(`/orders/${order.id}?userId=${userId}`);
}

const agreedOrder = await createCompletedOrder('agree');
const requestRefund = await request('/refunds', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    orderId: agreedOrder.id,
    reason: '成品与确认图差异较大',
    description: '蛋糕主体颜色和祝福牌与沟通记录不一致，希望退款协商。',
    evidenceImages: ['upload://supportEvidence/refund-color', 'upload://supportEvidence/refund-card'],
    evidenceNote: '已上传成品图、聊天记录截图和收货后照片。',
    contact: 'wechat_refund_buyer',
    requestedAmount: 348,
  }),
});
assert(requestRefund.id, 'refund request must have id');
assert(requestRefund.status === 'pending_baker', 'refund must wait for baker response');
assert(requestRefund.order.status === 'disputed', 'order must enter disputed status after refund request');
assert(requestRefund.supportTicket, 'refund request must create a support ticket record');
assert(requestRefund.evidenceImages.length === 2, 'refund request must preserve evidence images');

const agreed = await request(`/refunds/${requestRefund.id}/baker-response`, {
  method: 'PATCH',
  body: JSON.stringify({
    userId: bakerUserId,
    bakerId: 'demo-baker',
    decision: 'agree',
    note: '商家同意退款，保留沟通记录。',
  }),
});
assert(agreed.status === 'refunded', 'baker agreement must refund through payment channel');
assert(agreed.refundPayment.status === 'refunded', 'refund payment record must be refunded');
assert(agreed.refundPayment.provider === 'mock', 'first-stage refund channel should be mock');
assert(agreed.order.status === 'disputed', 'refunded order remains in after-sale record state');

const rejectedOrder = await createCompletedOrder('reject');
const secondRefund = await request('/refunds', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    orderId: rejectedOrder.id,
    reason: '配送破损',
    description: '收货时盒体倾斜，蛋糕侧面有明显变形。',
    evidenceImages: ['upload://supportEvidence/refund-damage'],
    evidenceNote: '收货现场照片和配送沟通截图。',
    contact: 'wechat_refund_buyer',
    requestedAmount: 120,
  }),
});
const rejected = await request(`/refunds/${secondRefund.id}/baker-response`, {
  method: 'PATCH',
  body: JSON.stringify({
    userId: bakerUserId,
    bakerId: 'demo-baker',
    decision: 'reject',
    note: '商家认为配送后保存不当，需要客服介入。',
  }),
});
assert(rejected.status === 'platform_mediating', 'baker rejection must enter platform mediation');
assert(rejected.supportTicket.status === 'processing', 'support ticket must move to processing');
assert(rejected.refundPayment === null, 'rejected refund must not create payment refund before mediation');

const list = await request(`/refunds?userId=${userId}`);
assert(Array.isArray(list), 'refund list must be an array');
assert(list.some((item) => item.id === requestRefund.id), 'refund list must include agreed refund request');
assert(list.some((item) => item.id === secondRefund.id), 'refund list must include rejected refund request');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      agreedRefundId: requestRefund.id,
      rejectedRefundId: secondRefund.id,
      agreedStatus: agreed.status,
      rejectedStatus: rejected.status,
    },
    null,
    2,
  ),
);
