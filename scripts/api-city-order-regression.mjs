const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const runId = Date.now().toString(36);
const buyerUserId = `city-buyer-${runId}`;
const localBakerUserId = `city-baker-local-${runId}`;
const remoteBakerUserId = `city-baker-remote-${runId}`;

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
    const error = new Error(`${response.status} ${text}`);
    error.status = response.status;
    error.data = data;
    throw error;
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

async function expectFailure(label, fn, pattern) {
  try {
    await fn();
  } catch (error) {
    if (pattern && !pattern.test(error.message)) {
      throw new Error(`${label} failed with unexpected error: ${error.message}`);
    }
    return;
  }
  throw new Error(`${label} should have failed`);
}

async function createApprovedBaker(input) {
  const baker = await request('/bakers', {
    method: 'POST',
    body: JSON.stringify({
      healthCertificateUrl: `upload://health-${runId}`,
      businessLicenseUrl: `upload://license-${runId}`,
      foodPermitUrl: `upload://food-permit-${runId}`,
      ...input,
    }),
  });
  assert(baker.reviewStatus === 'pending', 'new baker must start pending review');
  const approved = await admin(`/admin/bakers/${baker.id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved', operator: 'city-order-regression' }),
  });
  assert(approved.reviewStatus === 'approved', 'baker must be approved');
  return approved;
}

const createdWork = await request('/works', {
  method: 'POST',
  body: JSON.stringify({
    userId: buyerUserId,
    title: `跨城订单回归蛋糕-${runId}`,
    prompt: '送给太原朋友的鲜果蛋糕',
    imageUrl: 'mock://city-order-regression-cake',
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
  body: JSON.stringify({ userId: buyerUserId }),
});

await admin(`/admin/works/${createdWork.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'city-order-regression' }),
});

const demand = await request('/demands', {
  method: 'POST',
  body: JSON.stringify({
    userId: buyerUserId,
    workId: createdWork.id,
    title: `送太原朋友：${runId}`,
    description: '用户在外地，想给太原朋友订本地制作配送的蛋糕。',
    city: '太原',
    district: '小店区',
    expectedDate: '2026-07-08',
    budget: '200-399元',
    servings: '4-6人',
    deliveryMethod: '同城配送',
    allowAdjustments: true,
    contact: 'wechat_city_order_buyer',
  }),
});
assert(demand.city === '太原', 'demand must preserve selected order city');

const approvedDemand = await admin(`/admin/demands/${demand.id}/review`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'approved', operator: 'city-order-regression' }),
});
assert(approvedDemand.status === 'quoting', 'approved demand must enter quoting');

const localBaker = await createApprovedBaker({
  userId: localBakerUserId,
  name: `太原本地蛋糕师-${runId}`,
  city: '太原',
  district: '小店区',
  deliveryRadiusKm: 10,
  specialties: ['鲜果', '生日'],
  startingPrice: 228,
  contact: 'wechat_taiyuan_baker',
});

const remoteBaker = await createApprovedBaker({
  userId: remoteBakerUserId,
  name: `长治异地蛋糕师-${runId}`,
  city: '长治',
  district: '潞州区',
  deliveryRadiusKm: 10,
  specialties: ['韩系', '生日'],
  startingPrice: 228,
  contact: 'wechat_changzhi_baker',
});

await expectFailure(
  'remote baker quote',
  () =>
    request('/quotes', {
      method: 'POST',
      body: JSON.stringify({
        userId: remoteBakerUserId,
        demandId: demand.id,
        bakerId: remoteBaker.id,
        amount: 328,
        deliveryFee: 20,
        availableDate: '2026-07-06',
        productionDays: 2,
      }),
    }),
  /same city|同城|订单城市|服务城市/i,
);

const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: localBakerUserId,
    demandId: demand.id,
    bakerId: localBaker.id,
    amount: 328,
    deliveryFee: 20,
    availableDate: '2026-07-06',
    productionDays: 2,
    adjustmentNote: '太原本地制作配送，按订单城市服务。',
    message: '可以按图制作并同城配送。',
  }),
});
assert(quote.status === 'active', 'same-city baker quote must be active');

const taiyuanBakers = await request('/bakers?city=%E5%A4%AA%E5%8E%9F');
assert(taiyuanBakers.some((item) => item.id === localBaker.id), 'Taiyuan baker list must include local baker');
assert(!taiyuanBakers.some((item) => item.id === remoteBaker.id), 'Taiyuan baker list must not include remote baker');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      demandCity: demand.city,
      localBakerId: localBaker.id,
      remoteBakerId: remoteBaker.id,
      quoteId: quote.id,
    },
    null,
    2,
  ),
);
