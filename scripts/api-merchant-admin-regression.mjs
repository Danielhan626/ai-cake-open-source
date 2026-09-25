const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const userId = `merchant-admin-buyer-${runId}`;
const bakerUserId = `merchant-admin-baker-${runId}`;
const bakerId = 'demo-baker';

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

async function expectAdminFailure(label, path, options, expectedStatus, expectedText) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': adminPassword,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (response.status !== expectedStatus || !text.includes(expectedText)) {
    throw new Error(`Expected ${label} to fail with ${expectedStatus} containing "${expectedText}", got ${response.status}: ${text}`);
  }
}

async function uploadWithBearer(token, kind, fileName, contentBase64, mimeType = 'image/png') {
  return request('/uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      kind,
      fileName,
      mimeType,
      contentBase64,
    }),
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createWork(label) {
  return request('/works', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      title: `商家后台回归蛋糕-${label}`,
      prompt: '用于验证商家后台待报价需求、订单履约和售后协商。',
      imageUrl: `mock://merchant-admin-cake-${label}`,
      scenario: '生日',
      style: '鲜果奶油',
      color: '白绿',
      size: '6寸',
      budget: '200-399元',
    }),
  });
}

async function createApprovedDemandFromWork(work, label) {
  await request(`/works/${work.id}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({ userId }),
  });

  const demand = await request('/demands', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      workId: work.id,
      title: `待报价需求-${label}`,
      description: '希望本地蛋糕师报价，允许根据真实制作调整。',
      city: '长治',
      district: '潞州区',
      expectedDate: '2026-07-08',
      budget: '200-399元',
      servings: '4-6人',
      deliveryMethod: '同城配送',
      allowAdjustments: true,
      contact: 'wechat_merchant_admin_buyer',
    }),
  });
  return admin(`/admin/demands/${demand.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved', operator: 'merchant-admin-regression' }),
  });
}

const privateDraftWork = await createWork('private-draft');
const publicPendingWork = await createWork('quote');
await request(`/works/${publicPendingWork.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});

const queueBeforeWorkAudit = await admin('/admin/review-queue');
assert(
  !queueBeforeWorkAudit.works.some((item) => item.id === privateDraftWork.id),
  'review queue must not include unpublished private works',
);
assert(
  queueBeforeWorkAudit.works.some((item) => item.id === publicPendingWork.id),
  'review queue must include works explicitly submitted for public review',
);

await expectAdminFailure(
  'private draft review approval',
  `/admin/works/${privateDraftWork.id}/review`,
  {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved', operator: 'merchant-admin-regression' }),
  },
  400,
  'Work is not awaiting public review',
);

await admin(`/admin/works/${publicPendingWork.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'merchant-admin-regression' }),
});

const demand = await createApprovedDemandFromWork(publicPendingWork, 'quote');

const bakerSession = await request('/auth/dev-login', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakerUserId,
    nickname: `资质测试蛋糕店-${runId}`,
    city: '长治',
  }),
});
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotW7cAAAAASUVORK5CYII=';
const healthUpload = await uploadWithBearer(bakerSession.token, 'healthCertificate', 'health-cert.png', samplePngBase64);
const licenseUpload = await uploadWithBearer(bakerSession.token, 'businessLicense', 'business-license.png', samplePngBase64);
const permitUpload = await uploadWithBearer(bakerSession.token, 'foodPermit', 'food-permit.png', samplePngBase64);
const uploadedBaker = await request('/bakers', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${bakerSession.token}`,
  },
  body: JSON.stringify({
    userId: bakerUserId,
    name: `资质测试门店-${runId}`,
    city: '长治',
    district: '潞州区',
    deliveryRadiusKm: 8,
    specialties: ['鲜果奶油'],
    startingPrice: 188,
    contact: 'credential_tester',
    bio: '用于验证后台资质查看链路。',
    portfolio: [],
    healthCertificateUrl: healthUpload.url,
    businessLicenseUrl: licenseUpload.url,
    foodPermitUrl: permitUpload.url,
  }),
});

const beforeQuoteWorkbench = await admin(`/admin/merchant-workbench?bakerId=${bakerId}`);
assert(Array.isArray(beforeQuoteWorkbench.pendingQuoteDemands), 'merchant workbench must expose pending quote demands');
assert(
  beforeQuoteWorkbench.pendingQuoteDemands.some((item) => item.id === demand.id),
  'merchant workbench must include approved quoting demand before merchant quote',
);

const quote = await admin('/admin/merchant-quotes', {
  method: 'POST',
  body: JSON.stringify({
    demandId: demand.id,
    bakerId,
    amount: 368,
    deliveryFee: 18,
    availableDate: '2026-07-07',
    productionDays: 2,
    decision: 'with_adjustments',
    adjustmentNote: '鲜果装饰按当天库存调整，主体色系不变。',
    message: '可以承接，建议提前一天确认祝福牌文字。',
  }),
});
assert(quote.id, 'admin merchant quote must create or update a quote');
assert(quote.bakerId === bakerId, 'admin merchant quote must target selected baker');
assert(quote.status === 'active', 'admin merchant quote must create active quote');

const afterQuoteWorkbench = await admin(`/admin/merchant-workbench?bakerId=${bakerId}`);
assert(
  !afterQuoteWorkbench.pendingQuoteDemands.some((item) => item.id === demand.id),
  'quoted demand must leave merchant pending quote queue',
);

const queue = await admin('/admin/review-queue');
assert(
  !queue.demands.some((item) => item.id === demand.id),
  'approved demand must not remain in demand review queue',
);
assert(
  queue.demands.every((item) => item.reviewStatus === 'pending'),
  'demand review queue must only include pending demands',
);
assert(
  queue.bakers.every((item) => item.reviewStatus === 'pending'),
  'baker review queue must only include pending baker applications',
);
assert(
  queue.supportTickets.every((item) => item.status === 'pending'),
  'support review queue must only include pending support tickets',
);
assert(
  queue.rewardReviews.every((item) => item.status === 'pending'),
  'reward review queue must only include pending reward reviews',
);
const queuedBaker = queue.bakers.find((item) => item.id === uploadedBaker.id);
assert(queuedBaker, 'review queue must include newly submitted baker application');
assert(Array.isArray(queuedBaker.credentialFiles), 'review queue baker must expose resolved credential files');
assert(
  queuedBaker.credentialFiles.some((item) => item.kind === 'healthCertificate' && item.uploadId === healthUpload.id),
  'health certificate credential file must resolve to upload id',
);
const credentialResponse = await fetch(`${base}/admin/uploads/${healthUpload.id}/content`, {
  headers: {
    'x-admin-password': adminPassword,
  },
});
assert(credentialResponse.ok, 'admin upload content endpoint must return credential bytes');
assert(
  `${credentialResponse.headers.get('content-type') || ''}`.includes('image/png'),
  'admin upload content endpoint must preserve mime type',
);
const credentialBytes = Buffer.from(await credentialResponse.arrayBuffer());
assert(credentialBytes.length > 0, 'admin upload content endpoint must return non-empty content');

await request(`/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({ userId }),
});
const order = await request('/orders', {
  method: 'POST',
  body: JSON.stringify({ userId, quoteId: quote.id }),
});

