const base = process.env.API_BASE || 'http://localhost:4000';
const runId = Date.now().toString(36);

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectFailure(path, options, matcher) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options && options.headers ? options.headers : {}),
    },
  });
  const text = await response.text();
  if (response.ok) {
    throw new Error(`Expected failure for ${path}`);
  }
  if (!matcher.test(text)) {
    throw new Error(`Unexpected failure payload for ${path}: ${text}`);
  }
}

const session = await request('/auth/dev-login', {
  method: 'POST',
  body: JSON.stringify({
    userId: `credit-user-${runId}`,
    nickname: '积分回归用户',
    city: '长治',
  }),
});

assert(session && session.token, 'dev login must return bearer token');
const authHeaders = {
  Authorization: `Bearer ${session.token}`,
};

const summaryBefore = await request('/creation-credits/summary', {
  headers: authHeaders,
});
assert(summaryBefore.wallet.creationCreditBalance === 0, 'new user should start with 0 creation credits');
assert(summaryBefore.dailyFreeGenerationRemaining === 1, 'new user should have one free generation');

const checkIn = await request('/interactions/check-in', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({}),
});
assert(checkIn.creationCreditDelta === 10, 'check-in should grant 10 creation credits');
assert(checkIn.wallet.creationCreditBalance === 10, 'wallet should reflect the check-in credit grant');

const generated = await request('/works/generate', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    title: '生日 · 韩系奶油风',
    prompt: '送给朋友的白绿鲜果生日蛋糕',
    scenario: '生日',
    style: '韩系奶油风',
    color: '白绿',
    size: '6寸',
    budget: '200-399元',
  }),
});
assert(generated.work && generated.work.id, 'generation should return a work');

const summaryAfterGenerate = await request('/creation-credits/summary', {
  headers: authHeaders,
});
assert(summaryAfterGenerate.dailyFreeGenerationRemaining === 0, 'free generation should be consumed after first generation');

const paidGenerated = await request('/works/generate', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    title: '生日 · 韩系奶油风',
    prompt: '免费次数用完后继续使用创作积分生成',
    scenario: '生日',
    style: '韩系奶油风',
    color: '粉色',
    size: '6寸',
    budget: '200-399元',
  }),
});
assert(paidGenerated.work && paidGenerated.work.id, 'generation should continue after free quota with credits');
assert(paidGenerated.wallet.creationCreditBalance === 5, 'paid base generation should deduct 5 creation credits');

const summaryAfterPaidGenerate = await request('/creation-credits/summary', {
  headers: authHeaders,
});
assert(summaryAfterPaidGenerate.dailyFreeGenerationRemaining === 0, 'free generation should remain consumed');
assert(summaryAfterPaidGenerate.wallet.creationCreditBalance === 5, 'paid generation balance should be visible in summary');

const refined = await request(`/works/${generated.work.id}/refine`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    refinement: '奶油边更轻一点，水果更整齐',
  }),
});
assert(refined.work && refined.work.id, 'refine should return a new work');
assert(refined.wallet.creationCreditBalance === 0, 'successful refine should deduct the remaining 5 creation credits');
assert(refined.refineCost === 5, 'refine response should expose refine cost');

await expectFailure(
  '/works/generate',
  {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: '生日 · 韩系奶油风',
      prompt: '积分耗尽后不应继续生成',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元',
    }),
  },
  /Creation credit balance is not enough/,
);

const rechargeOrder = await request('/creation-credits/recharge-orders', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    productId: 'credit_pack_60',
  }),
});
assert(rechargeOrder.provider === 'mock', 'development recharge should use mock provider');

const paidRecharge = await request(`/creation-credits/recharge-orders/${rechargeOrder.id}/mock-paid`, {
  method: 'PATCH',
  headers: authHeaders,
});
assert(paidRecharge.status === 'paid', 'mock recharge should become paid');

const summaryAfterRecharge = await request('/creation-credits/summary', {
  headers: authHeaders,
});
assert(summaryAfterRecharge.wallet.creationCreditBalance === 60, 'recharge should add purchased credits after generation and refine deductions');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      workId: generated.work.id,
      paidGeneratedWorkId: paidGenerated.work.id,
      refinedWorkId: refined.work.id,
      creationCreditBalance: summaryAfterRecharge.wallet.creationCreditBalance,
      rechargeOrderId: rechargeOrder.id,
    },
    null,
    2,
  ),
);
