import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function exists(path) {
  return existsSync(new URL(`../${path}`, import.meta.url));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = JSON.parse(readText('package.json'));
const appJs = readText('apps/miniprogram/app.js');
const authJs = readText('apps/miniprogram/utils/auth.js');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const homeJs = readText('apps/miniprogram/pages/home/home.js');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const worksJs = readText('apps/miniprogram/pages/works/works.js');
const workDetailJs = readText('apps/miniprogram/pages/work-detail/work-detail.js');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const ordersJs = readText('apps/miniprogram/pages/orders/orders.js');
const quotesJs = readText('apps/miniprogram/pages/quotes/quotes.js');

assert(
  packageJson.scripts['miniprogram:login-return-regression'] === 'node scripts/miniprogram-login-return-regression.mjs',
  'package scripts must expose miniprogram:login-return-regression',
);
assert(exists('apps/miniprogram/pages/work-detail/work-detail.js'), 'work-detail page must exist for shared-work login return coverage');

assert(appJs.includes('pendingLoginReturn: null'), 'app must initialize pendingLoginReturn');
assert(appJs.includes('pendingAuthDrafts: {}'), 'app must initialize pendingAuthDrafts');
assert(appJs.includes('pendingChallenge: null'), 'app must initialize pendingChallenge');
assert(appJs.includes('currentDemandDraft: null'), 'app must initialize currentDemandDraft');
assert(appJs.includes('setPendingLoginReturn(options = {})'), 'app must expose setPendingLoginReturn');
assert(appJs.includes('peekPendingLoginReturn()'), 'app must expose peekPendingLoginReturn');
assert(appJs.includes('consumePendingLoginReturn()'), 'app must expose consumePendingLoginReturn');
assert(appJs.includes('setPendingAuthDraft(action, draft)'), 'app must expose setPendingAuthDraft');
assert(appJs.includes('consumePendingAuthDraft(action)'), 'app must expose consumePendingAuthDraft');
assert(appJs.includes('isTabPageUrl(url)'), 'app must expose isTabPageUrl for login return routing');

assert(authJs.includes('saveLoginReturn(options = {})'), 'auth helper must preserve page return before login');
assert(authJs.includes("wx.switchTab({ url: '/pages/mine/mine' })"), 'auth helper must route login through Mine tab');
assert(authJs.includes('goLogin(options = {})'), 'auth helper must expose goLogin');
assert(authJs.includes('promptLoginRequired(error, options = {})'), 'auth helper must expose promptLoginRequired');

assert(mineJs.includes('resumeMineActionAfterLogin(pending)'), 'Mine page must resume same-page auth actions');
assert(mineJs.includes('resumePendingLoginReturn()'), 'Mine page must resume pending page return');
assert(mineJs.includes("pending.action === 'check-in'") || mineJs.includes("if (pending.action === 'check-in')"), 'Mine page must resume check-in after login');
assert(mineJs.includes("pending.action === 'creation-credit-recharge'") || mineJs.includes("if (pending.action === 'creation-credit-recharge')"), 'Mine page must resume recharge after login');
assert(mineJs.includes("pending.action === 'baker-fulfillment'") || mineJs.includes("if (pending.action === 'baker-fulfillment')"), 'Mine page must resume baker fulfillment after login');
assert(mineJs.includes("if (pending.url.indexOf('/pages/mine/mine') === 0)"), 'Mine page must distinguish same-page auth returns from cross-page auth returns');
assert(mineJs.includes('app.isTabPageUrl(pending.url)'), 'Mine page must reopen tab destinations correctly after login');
assert(mineJs.includes('this.openMiniPage(pending.url)'), 'Mine page must reopen non-tab destinations correctly after login');
assert(mineJs.includes('pending && pending.requirePhone') && mineJs.includes('promptPhoneAfterWechatLogin'), 'Mine page must hold login return until phone binding completes when required');

assert(homeJs.includes('app.globalData.pendingChallenge = task;'), 'home task entry must preserve the selected challenge before auth redirect');
assert(
  homeJs.includes("promptLoginRequired(error, {") &&
    homeJs.includes("action: 'task-join'") &&
    homeJs.includes("url: '/pages/design/design'"),
  'home task join must return the user to design after login',
);

assert(designJs.includes("consumePendingAuthDraft('design-generate')"), 'design page must restore interrupted draft state after login');
assert(designJs.includes("saveLoginReturn({ action: 'design-generate' })"), 'design generate must preserve page return before login');
assert(designJs.includes('app.globalData.pendingChallenge = challenge;'), 'design task join must preserve the selected challenge when login interrupts join');
assert(
  designJs.includes("promptLoginRequired(error, {") &&
    designJs.includes("action: 'task-join'") &&
    designJs.includes("url: '/pages/design/design'"),
  'design task join must reopen the design page after login',
);

assert(worksJs.includes('resumePendingGalleryAction()'), 'works page must resume pending gallery interactions after login');
assert(worksJs.includes("consumePendingAuthDraft('work-gallery-interaction')"), 'works page must restore pending gallery interaction state after login');
assert(worksJs.includes('app.globalData.pendingChallenge = task;'), 'works inspiration-task entry must preserve the selected challenge before auth redirect');
assert(worksJs.includes('app.globalData.currentDemandDraft = {'), 'works same-cake flow must seed a demand draft before leaving the gallery');
assert(worksJs.includes("url: '/pages/design/design'"), 'works inspiration-task login return must reopen the design page');

assert(workDetailJs.includes('resumePendingDetailAction(work)'), 'work-detail page must resume pending detail interactions after login');
assert(workDetailJs.includes("consumePendingAuthDraft('work-detail-interaction')"), 'work-detail page must restore pending interaction state after login');
assert(workDetailJs.includes('app.globalData.currentDemandDraft = {'), 'work-detail same-cake flow must seed a demand draft before leaving the detail page');
assert(workDetailJs.includes('app.globalData.pendingChallenge = task;'), 'work-detail same-theme flow must preserve the generated challenge before leaving the detail page');

assert(resultJs.includes("consumePendingAuthDraft('publish-demand')"), 'result page must restore interrupted demand state after login');
assert(resultJs.includes("consumePendingAuthDraft('work-refine')"), 'result page must restore interrupted refine state after login');
assert(resultJs.includes("consumePendingAuthDraft('creation-credit-recharge')"), 'result page must restore interrupted recharge state after login');
assert(resultJs.includes("consumePendingAuthDraft('result-interaction')"), 'result page must restore interrupted interaction state after login');
assert(resultJs.includes('resumePendingResultInteraction(work)'), 'result page must resume interrupted interaction actions after login');
assert(resultJs.includes('preserveDemandForAuth'), 'result page must preserve demand form before login');
assert(resultJs.includes('preserveRefineForAuth'), 'result page must preserve refine note before login');
assert(resultJs.includes('preserveRechargeForAuth'), 'result page must preserve recharge selection before login');
assert(resultJs.includes('preserveResultInteractionForAuth'), 'result page must preserve interaction intent before login');

assert(demandJs.includes("consumePendingAuthDraft('publish-draft-demand')"), 'demand page must restore draft-demand state after login');
assert(demandJs.includes("consumePendingAuthDraft('create-quote')"), 'demand page must restore quote form state after login');
assert(demandJs.includes('resumePendingQuoteSubmission()'), 'demand page must resume quote submission intent after login');
assert(demandJs.includes('preserveDraftDemandForAuth'), 'demand page must preserve draft-demand form before login');
assert(demandJs.includes('preserveQuoteForAuth'), 'demand page must preserve quote form before login');

assert(quotesJs.includes("consumePendingAuthDraft('select-quote')"), 'quotes page must restore quote-selection intent after login');
assert(quotesJs.includes('resumePendingQuoteSelection()'), 'quotes page must resume quote selection after login');
assert(quotesJs.includes('preserveQuoteSelectionForAuth'), 'quotes page must preserve quote-selection intent before login');

assert(ordersJs.includes("action: 'view-orders'"), 'orders login CTA must preserve return to orders page');
assert(ordersJs.includes("url: '/pages/orders/orders'"), 'orders login CTA must preserve orders page URL');
assert(ordersJs.includes("consumePendingAuthDraft('request-refund')"), 'orders page must restore refund submission state after login');
assert(ordersJs.includes("consumePendingAuthDraft('upload-refund-evidence')"), 'orders page must restore refund evidence state after login');
assert(ordersJs.includes('resumePendingRefundAction()'), 'orders page must resume refund actions after login');
assert(ordersJs.includes('preserveRefundForAuth'), 'orders page must preserve refund form before login');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-login-return',
      checkedFlows: 10,
    },
    null,
    2,
  ),
);