const orderWorkbench = await admin(`/admin/merchant-workbench?bakerId=${bakerId}`);
assert(Array.isArray(orderWorkbench.fulfillmentOrders), 'merchant workbench must expose fulfillment orders');
assert(
  orderWorkbench.fulfillmentOrders.some((item) => item.id === order.id),
  'merchant workbench must include order awaiting fulfillment',
);

const fulfilled = await admin(`/orders/${order.id}/fulfillment`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'completed',
    note: '商家后台回归验证：订单完成，进入售后窗口。',
    operator: 'merchant-admin-regression',
  }),
});
assert(fulfilled.status === 'completed', 'admin fulfillment API must complete the order');

const refund = await request('/refunds', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    orderId: order.id,
    reason: '成品装饰与沟通不一致',
    description: '消费者提交证据，等待商家和平台协商。',
    evidenceImages: ['upload://supportEvidence/merchant-admin-refund'],
    evidenceNote: '成品照片和聊天记录截图。',
    contact: 'wechat_merchant_admin_buyer',
    requestedAmount: 120,
  }),
});

const refundWorkbench = await admin(`/admin/merchant-workbench?bakerId=${bakerId}`);
assert(Array.isArray(refundWorkbench.refundNegotiations), 'merchant workbench must expose refund negotiations');
assert(
  refundWorkbench.refundNegotiations.some((item) => item.id === refund.id),
  'merchant workbench must include pending refund negotiation',
);

const mediated = await admin(`/admin/refunds/${refund.id}/mediation`, {
  method: 'PATCH',
  body: JSON.stringify({
    platformNote: '已联系商家补充配送和制作凭证，继续协商。',
    supportStatus: 'processing',
    operator: 'merchant-admin-regression',
  }),
});
assert(mediated.platformNote.includes('继续协商'), 'admin refund mediation must persist platform negotiation note');
assert(mediated.supportTicket.status === 'processing', 'admin refund mediation must update linked support ticket status');

const resolvedSupportTicket = await admin('/admin/support-tickets', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    type: '已处理客服记录',
    contact: 'wechat_resolved_support',
    description: '用于验证已处理客服记录不会留在审核队列。',
    evidenceNote: '无需补充。',
  }),
});
await admin(`/admin/support-tickets/${resolvedSupportTicket.id}/status`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'resolved',
    note: '已处理',
    operator: 'merchant-admin-regression',
  }),
});

const approvedReward = await admin('/admin/reward-reviews', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    workId: publicPendingWork.id,
    amount: 20,
    reason: '已审核灵感券回归记录',
  }),
});
await admin(`/admin/reward-reviews/${approvedReward.id}/status`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'approved',
    note: '已审核',
    operator: 'merchant-admin-regression',
  }),
});

const queueAfterClosedItems = await admin('/admin/review-queue');
assert(
  !queueAfterClosedItems.supportTickets.some((item) => item.id === resolvedSupportTicket.id),
  'resolved support tickets must leave the support review queue',
);
assert(
  !queueAfterClosedItems.rewardReviews.some((item) => item.id === approvedReward.id),
  'approved rewards must leave the reward review queue',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      pendingDemandId: demand.id,
      quoteId: quote.id,
      orderId: order.id,
      refundId: refund.id,
    },
    null,
    2,
  ),
);
