import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const promptTemplate = readText('apps/api/src/ai/prompt-template.ts');
const appTypes = readText('apps/api/src/app.types.ts');
const demandService = readText('apps/api/src/demands/demands.service.ts');
const quoteService = readText('apps/api/src/quotes/quotes.service.ts');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const demandWxml = readText('apps/miniprogram/pages/demand/demand.wxml');
const demandWxss = readText('apps/miniprogram/pages/demand/demand.wxss');
const quoteJs = readText('apps/miniprogram/pages/quotes/quotes.js');
const quoteWxml = readText('apps/miniprogram/pages/quotes/quotes.wxml');
const quoteWxss = readText('apps/miniprogram/pages/quotes/quotes.wxss');
const ordersJs = readText('apps/miniprogram/pages/orders/orders.js');
const ordersWxml = readText('apps/miniprogram/pages/orders/orders.wxml');
const homeWxml = readText('apps/miniprogram/pages/home/home.wxml');
const packageJson = JSON.parse(readText('package.json'));

assert(
  promptTemplate.includes('平台不替代蛋糕师判断最终可制作性'),
  'prompt must state that the platform does not decide final makeability',
);
assert(
  promptTemplate.includes('制作沟通等级'),
  'prompt must produce a makeability communication level instead of a hard pass/fail',
);
assert(
  !promptTemplate.includes('不适合落地制作的幻想材料'),
  'prompt must not suppress creator imagination with hard fantasy-material bans',
);
assert(
  !promptTemplate.includes('无法制作的细节'),
  'production profile must not pre-judge details as impossible',
);

assert(
  appTypes.includes("export type ProductionCommunicationLevel = 'standard' | 'discuss' | 'challenge' | 'concept'"),
  'app types must define production communication levels',
);
assert(
  appTypes.includes("export type QuoteDecision = 'as_designed' | 'with_adjustments' | 'decline'"),
  'app types must define baker quote decisions',
);
assert(demandService.includes('productionLevel'), 'demands must persist productionLevel');
assert(demandService.includes('mustKeep'), 'demands must persist mustKeep notes');
assert(demandService.includes('canAdjust'), 'demands must persist canAdjust notes');
for (const token of ['deliveryWindow', 'cakeSize', 'flavor', 'recipientNote', 'productionNoticeAccepted']) {
  assert(demandService.includes(token), `demands must persist ${token}`);
}
assert(
  demandService.includes('平台不裁决能否制作，最终由蛋糕师报价和接单判断'),
  'demand defaults must explain that baker quote decides production',
);

assert(quoteService.includes('decision'), 'quotes must persist baker quote decision');
assert(
  quoteService.includes('if (quote.decision ==='),
  'quote service must branch behavior by quote decision',
);
assert(
  quoteService.includes('暂不接单'),
  'quote service must support decline decision copy',
);
for (const token of ['restorationLevel', 'deliveryWindow', 'scheduledDeliverySupported', 'changeDeadline', 'cancelPolicy', 'signoffNote']) {
  assert(quoteService.includes(token), `quotes must persist ${token}`);
}

for (const token of ['productionLevelOptions', 'mustKeep', 'canAdjust', '制作沟通等级']) {
  assert(resultJs.includes(token) || resultWxml.includes(token), `result page must include ${token}`);
  assert(demandJs.includes(token) || demandWxml.includes(token), `demand page must include ${token}`);
}
for (const token of ['真实制作说明', 'AI 图是设计参考', '装饰可能不可食用', '冷藏保存', 'productionNoticeAccepted', 'deliveryWindow', 'recipientNote']) {
  assert(resultJs.includes(token) || resultWxml.includes(token), `result page must include ${token}`);
  assert(demandJs.includes(token) || demandWxml.includes(token), `demand page must include ${token}`);
}

