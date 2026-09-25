import assert from 'node:assert/strict';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4000';

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

const expectedOrder = [
  'deepseek',
  'qwen',
  'doubao',
  'wenxin',
  'hunyuan',
  'xinghuo',
];

const result = await request('/bot-reviews/work', {
  method: 'POST',
  body: JSON.stringify({
    workId: `bot-review-${Date.now().toString(36)}`,
    title: '世界杯鲜果观赛蛋糕',
    prompt: '绿色草坪感，水果围边，顶部有足球元素和短祝福牌，适合朋友聚会。',
    imageUrl: 'https://example.com/cake-world-cup.png',
    scenario: '聚会',
    style: '运动派对',
    color: '绿色',
    size: '6寸',
    budget: '200-399元',
  }),
});

assert.equal(result.provider, 'mock', 'missing review provider key should fall back to mock provider in local regression');
assert(Array.isArray(result.items), 'bot reviews must return items');
assert.equal(result.items.length, expectedOrder.length, 'bot reviews must return all domestic review seats');
assert.deepEqual(
  result.items.map((item) => item.botId),
  expectedOrder,
  'bot reviews must keep the fixed AI comment seat order',
);
assert.equal(new Set(result.items.map((item) => item.focus)).size, result.items.length, 'bot reviews must keep one unique angle per model');

for (const item of result.items) {
  assert(item.name, `${item.botId} must include role display name`);
  assert(!/ChatGPT|GPT|OpenAI|Claude|ComfyUI/.test(item.name), `${item.botId} name must avoid blocked foreign model brands`);
  assert(!/ChatGPT|GPT|OpenAI|Claude|ComfyUI/.test(item.line), `${item.botId} comment must avoid blocked foreign model brands`);
  assert(item.focus, `${item.botId} must include focus`);
  assert(item.line, `${item.botId} must include comment line`);
  assert(item.line.length <= 90, `${item.botId} comment should stay short for mini-program cards`);
  assert(/愿|祝/.test(item.line), `${item.botId} comment must read like a blessing`);
  assert(/奶油|果|花|祝福|蛋糕|果香|主色|摆件|层次|奶香/.test(item.line), `${item.botId} comment must describe cake details`);
  assert(/想来|想试|想画|想跟着|想参加|想参赛|想写自己的蛋糕/.test(item.line), `${item.botId} comment must invite viewers toward creator participation`);
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'api-bot-review-comment-seats',
      provider: result.provider,
      reviewCount: result.items.length,
    },
    null,
    2,
  ),
);
