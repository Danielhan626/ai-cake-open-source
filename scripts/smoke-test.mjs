const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const runId = Date.now().toString(36);
const smokeUserId = `smoke-buyer-${runId}`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function assertImageReachable(url) {
  const target = new URL(url, base).toString();
  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`image fetch failed ${response.status}: ${target}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`image content-type must be image/*, observed ${contentType || '<empty>'}`);
  }
}

const health = await request('/health');
const demoSession = await request('/auth/dev-login', {
  method: 'POST',
  body: JSON.stringify({
    userId: smokeUserId,
    nickname: 'Smoke Buyer',
    city: '长治',
  }),
});
const authHeaders = {
  Authorization: `Bearer ${demoSession.token}`,
};
await request('/interactions/check-in', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({}),
});
const generated = await request('/works/generate', {
  method: 'POST',
  body: JSON.stringify({
    userId: smokeUserId,
    title: '生日 · 韩系奶油风',
    prompt: '送给女朋友的粉色蝴蝶结生日蛋糕',
    scenario: '生日',
    style: '韩系奶油风',
    color: '粉色',
    size: '6寸',
    budget: '200-399元',
  }),
});
assertSafeGenerationMetadata(generated.generation);
await assertImageReachable(generated.work.imageUrl);

const refined = await request(`/works/${generated.work.id}/refine`, {
  method: 'POST',
  body: JSON.stringify({
    userId: smokeUserId,
    refinement: '保留粉色蝴蝶结主题，增加草莓花环和更清晰的可制作层次。',
  }),
});
assertSafeGenerationMetadata(refined.generation);
await assertImageReachable(refined.work.imageUrl);

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId: smokeUserId,
    workId: refined.work.id,
    title: `制作：${refined.work.title}`,
    description: '希望尽量还原图片，可以接受蛋糕师根据真实制作调整。',
    city: '长治',
    district: '潞州区',
    expectedDate: nextWeek,
    budget: refined.work.budget,
    servings: '4-6人',
    deliveryMethod: '配送或自提均可',
    allowAdjustments: true,
    contact: 'wechat_demo_user',
  }),
});

const approvedDemand = await request(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  headers: {
    'x-admin-password': adminPassword,
  },
  body: JSON.stringify({
    status: 'approved',
    note: 'smoke test approval',
    operator: 'smoke',
  }),
});

let bakers = await request('/bakers?city=长治');
if (!bakers.length) {
  const smokeBaker = await request('/bakers', {
    method: 'POST',
    body: JSON.stringify({
      userId: `smoke-baker-${runId}`,
      name: `冒烟商家-${runId}`,
      city: '长治',
      district: '潞州区',
      deliveryRadiusKm: 8,
      specialties: ['鲜果', '生日'],
      startingPrice: 228,
      contact: `wechat_smoke_baker_${runId}`,
      bio: '用于本地冒烟测试的临时商家。',
      healthCertificateUrl: `upload://smoke-health-${runId}`,
      businessLicenseUrl: `upload://smoke-license-${runId}`,
      foodPermitUrl: `upload://smoke-food-${runId}`,
    }),
  });
  await request(`/admin/bakers/${smokeBaker.id}/review`, {
    method: 'PATCH',
    headers: {
      'x-admin-password': adminPassword,
    },
    body: JSON.stringify({
      status: 'approved',
      note: 'smoke test merchant approval',
      operator: 'smoke',
    }),
  });
  bakers = await request('/bakers?city=长治');
}
const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: bakers[0].userId,
    demandId: approvedDemand.id,
    bakerId: bakers[0].id,
    amount: 328,
    deliveryFee: 20,
    productionDays: 2,
    adjustmentNote: '可尽量还原图片，立体装饰会按可食用材料调整。',
    message: '这款可以做，建议提前两天确认口味、祝福语和配送时间。',
  }),
});

const selected = await request(`/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({
    userId: smokeUserId,
  }),
});
const payment = await request('/payments', {
  method: 'POST',
  body: JSON.stringify({
    userId: smokeUserId,
    quoteId: selected.id,
  }),
});
const paid = await request(`/payments/${payment.id}/mock-paid`, {
  method: 'PATCH',
  headers: {
    ...authHeaders,
  },
});

console.log(
  JSON.stringify(
    {
      health: health.status,
      workId: generated.work.id,
      refinedWorkId: refined.work.id,
      demandId: demand.id,
      demandStatus: approvedDemand.status,
      baker: bakers[0].name,
      quoteId: selected.id,
      paymentStatus: paid.status,
      paymentPackage: paid.payParams.package,
    },
    null,
    2,
  ),
);

if (paid.status !== 'paid') {
  throw new Error('Smoke test failed: payment not paid');
}

function assertSafeGenerationMetadata(generation) {
  if (!generation || typeof generation !== 'object') {
    throw new Error('generation metadata must be present');
  }
  if ('imageUrl' in generation || 'raw' in generation) {
    throw new Error('generation metadata must not expose provider imageUrl/raw payload');
  }
}
