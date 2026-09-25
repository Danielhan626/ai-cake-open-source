import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const designWxml = readText('apps/miniprogram/pages/design/design.wxml');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const creditUtils = readText('apps/miniprogram/utils/creation-credits.js');
const apiUtils = readText('apps/miniprogram/utils/api.js');
const worksService = readText('apps/api/src/works/works.service.ts');

assert(resultJs.includes('syncCreationCredits'), 'result page must sync creation credit summary');
assert(resultJs.includes('rechargeCreationCredits'), 'result page must invoke creation credit recharge flow');
assert(resultJs.includes('isCreationCreditInsufficientError'), 'result page must branch on insufficient creation credit errors');
assert(resultJs.includes("rechargeMode: app.globalData.paymentMode === 'wechat' ? 'login-required' : 'disabled'"), 'result page must not show logged-out users as immediately recharge-enabled');
assert(resultJs.includes("title: '登录后充值积分'"), 'result recharge flow must route logged-out users through WeChat login first');
assert(resultJs.includes('preserveRechargeForAuth'), 'result recharge flow must preserve recharge intent before login');
assert(resultJs.includes("consumePendingAuthDraft('creation-credit-recharge')"), 'result recharge flow must restore recharge intent after auth return');
assert(resultWxml.includes('创作积分充值'), 'result page must expose creation credit recharge panel');
assert(!resultWxml.includes('证书与支付公钥材料补齐后'), 'result recharge copy must not expose stale merchant-material blocker text');
assert(resultWxml.includes('登录后显示可选充值档位'), 'result recharge panel must explain the logged-out package state');
assert(resultWxml.includes('creditSummary.rechargeStatusText'), 'result recharge panel must bind runtime-aware recharge status copy');
assert(resultWxml.includes('creditSummary.rechargeActionText'), 'result recharge button must bind runtime-aware action copy');
assert(resultWxml.includes('继续微调设计'), 'result page must keep refine entry visible');
assert(designJs.includes('refreshCreationCreditSummary'), 'design page must read creation credit summary');
assert(designJs.includes('creationGenerationCost'), 'design page must track paid base-generation cost after free quota is used');
assert(designJs.includes('免费已用完，继续生成消耗'), 'design page must explain paid generation after the free quota is used');
assert(designJs.includes("prompt: ''"), 'design page must keep manual prompt fields empty by default');
assert(designWxml.includes('创作积分'), 'design page must show creation credit status');
assert(designWxml.includes('例如：送给女朋友的粉色蝴蝶结生日蛋糕'), 'design page must keep prompt examples in placeholder text');
assert(resultJs.includes("address: ''"), 'result demand address should start empty');
assert(!resultJs.includes('详细地址待确认'), 'result demand address must not force users to delete sample text first');
assert(mineJs.includes('creationCreditBalance'), 'mine page must track creation credit balance');
assert(mineWxml.includes('创作积分'), 'mine page must expose creation credit copy');
assert(!mineWxml.includes('充值功能会在真实支付材料齐全后开启'), 'mine page must not show stale pre-payment-material copy');
assert(!mineWxml.includes('积分不足时可在结果页充值'), 'mine page must not bury the recharge path behind the result page');
assert(mineWxml.includes('轻量补给'), 'mine page must expose the low-value recharge pack directly');
assert(mineWxml.includes('¥6'), 'mine page must show the low-value recharge amount directly');
assert(mineWxml.includes('bindtap="submitMineRecharge"'), 'mine page must provide a direct recharge button');
assert(mineJs.includes('rechargeCreationCredits'), 'mine page must invoke the creation credit recharge flow directly');
assert(mineJs.includes("selectedCreationRechargeProductId: 'credit_pack_60'"), 'mine page must default to the smoke-test recharge pack');
assert(mineJs.includes("rechargeCreationCredits(this.data.selectedCreationRechargeProductId || 'credit_pack_60')"), 'mine page direct recharge must use the selected smoke-test pack');
assert(creditUtils.includes('/creation-credits/recharge-orders'), 'creation credit util must call recharge order endpoints');
assert(creditUtils.includes('wx.requestPayment'), 'creation credit util must support WeChat pay request flow');
assert(apiUtils.includes('Creation credit balance is not enough'), 'api utils must translate insufficient creation credit errors');
assert(apiUtils.includes('继续生成/微调'), 'insufficient credit copy must apply to generation as well as refinement');
assert(apiUtils.includes('Daily free generation quota is used'), 'api utils must translate daily generation quota errors');
assert(worksService.includes('refundRefineCredits'), 'works service must refund creation credits when refine fails');
assert(worksService.includes('reserveGenerationAllowance'), 'works service must allow paid generation after daily free quota');
assert(worksService.includes('refundGenerationCredits'), 'works service must refund paid generation credits when generation fails');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-creation-credit',
    },
    null,
    2,
  ),
);
