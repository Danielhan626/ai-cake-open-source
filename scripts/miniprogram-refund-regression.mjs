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

const requiredFiles = [
  'apps/api/src/refunds/refunds.module.ts',
  'apps/api/src/refunds/refunds.controller.ts',
  'apps/api/src/refunds/refunds.service.ts',
  'scripts/api-refund-regression.mjs',
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist for refund after-sale flow`);
}

const appTypes = readText('apps/api/src/app.types.ts');
const appModule = readText('apps/api/src/app.module.ts');
const storeService = readText('apps/api/src/store/store.service.ts');
const refundsController = readText('apps/api/src/refunds/refunds.controller.ts');
const refundsService = readText('apps/api/src/refunds/refunds.service.ts');
const ordersJs = readText('apps/miniprogram/pages/orders/orders.js');
const ordersWxml = readText('apps/miniprogram/pages/orders/orders.wxml');
const supportJs = readText('apps/miniprogram/pages/support/support.js');
const supportWxml = readText('apps/miniprogram/pages/support/support.wxml');
const privacyUtil = readText('apps/miniprogram/utils/privacy.js');
const packageJson = readText('package.json');
const firstStage = readText('scripts/first-stage-readiness.mjs');

assert(appTypes.includes('export type RefundStatus'), 'app types must define RefundStatus');
assert(appTypes.includes('export type RefundDecision'), 'app types must define RefundDecision');
assert(appTypes.includes('export interface RefundRequest'), 'app types must define RefundRequest');
assert(appTypes.includes('refundRequests: RefundRequest[]'), 'database must persist refund requests');
assert(appTypes.includes("'refund'"), 'Payment provider/status domain must include refund records');
assert(appModule.includes('RefundsModule'), 'AppModule must import RefundsModule');
assert(storeService.includes('refundRequests: db.refundRequests || []'), 'StoreService must migrate refund requests');

assert(refundsController.includes("@Post()"), 'POST /refunds must exist');
assert(refundsController.includes("@Get()"), 'GET /refunds must exist');
assert(refundsController.includes("@Get(':id')"), 'GET /refunds/:id must exist');
assert(refundsController.includes("@Patch(':id/baker-response')"), 'PATCH /refunds/:id/baker-response must exist');
assert(refundsService.includes('createRefundRequest'), 'RefundsService must create refund requests');
assert(refundsService.includes('respondAsBaker'), 'RefundsService must handle baker decision');
assert(refundsService.includes('platform_mediating'), 'baker rejection must enter platform mediation');
assert(refundsService.includes('refundPayment'), 'baker agreement must create refund payment result');
assert(refundsService.includes('supportTicket'), 'refund flow must link support tickets');

assert(ordersJs.includes('requestRefund'), 'orders page must provide refund request entry');
assert(ordersJs.includes('/refunds'), 'orders page must call refund API');
assert(ordersWxml.includes('申请退款'), 'orders page must show refund action');
assert(!ordersJs.includes('uploaded.push(file.tempFilePath)'), 'orders refund evidence must not treat local temp files as uploaded proof');
assert(ordersJs.includes('appendRefundEvidenceImages'), 'orders refund evidence must be appended immediately after each successful upload');
assert(privacyUtil.includes('runWithPrivacy'), 'mini-program privacy helper must export runWithPrivacy');
assert(ordersJs.includes("require('../../utils/privacy')"), 'orders page must import the privacy helper for refund evidence upload');
assert(ordersJs.includes('runWithPrivacy(() =>') && ordersJs.includes('wx.chooseMedia({'), 'orders refund evidence upload must be wrapped by privacy authorization');
assert(supportJs.includes('evidenceImages'), 'support page must collect refund evidence images');
assert(supportJs.includes('refund'), 'support page must support refund mode');
assert(!supportJs.includes('uploaded.push(file.tempFilePath)'), 'support evidence must not treat local temp files as uploaded proof');
assert(supportJs.includes('appendSupportEvidenceImages'), 'support evidence must be appended immediately after each successful upload');
assert(supportJs.includes("require('../../utils/privacy')"), 'support page must import the privacy helper for evidence upload');
assert(supportJs.includes('runWithPrivacy(() =>') && supportJs.includes('wx.chooseMedia({'), 'support evidence upload must be wrapped by privacy authorization');
assert(supportWxml.includes('退款') && supportWxml.includes('证据'), 'support page must explain refund evidence');
assert(supportWxml.includes('bindtap="openRefundGuide"'), 'support refund CTA must use a dedicated refund-entry action');
assert(supportJs.includes('openRefundGuide()'), 'support page must expose a dedicated refund-entry handler');

assert(packageJson.includes('miniprogram:refund-regression'), 'package scripts must expose miniprogram refund regression');
assert(packageJson.includes('api:refund-regression'), 'package scripts must expose API refund regression');
assert(firstStage.includes('miniprogram:refund-regression'), 'first-stage readiness must include miniprogram refund regression');
assert(firstStage.includes('api:refund-regression'), 'first-stage readiness must include API refund regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'refund-after-sale-flow',
      checkedFiles: requiredFiles.length,
    },
    null,
    2,
  ),
);
