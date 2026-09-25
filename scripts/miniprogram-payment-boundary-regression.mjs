import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const quotesJs = readText('apps/miniprogram/pages/quotes/quotes.js');
const appJs = readText('apps/miniprogram/app.js');

assert(
  quotesJs.includes("if (paymentMode !== 'intent' && paymentMode !== 'wechat')"),
  'quotes page must block only unsupported payment modes before quote confirmation',
);
assert(
  !quotesJs.includes("if (app.globalData.paymentMode !== 'intent')"),
  'quotes page must not block the real wechat payment mode before reaching requestPayment',
);
assert(quotesJs.includes('支付功能准备中'), 'quotes page must explain that real WeChat Pay is not live yet');
assert(quotesJs.includes('已确认报价意向'), 'quotes page must keep quote-intent confirmation as the current transaction path');
assert(quotesJs.includes('/payments'), 'mini-program quote flow must prepare a real payment request path for wechat mode');
assert(quotesJs.includes('wx.requestPayment'), 'mini-program quote flow must wire wx.requestPayment for real WeChat Pay mode');
assert(quotesJs.includes('/payments/'), 'mini-program quote flow must be able to sync payment state after requestPayment');
assert(!quotesJs.includes('/mock-paid'), 'mini-program quote flow must not trigger mock-paid from the client');
assert(!quotesJs.includes('支付成功'), 'mini-program quote flow must not present fake payment success');
assert(quotesJs.includes('支付结果确认中'), 'mini-program quote flow must show post-payment confirmation instead of fake success');
assert(appJs.includes('refreshRuntimeConfig()'), 'mini-program app must refresh runtime config from public health');
assert(
  appJs.includes("health.paymentProvider === 'wechat' && health.wechatPayConfigured === true"),
  'mini-program app must be able to switch payment mode to real wechat based on live runtime health',
);
assert(
  appJs.includes("url: `${this.globalData.apiBase}/health`"),
  'mini-program app must fetch public /health to learn runtime payment readiness',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'miniprogram-payment-boundary'
    },
    null,
    2,
  ),
);
