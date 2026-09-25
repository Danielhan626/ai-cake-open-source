import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function exists(path) {
  return existsSync(new URL(`../${path}`, import.meta.url));
}

const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function assertNo(source, forbidden, label) {
  for (const item of forbidden) {
    assert(!source.includes(item), `${label} must not contain "${item}"`);
  }
}

const packageJson = JSON.parse(readText('package.json'));
const authUtilPath = 'apps/miniprogram/utils/auth.js';
const appJs = readText('apps/miniprogram/app.js');
const apiJs = readText('apps/miniprogram/utils/api.js');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const homeJs = readText('apps/miniprogram/pages/home/home.js');
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const worksJs = readText('apps/miniprogram/pages/works/works.js');
const workDetailJs = readText('apps/miniprogram/pages/work-detail/work-detail.js');
const ordersJs = readText('apps/miniprogram/pages/orders/orders.js');
const ordersWxml = readText('apps/miniprogram/pages/orders/orders.wxml');
const quotesJs = readText('apps/miniprogram/pages/quotes/quotes.js');
const onboardingJs = readText('apps/miniprogram/pages/onboarding/onboarding.js');
const supportJs = readText('apps/miniprogram/pages/support/support.js');

assert(
  packageJson.scripts['miniprogram:commercial-auth-regression'] === 'node scripts/miniprogram-commercial-auth-regression.mjs',
  'package scripts must expose miniprogram:commercial-auth-regression',
);

assert(exists(authUtilPath), 'mini-program must have a shared commercial auth helper');
if (exists(authUtilPath)) {
  const authUtil = readText(authUtilPath);
  assert(authUtil.includes('promptLoginRequired'), 'auth helper must export promptLoginRequired');
  assert(authUtil.includes('saveLoginReturn'), 'auth helper must export saveLoginReturn');
  assert(authUtil.includes('ensureCommercialContact'), 'auth helper must export commercial phone-binding guard');
}
assert(!appJs.includes("userId: 'demo-user'"), 'app global data must not default every visitor to demo-user');
assert(appJs.includes('loadOrCreateVisitorId'), 'app must create a persistent visitor id before real login');
assert(appJs.includes('authSessionStorageKey'), 'app must persist an auth session storage key');
assert(appJs.includes('restoreAuthSession'), 'app must restore stored auth session on launch');
assert(appJs.includes('setAuthenticatedSession'), 'app must centralize authenticated session updates');
assert(appJs.includes('clearAuthSession'), 'app must clear expired auth sessions');
assert(appJs.includes('resetCommercialSessionState'), 'app must reset private commercial workbench state when auth changes');
assert(appJs.includes('currentDemand: null'), 'app must initialize private demand state explicitly');
assert(appJs.includes('currentQuote: null'), 'app must initialize private quote state explicitly');
assert(appJs.includes('currentPayment: null'), 'app must initialize private payment state explicitly');
assert(appJs.includes('completedTaskCount: 0'), 'app must initialize completed task count explicitly');
assert(appJs.includes('this.globalData.roseBalance = 0'), 'app auth reset must clear rose balance');
assert(appJs.includes('this.globalData.rewardWallet = {'), 'app auth reset must clear reward wallet');
assert(appJs.includes('this.globalData.currentOrder = null'), 'app auth reset must clear cached private order state');
assert(appJs.includes('pendingAuthDrafts'), 'app must keep pending auth drafts for interrupted commercial forms');
assert(appJs.includes('setPendingAuthDraft'), 'app must save interrupted commercial drafts before auth redirects');
assert(appJs.includes('consumePendingAuthDraft'), 'app must restore interrupted commercial drafts after auth returns');

