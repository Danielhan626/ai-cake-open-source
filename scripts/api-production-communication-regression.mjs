import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `production-communication-buyer-${runId}`;
const bakerUserId = 'demo-baker-user';

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

async function expectFailure(label, path, init, expectedMessage) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  assert(!response.ok, `${label} should fail`);
  assert.match(text, expectedMessage, `${label} should mention ${expectedMessage}`);
}

async function admin(path, init = {}) {
  return request(path, {
    ...init,
    headers: {
      'x-admin-password': ADMIN_PASSWORD,
      ...(init.headers || {}),
    },
  });
}

const generated = await request('/works/generate', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    prompt: '一款像星空列车一样的纪念日蛋糕，想保留梦幻轨道和发光感',
    scenario: '纪念日',
    style: '幻想治愈',
    color: '蓝紫',
    size: '6寸',
    budget: '400-699元',
  }),
});

await expectFailure(
  'approve unpublished work',
  `/admin/works/${generated.work.id}/review`,
  {
    method: 'PATCH',
    headers: {
      'x-admin-password': ADMIN_PASSWORD,
    },
    body: JSON.stringify({ status: 'approved', operator: 'production-communication-regression' }),
  },
  /Work is not awaiting public review/,
);

const submittedWork = await request(`/works/${generated.work.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});
assert.equal(submittedWork.visibility, 'public', 'work must be submitted to public review before admin audit');
assert.equal(submittedWork.reviewStatus, 'pending', 'submitted work must stay pending before admin audit');

const approvedWork = await admin(`/admin/works/${generated.work.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'production-communication-regression' }),
});
assert.equal(approvedWork.reviewStatus, 'approved', 'work must be approved');

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: generated.work.id,
    title: `制作沟通边界回归-${runId}`,
    description: '用户想保留星空列车创意，让蛋糕师判断能否接单和如何改稿。',
    city: '长治',
    district: '潞州区',
    expectedDate: '2026-07-01',
    budget: '400-699元',
    servings: '4-6人',
    deliveryMethod: '同城配送',
    deliveryWindow: '下午',
    cakeSize: '6寸 · 4-6人',
    flavor: '动物奶油',
    recipientNote: '愿你每天都有甜甜的光',
    productionNoticeAccepted: true,
    allowAdjustments: true,
    productionLevel: 'challenge',
    mustKeep: '保留星空列车、蓝紫色和纪念日糖牌。',
    canAdjust: '支撑结构、灯光效果、列车摆件和配送方案可由蛋糕师调整。',
    contact: 'wechat_production_communication',
  }),
});

assert.equal(demand.productionLevel, 'challenge', 'demand must preserve production communication level');
assert.match(demand.mustKeep, /星空列车/, 'demand must preserve mustKeep');
assert.match(demand.canAdjust, /蛋糕师调整/, 'demand must preserve canAdjust');
assert.equal(demand.deliveryWindow, '下午', 'demand must preserve delivery window');
assert.equal(demand.cakeSize, '6寸 · 4-6人', 'demand must preserve cake size');
assert.equal(demand.flavor, '动物奶油', 'demand must preserve flavor');
assert.equal(demand.recipientNote, '愿你每天都有甜甜的光', 'demand must preserve recipient note');
assert.equal(demand.productionNoticeAccepted, true, 'demand must preserve production notice confirmation');
assert.equal(demand.reviewStatus, 'pending', 'demand must start pending');

await admin(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'production-communication-regression' }),
});

const adjustedQuote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakerUserId,
    demandId: demand.id,
    bakerId: 'demo-baker',
    decision: 'with_adjustments',
    amount: 588,
    deliveryFee: 30,
    productionDays: 3,
    availableDate: '2026-06-28',
    restorationLevel: '主体接近',
    deliveryWindow: '下午',
    scheduledDeliverySupported: true,
    changeDeadline: '开做前一天 18:00 前',
    cancelPolicy: '开做前可沟通取消，备料后按实际损耗协商。',
    signoffNote: '签收前检查外观、祝福牌和配送完整度。',
    message: '建议调整后制作：保留星空列车主题，灯光感改成糖牌和珠光喷色。',
    adjustmentNote: '列车立体结构需要缩小，配送前加固。',
  }),
});
assert.equal(adjustedQuote.decision, 'with_adjustments', 'quote must preserve adjustment decision');
assert.equal(adjustedQuote.restorationLevel, '主体接近', 'quote must preserve restoration level');
assert.equal(adjustedQuote.deliveryWindow, '下午', 'quote must preserve delivery window');
assert.equal(adjustedQuote.scheduledDeliverySupported, true, 'quote must preserve scheduled delivery support');
assert.equal(adjustedQuote.changeDeadline, '开做前一天 18:00 前', 'quote must preserve change deadline');
assert.match(adjustedQuote.cancelPolicy, /备料后/, 'quote must preserve cancellation rule');
assert.match(adjustedQuote.signoffNote, /签收前检查/, 'quote must preserve sign-off note');

const declineQuote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakerUserId,
    demandId: demand.id,
    bakerId: 'demo-baker',
    decision: 'decline',
    amount: 588,
    deliveryFee: 30,
    productionDays: 3,
    availableDate: '2026-06-28',
    restorationLevel: '需要二次改稿',
    deliveryWindow: '上午',
    scheduledDeliverySupported: false,
    changeDeadline: '暂不适用',
    cancelPolicy: '暂不接单',
    signoffNote: '暂不适用',
    message: '暂不接单：当前档期无法处理星空列车结构。',
    adjustmentNote: '建议等待其他蛋糕师报价。',
  }),
});
assert.equal(declineQuote.decision, 'decline', 'decline quote must persist decision');
assert.equal(declineQuote.amount, 0, 'decline quote must not expose an order amount');
assert.equal(declineQuote.deliveryFee, 0, 'decline quote must not expose a delivery fee');

await expectFailure(
  'select declined quote',
  `/quotes/${declineQuote.id}/select`,
  {
    method: 'PATCH',
    body: JSON.stringify({ userId }),
  },
  /暂不接单的回复不能被选择为订单报价/,
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'api-production-communication-boundary',
      demandId: demand.id,
      quoteId: adjustedQuote.id,
    },
    null,
    2,
  ),
);