assert(demandJs.includes("address: ''"), 'same-style demand address must start empty');
assert(!demandJs.includes('详细地址待确认'), 'same-style demand flow must not auto-fill placeholder address text');
assert(!demandJs.includes('保留主体创意、主色和最有记忆点的装饰。'), 'same-style demand must-keep field must not be prefilled');
assert(!demandJs.includes('尺寸、材料、支撑结构和局部装饰都可以和蛋糕师沟通调整。'), 'same-style demand can-adjust field must not be prefilled');
assert(!demandJs.includes('我想做同款「${work.title}」'), 'same-style demand description must not be prefilled for the user');
assert(!demandWxml.includes('field-hint'), 'same-style demand page should remove extra helper copy under production level');
assert(demandWxml.includes('demand-loop'), 'same-style demand page must show the review-to-quote loop');
assert(demandWxml.includes('trust-list'), 'same-style demand page must explain why the quote loop is trustworthy');
assert(demandWxml.includes('form-step-title'), 'same-style demand page must separate required fields from optional preferences');
assert(demandWxml.includes('toggleDemandDetails'), 'same-style demand page must collapse optional production preferences');
assert(demandJs.includes('pendingQuoteDemandId') && demandJs.includes('pendingQuoteBakerId'), 'quote auth resume must validate its original demand and baker');
assert(!demandJs.includes('/bakers?city='), 'buyer demand detail must not display an arbitrary first baker before matching');
assert(demandWxml.includes("demand.status === 'reviewing'"), 'buyer demand page must render an approval state');
assert(demandWxml.includes("demand.status === 'quoting'"), 'buyer demand page must render a quote-waiting state');
assert(demandWxml.includes("demand.status === 'selected'"), 'buyer demand page must render a selected-quote state');
assert(!demandWxml.includes('推荐蛋糕师'), 'demand page must not imply platform assignment before quote selection');
assert(demandWxml.includes('提交审核，等待师傅报价'), 'demand submit CTA must explain the next commercial stage');
assert(demandWxss.includes('.demand-loop text.active'), 'same-style demand loop must support highlighting the current stage');
assert(quoteWxml.includes('quote-loop'), 'quote page must show the quote-to-fulfillment loop');
assert(quoteJs.includes('buildQuoteSummary'), 'quote page must derive a summary from demand and baker context');
assert(quoteJs.includes('buildQuoteRuleCards'), 'quote page must derive quote certainty rules');
assert(quoteJs.includes('buildQuoteNextStep'), 'quote page must explain the next state from the current quote');
assert(quoteWxml.includes('quote-summary'), 'quote page must render a compact demand and baker summary');
assert(quoteWxml.includes('quote-rules'), 'quote page must render quote certainty rules');
assert(quoteWxml.includes('quote-bridge'), 'quote page must explain the bridge from quote selection to fulfillment');
assert(quoteWxml.includes('暂无可确认报价'), 'quote empty state must be written for the buyer journey');
assert(quoteJs.includes('goDemand'), 'quote empty state must route back to the current demand');
assert(quoteWxss.includes('.quote-summary') && quoteWxss.includes('.quote-bridge'), 'quote page must style the new summary and trust bridge');

for (const token of ['quoteDecisionOptions', '按图接近制作', '建议调整后制作', '暂不接单']) {
  assert(demandJs.includes(token) || demandWxml.includes(token) || quoteWxml.includes(token), `quote UI must include ${token}`);
}
for (const token of ['可还原程度', '定时配送', '改单截止', '取消规则', '签收提醒']) {
  assert(demandJs.includes(token) || demandWxml.includes(token) || quoteJs.includes(token) || quoteWxml.includes(token), `quote UI must include ${token}`);
}

assert(ordersJs.includes('buildOrderRuleCards'), 'orders page must derive order rule cards');
assert(ordersWxml.includes('订单规则'), 'orders page must render the order rules panel');
for (const token of ['改信息', '取消', '签收', '售后']) {
  assert(ordersJs.includes(token) || ordersWxml.includes(token), `orders page must include ${token}`);
}

assert(homeWxml.includes('做同款前，先把确定性说清楚'), 'home must expose the lightweight production-trust entry');
assert(homeWxml.includes('订单保留改信息、取消、签收和售后规则'), 'home trust entry must mention order rules');

assert(
  packageJson.scripts['miniprogram:production-communication-regression'] ===
    'node scripts/miniprogram-production-communication-regression.mjs',
  'package scripts must expose miniprogram:production-communication-regression',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'production-communication-boundary',
    },
    null,
    2,
  ),
);
