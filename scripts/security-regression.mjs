const base = process.env.API_BASE || 'http://localhost:4000';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
const testRun = Date.now().toString(36);
const ownerUserId = `security-owner-${testRun}`;
const intruderUserId = `security-intruder-${testRun}`;

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

async function expectFailure(label, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (response.status < 400) {
    throw new Error(`${label} unexpectedly succeeded: ${response.status} ${text}`);
  }
  return { status: response.status, body: text };
}

async function expectImageSuccess(label, pathOrUrl) {
  const response = await fetch(new URL(pathOrUrl, base).toString());
  if (!response.ok) {
    throw new Error(`${label} image fetch failed: ${response.status} ${await response.text()}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`${label} must return image/*, observed ${contentType || '<empty>'}`);
  }
}

async function expectImageFailure(label, pathOrUrl) {
  const response = await fetch(new URL(pathOrUrl, base).toString());
  if (response.status < 400) {
    throw new Error(`${label} unexpectedly exposed image content: ${response.status}`);
  }
}

async function createApprovedDemand() {
  const generated = await request('/works/generate', {
    method: 'POST',
    body: JSON.stringify({
      userId: ownerUserId,
      title: '安全回归测试蛋糕',
      prompt: '安全回归测试用的粉色水果生日蛋糕',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元',
    }),
  });

  if (generated.generation && ('imageUrl' in generated.generation || 'raw' in generated.generation)) {
    throw new Error('saved work generation metadata must not expose provider imageUrl/raw payload');
  }

  const draftDemand = await request('/demands', {
    method: 'POST',
    body: JSON.stringify({
      userId: ownerUserId,
      workId: generated.work.id,
      title: `制作：${generated.work.title}`,
      description: '安全回归测试需求。',
      city: '长治',
      district: '潞州区',
      expectedDate: nextWeek(),
      budget: generated.work.budget,
      servings: '4-6人',
      deliveryMethod: '配送或自提均可',
      allowAdjustments: true,
      contact: 'security_owner_contact',
    }),
  });

  const approvedDemand = await request(`/admin/demands/${draftDemand.id}/review`, {
    method: 'PATCH',
    headers: {
      'x-admin-password': adminPassword,
    },
    body: JSON.stringify({
      status: 'approved',
      note: 'security regression approval',
      operator: 'security-regression',
    }),
  });

  return { work: generated.work, demand: approvedDemand };
}

async function createPendingDemand(workId) {
  return request('/demands', {
    method: 'POST',
    body: JSON.stringify({
      userId: ownerUserId,
      workId,
      title: '待审核需求',
      description: '这是一条仍处于待审核状态的需求。',
      city: '长治',
      district: '潞州区',
      expectedDate: nextWeek(),
      budget: '200-399元',
      servings: '4-6人',
      deliveryMethod: '配送或自提均可',
      allowAdjustments: true,
      contact: 'security_pending_contact',
    }),
  });
}

function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

const { work, demand } = await createApprovedDemand();
const pendingDemand = await createPendingDemand(work.id);

if (!work.imageUrl.includes(`/works/${work.id}/image`)) {
  throw new Error('private work image must be presented through the scoped work image route');
}
if (!new URL(work.imageUrl, base).searchParams.get('access')) {
  throw new Error('private work image route must include a scoped access token for the owner response');
}
await expectImageSuccess('owner token private work image', work.imageUrl);
await expectImageFailure('anonymous private work image without token', `/works/${work.id}/image`);

const privatePortfolioUpload = await request('/uploads', {
  method: 'POST',
  body: JSON.stringify({
    userId: ownerUserId,
    kind: 'portfolio',
    fileName: 'private-cake.png',
    mimeType: 'image/png',
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  }),
});
await expectImageFailure('portfolio upload public content route', `/uploads/public/${privatePortfolioUpload.id}/content`);

const publicWorks = await request(`/works?userId=${intruderUserId}&includePending=true`);
if (publicWorks.some((item) => item.id === work.id)) {
  throw new Error('public works list must not reveal private owner works through spoofed userId');
}

await expectFailure('non-owner private work read', `/works/${work.id}?userId=${intruderUserId}`);

await expectFailure('non-owner pending demand read', `/demands/${pendingDemand.id}?userId=${intruderUserId}`);

const publicDemand = await request(`/demands/${demand.id}?userId=${intruderUserId}`);
if (publicDemand.contact) {
  throw new Error('approved public demand must not leak contact information');
}

await expectFailure('non-owner work publish', `/works/${work.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId: intruderUserId }),
});

await expectFailure('non-owner work refine', `/works/${work.id}/refine`, {
  method: 'POST',
  body: JSON.stringify({
    userId: intruderUserId,
    refinement: '越权尝试修改他人作品。',
  }),
});

await expectFailure('non-baker quote create', '/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: intruderUserId,
    demandId: demand.id,
    bakerId: 'demo-baker',
    amount: 328,
    deliveryFee: 20,
    productionDays: 2,
    adjustmentNote: '安全回归测试。',
    message: '安全回归测试。',
  }),
});

const quote = await request('/quotes', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'demo-baker-user',
    demandId: demand.id,
    bakerId: 'demo-baker',
    amount: 328,
    deliveryFee: 20,
    productionDays: 2,
    adjustmentNote: '安全回归测试。',
    message: '安全回归测试。',
  }),
});

await expectFailure('non-owner quote select', `/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({ userId: intruderUserId }),
});

const selected = await request(`/quotes/${quote.id}/select`, {
  method: 'PATCH',
  body: JSON.stringify({ userId: ownerUserId }),
});

await expectFailure('non-owner payment create', '/payments', {
  method: 'POST',
  body: JSON.stringify({
    userId: intruderUserId,
    quoteId: selected.id,
  }),
});

await request(`/works/${work.id}/publish`, {
  method: 'PATCH',
  body: JSON.stringify({ userId: ownerUserId }),
});
const approvedWork = await request(`/admin/works/${work.id}/review`, {
  method: 'PATCH',
  headers: {
    'x-admin-password': adminPassword,
  },
  body: JSON.stringify({
    status: 'approved',
    note: 'security regression public work approval',
    operator: 'security-regression',
  }),
});
if (new URL(approvedWork.imageUrl, base).searchParams.get('access')) {
  throw new Error('approved public work image must not require an access token');
}
await expectImageSuccess('approved public work image without token', approvedWork.imageUrl);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: [
        'non-owner private work read',
        'non-owner pending demand read',
        'approved public demand hides contact',
        'non-owner work publish',
        'non-owner work refine',
        'non-baker quote create',
        'non-owner quote select',
        'non-owner payment create',
        'private work image requires scoped token',
        'portfolio uploads are not publicly readable',
        'approved public work image is readable without token',
      ],
    },
    null,
    2,
  ),
);