assert(mineJs.includes("loginStatus: '未登录'"), 'Mine logged-out status must initialize as 未登录');
assert(!/loginStatus:\s*app\.globalData\.currentUser\s*\?[\s\S]*?:\s*'体验模式'/.test(mineJs), 'Mine logged-out status must not render as 体验模式');
assert(mineJs.includes('canBindPhone'), 'Mine page must expose canBindPhone state');
assert(mineJs.includes('phoneBound'), 'Mine page must expose whether the phone is already bound');
assert(mineJs.includes('authStepSummary'), 'Mine page must show the current account-binding step');
assert(mineJs.includes('showPhoneLoginPrerequisite'), 'Mine page must explain phone binding prerequisite before requesting phone authorization');
assert(mineJs.includes('当前入口没有返回手机号授权 code'), 'Mine page must explain missing phone-authorization code clearly');
assert(!mineJs.includes('最新体验版或审核版'), 'Mine phone authorization error copy must not frame the product as an experience build');
assert(mineJs.includes('promptPhoneAfterWechatLogin'), 'Mine page must keep phone-binding intent after a prerequisite WeChat login');
assert(mineJs.includes('resetPrivateWorkbenchState'), 'Mine page must be able to clear private workbench state when logged out');
assert(mineJs.includes("request('/interactions/summary')"), 'Mine page must use bearer-auth interaction summary requests');
assert(!mineJs.includes("/interactions/summary?userId="), 'Mine page must not request interaction summary with a guest fallback userId');
assert(mineJs.includes("request('/design-tasks/today')"), 'Mine page must use bearer-auth task summary requests');
assert(!mineJs.includes("/design-tasks/today?userId="), 'Mine page must not request task summary with a guest fallback userId');
assert(mineJs.includes('showBakerWorkbench'), 'Mine page must separate logged-out, onboarding, and active baker states');
assert(appJs.includes('shouldPreserveMineAuthReturn'), 'app must preserve Mine-page auth intent when phone binding is required');
assert(
  mineWxml.includes('wx:elif="{{canBindPhone}}"') || mineWxml.includes('wx:if="{{canBindPhone}}"'),
  'phone authorization button must only render after WeChat login',
);
assert(mineWxml.includes('手机号已绑定'), 'Mine page must distinguish already-bound phone state');
assert(mineWxml.includes('authStepSummary'), 'Mine account panel must render the current auth step');
assert(mineWxml.includes("{{canBindPhone ? '微信已登录' : '微信一键登录'}}"), 'Mine account panel must not show the WeChat login button as repeatable after login');
assert(mineWxml.includes('继续绑定手机号'), 'Mine account panel must present phone binding as the next step after WeChat login');
assert(mineWxml.includes('bindtap="showPhoneLoginPrerequisite"'), 'logged-out phone action must explain the WeChat-login prerequisite');
assert(mineWxml.includes('登录后解锁玩家工作台'), 'Mine page must collapse the player workbench before login');
assert(mineWxml.includes('登录后开启师傅工作台'), 'Mine page must collapse the baker workbench before login');
assert(mineWxml.includes('先完善师傅入驻'), 'Mine page must show a dedicated onboarding state before baker workbench data exists');
assert(mineJs.includes('if (!result.code)'), 'wx.login success without code must be handled before backend request');
assert(mineJs.includes('resumePendingLoginReturn'), 'Mine must resume pending login return after account binding');
assert(mineJs.includes('resumeMineActionAfterLogin'), 'Mine must resume same-page auth actions after account binding');
assert(mineJs.includes('peekPendingLoginReturn'), 'Mine must inspect pending return requirements after WeChat login');
assert(mineJs.includes("pending.action === 'check-in'"), 'Mine must resume check-in intent after login on the same page');
assert(mineJs.includes('preserveBakerFulfillmentForAuth'), 'Mine must preserve interrupted baker fulfillment updates before login');
assert(mineJs.includes('resumePendingBakerFulfillment'), 'Mine must resume interrupted baker fulfillment updates after login');
assert(mineJs.includes("consumePendingAuthDraft('baker-fulfillment')"), 'Mine must restore pending baker fulfillment intent after auth return');
assert(mineJs.includes("beforeLogin: () => this.preserveBakerFulfillmentForAuth(orderId, status)"), 'Mine baker fulfillment login CTA must save the interrupted order/status before switching to Mine');
assert(mineJs.includes("pending.action === 'baker-fulfillment'"), 'Mine must route baker fulfillment intent through same-page auth resume');
assert(
  mineJs.includes('还差一步手机号授权') && mineJs.includes('完成后会继续刚才的订单、报价或入驻操作'),
  'Mine must hold return-path resume until phone binding is complete when required',
);
assert(mineWxml.includes('historyStatusLabel'), 'Mine history panel must distinguish sync state instead of always showing 已同步');
assert(mineWxml.includes('bakerOrdersStatusLabel'), 'Mine baker orders panel must distinguish sync state instead of always showing 已同步');
assert(designJs.includes('setPendingLoginReturn') || designJs.includes('saveLoginReturn'), 'Design page must save return route before login');
assert(designJs.includes('preserveDesignDraftForAuth'), 'Design page must preserve the current design draft before login redirect');
assert(designJs.includes("consumePendingAuthDraft('design-generate')"), 'Design page must restore the interrupted design draft after auth return');
assert(designJs.includes("this.preserveDesignDraftForAuth('design-generate')"), 'Design generate login CTA must save the current draft before switching to Mine');

