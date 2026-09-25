const base = process.env.API_BASE || 'http://localhost:4000';

const checks = [
  {
    label: 'work generation',
    path: '/works/generate',
    body: {
      userId: 'client-claimed-user',
      title: '生产认证回归测试',
      prompt: '生产环境不应信任客户端声明的用户身份',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元',
    },
  },
  {
    label: 'raw AI generation',
    path: '/ai/generate',
    body: {
      prompt: '匿名请求不应消耗生产生图额度',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元',
    },
  },
  {
    label: 'raw AI refinement',
    path: '/ai/refine',
    body: {
      sourceImageUrl: 'https://example.com/source-cake.png',
      prompt: '匿名请求不应消耗生产微调额度',
      refinement: '增加草莓装饰',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元',
    },
  },
  {
    label: 'phone binding',
    path: '/auth/phone-login',
    body: {
      userId: 'client-claimed-user',
      phoneCode: 'mock-phone-code',
    },
  },
];

const getChecks = [
  {
    label: 'profile history',
    path: '/profile/history?userId=client-claimed-user',
  },
  {
    label: 'orders list',
    path: '/orders?userId=client-claimed-user',
  },
  {
    label: 'refunds list',
    path: '/refunds?userId=client-claimed-user',
  },
  {
    label: 'quotes list',
    path: '/quotes?userId=client-claimed-user',
  },
  {
    label: 'payments list',
    path: '/payments?userId=client-claimed-user',
  },
];

const patchChecks = [
  {
    label: 'mock payment completion',
    path: '/payments/payment_probe_mock_paid/mock-paid',
  },
];

const closedPostChecks = [
  {
    label: 'public reward review create',
    path: '/public/reward-reviews',
    acceptedStatuses: [401, 404],
    body: {
      userId: 'client-claimed-user',
      workId: 'work_closed_boundary_probe',
      amount: 20,
      reason: 'anonymous reward review must stay closed',
    },
  },
];

for (const check of checks) {
  const response = await fetch(`${base}${check.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(check.body),
  });
  const text = await response.text();
  if (response.status !== 401) {
    throw new Error(`Expected unauthenticated ${check.label} to fail with 401, got ${response.status}: ${text}`);
  }
}

for (const check of getChecks) {
  const response = await fetch(`${base}${check.path}`);
  const text = await response.text();
  if (response.status !== 401) {
    throw new Error(`Expected unauthenticated ${check.label} to fail with 401, got ${response.status}: ${text}`);
  }
}

for (const check of patchChecks) {
  const response = await fetch(`${base}${check.path}`, {
    method: 'PATCH',
  });
  const text = await response.text();
  if (response.status !== 401) {
    throw new Error(`Expected unauthenticated ${check.label} to fail with 401, got ${response.status}: ${text}`);
  }
}

for (const check of closedPostChecks) {
  const response = await fetch(`${base}${check.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(check.body),
  });
  const text = await response.text();
  if (!check.acceptedStatuses.includes(response.status)) {
    throw new Error(
      `Expected unauthenticated ${check.label} to stay closed with ${check.acceptedStatuses.join(' or ')}, got ${response.status}: ${text}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: [
        ...checks.map((check) => check.label),
        ...getChecks.map((check) => check.label),
        ...patchChecks.map((check) => check.label),
        ...closedPostChecks.map((check) => check.label),
      ],
    },
    null,
    2,
  ),
);