assertNo(apiJs, ['体验版微信登录配置未完成', '体验模式继续'], 'API auth error copy');
assert(apiJs.includes('Session is invalid or expired'), 'API auth messages must recognize expired sessions');
assert(apiJs.includes('clearAuthSession'), 'API request helper must clear stored auth sessions on 401');
assert(apiJs.includes('WeChat login failed'), 'API auth messages must recognize upstream WeChat login failures');
assert(apiJs.includes('WeChat phone login failed'), 'API auth messages must recognize upstream WeChat phone-login failures');
assert(apiJs.includes('code been used') || apiJs.includes('invalid code'), 'API auth messages must recognize reused or invalid phone codes');
assert(apiJs.includes('手机号授权已失效或已被使用'), 'API auth messages must explain reused/expired phone authorization codes clearly');
assert(apiJs.includes('微信服务暂时繁忙') || apiJs.includes('微信登录暂时没有成功'), 'API auth messages must turn raw WeChat login failures into user-facing guidance');
assertNo(mineJs, ['体验版可先手动填写联系方式', '体验模式继续体验'], 'Mine auth copy');
assertNo(mineWxml, ['体验模式'], 'Mine account-login panel copy');
assert(demandJs.includes('ensureCommercialContact'), 'Demand page must require a bound phone for commercial demand publishing');
assert(demandJs.includes('preserveDraftDemandForAuth'), 'Demand page must preserve publish-draft form state before auth redirects');
assert(demandJs.includes("consumePendingAuthDraft('publish-draft-demand')"), 'Demand page must restore publish-draft form state after auth returns');
assert(demandJs.includes('preserveQuoteForAuth'), 'Demand page must preserve quote form state before auth redirects');
assert(demandJs.includes("consumePendingAuthDraft('create-quote')"), 'Demand page must restore quote form state after auth returns');
assert(demandJs.includes('resumePendingQuoteSubmission'), 'Demand page must resume quote submission intent after auth return');
assert(demandJs.includes('pendingQuoteAction'), 'Demand page must track pending quote submission action separately from restored quote form state');
assert(resultJs.includes('ensureCommercialContact'), 'Result page must require a bound phone for commercial demand publishing');
assert(resultJs.includes('preserveDemandForAuth'), 'Result page must preserve publish-demand form state before auth redirects');
assert(resultJs.includes("consumePendingAuthDraft('publish-demand')"), 'Result page must restore publish-demand form state after auth returns');
assert(resultJs.includes('preserveRefineForAuth'), 'Result page must preserve refine-note state before auth redirects');
assert(resultJs.includes("consumePendingAuthDraft('work-refine')"), 'Result page must restore refine-note state after auth returns');
assert(resultJs.includes("this.preserveRefineForAuth('work-refine')"), 'Result page refine login CTA must save the current refine note before switching to Mine');
assert(worksJs.includes('preserveGalleryActionForAuth'), 'Works gallery must preserve interrupted interaction intent before login');
assert(worksJs.includes('resumePendingGalleryAction'), 'Works gallery must resume pending interaction intent after login');
assert(worksJs.includes("consumePendingAuthDraft('work-gallery-interaction')"), 'Works gallery must restore pending interaction intent after auth return');
assert(workDetailJs.includes('preserveDetailActionForAuth'), 'Work detail must preserve interrupted interaction intent before login');
assert(workDetailJs.includes('resumePendingDetailAction'), 'Work detail must resume pending interaction intent after login');
assert(workDetailJs.includes("consumePendingAuthDraft('work-detail-interaction')"), 'Work detail must restore pending interaction intent after auth return');
assert(resultJs.includes('preserveResultInteractionForAuth'), 'Result page must preserve interrupted interaction intent before login');
assert(resultJs.includes('resumePendingResultInteraction'), 'Result page must resume pending interaction intent after login');
assert(resultJs.includes("consumePendingAuthDraft('result-interaction')"), 'Result page must restore pending interaction intent after auth return');
assert(
  resultJs.includes('preserveReviewLikeForAuth') && resultJs.includes('beforeLogin: () => this.preserveReviewLikeForAuth(botId)'),
  'Result page review-like login CTA must save the interrupted interaction before switching to Mine',
);
assert(
  resultJs.includes("beforeLogin: () => this.preserveResultInteractionForAuth('publish-work'"),
  'Result page publish-work login CTA must save the interrupted publish intent before switching to Mine',
);
assert(resultJs.includes("pending.action === 'review-like'"), 'Result page must resume review-like intent after auth return');
assert(resultJs.includes("pending.action === 'publish-work'"), 'Result page must resume publish-work intent after auth return');
assert(ordersJs.includes('ensureCommercialContact'), 'Orders page must require a bound phone for refund submission');
assert(ordersJs.includes('preserveRefundForAuth'), 'Orders page must preserve refund form state before auth redirects');
assert(ordersJs.includes('resumePendingRefundAction'), 'Orders page must resume refund submission intent after auth returns');
assert(ordersJs.includes('pendingRefundAction'), 'Orders page must track pending refund action separately from restored form state');
assert(ordersJs.includes('appendRefundEvidenceImages'), 'Orders page must append uploaded refund evidence immediately');
assert(ordersJs.includes("consumePendingAuthDraft('request-refund')"), 'Orders page must restore refund form state after auth returns');
assert(ordersJs.includes("consumePendingAuthDraft('upload-refund-evidence')"), 'Orders page must restore refund evidence form state after auth returns');
assert(ordersJs.includes('requiresLogin'), 'Orders page must track explicit login-required state');
assert(ordersJs.includes("action: 'view-orders'"), 'Orders page login CTA must preserve return to the orders page');
assert(quotesJs.includes('ensureCommercialContact'), 'Quote confirmation must require a bound phone');
assert(quotesJs.includes('preserveQuoteSelectionForAuth'), 'Quote confirmation must preserve interrupted quote-selection intent before auth redirects');
assert(quotesJs.includes('resumePendingQuoteSelection'), 'Quote confirmation must resume quote-selection intent after auth returns');
assert(quotesJs.includes("consumePendingAuthDraft('select-quote')"), 'Quote confirmation must restore quote-selection intent after auth return');
assert(onboardingJs.includes('preserveOnboardingForAuth'), 'Onboarding page must preserve merchant form state before auth redirects');
assert(onboardingJs.includes('ensureCommercialContact'), 'Onboarding page must require a formal account before merchant onboarding actions');
assert(onboardingJs.includes("consumePendingAuthDraft('submit-baker-application')"), 'Onboarding page must restore merchant form state after auth returns');
assert(onboardingJs.includes('resumePendingOnboardingAction'), 'Onboarding page must resume merchant submission intent after auth return');
assert(onboardingJs.includes('pendingOnboardingAction'), 'Onboarding page must track pending merchant submission action separately from restored form state');
assert(onboardingJs.includes("action: 'upload-baker-credential'"), 'Onboarding page must preserve credential-upload intent across auth redirects');
assert(supportJs.includes('preserveSupportForAuth'), 'Support page must preserve support form state before auth redirects during evidence upload');
assert(supportJs.includes('appendSupportEvidenceImages'), 'Support page must append uploaded evidence immediately');
assert(supportJs.includes("consumePendingAuthDraft('upload-support-evidence')"), 'Support page must restore support form state after login return for evidence upload');
assert(supportJs.includes("this.preserveSupportForAuth('upload-support-evidence')"), 'Support page must save the current support form before redirecting to login from evidence upload');
assert(supportJs.includes('showFormalRefundGuide'), 'Support page must separate formal refund handling from the public support-ticket entry');
assert(supportJs.includes("this.data.mode === 'refund'") || supportJs.includes("this.data.typeText === '退款协商'"), 'Support page must intercept refund-mode submissions before posting a public support ticket');
assert(supportJs.includes("consumePendingAuthDraft('submit-support-ticket')"), 'Support page must preserve submit-support intent when redirecting away from refund mode');
assert(ordersWxml.includes("orderSource === 'cached-server'"), 'Orders UI must distinguish cached server snapshots from fresh server orders');
assert(ordersWxml.includes('去登录查看订单'), 'Orders UI must offer a direct login CTA when the page is auth-blocked');
assert(ordersWxml.includes("wx:elif=\"{{requiresLogin}}\""), 'Orders UI must show a dedicated auth-blocked state before the generic empty state');

const loginRequiredPages = [
  ['home page task join', homeJs],
  ['design page task join/generate', designJs],
  ['works gallery interactions', worksJs],
  ['work detail interactions', workDetailJs],
  ['result page writes', resultJs],
  ['demand page writes', demandJs],
  ['quote confirmation writes', quotesJs],
  ['orders/refund writes', ordersJs],
  ['baker onboarding writes', onboardingJs],
];

for (const [label, source] of loginRequiredPages) {
  assert(source.includes('promptLoginRequired'), `${label} must route authorization failures to login`);
}

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        gate: 'miniprogram-commercial-auth',
        failures,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-commercial-auth',
      checkedPages: loginRequiredPages.length,
    },
    null,
    2,
  ),
);
