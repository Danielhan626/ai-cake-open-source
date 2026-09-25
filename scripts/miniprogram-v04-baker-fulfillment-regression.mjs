import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const ordersController = readText('apps/api/src/orders/orders.controller.ts');
const ordersService = readText('apps/api/src/orders/orders.service.ts');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const mineWxss = readText('apps/miniprogram/pages/mine/mine.wxss');
const bakersJs = readText('apps/miniprogram/pages/bakers/bakers.js');
const bakersWxml = readText('apps/miniprogram/pages/bakers/bakers.wxml');
const bakersWxss = readText('apps/miniprogram/pages/bakers/bakers.wxss');
const packageJson = readText('package.json');

assert(ordersController.includes("@Get('baker')"), 'orders API must expose GET /orders/baker');
assert(
  ordersController.includes("@Patch(':id/baker-fulfillment')"),
  'orders API must expose PATCH /orders/:id/baker-fulfillment',
);
assert(ordersController.includes('actorService.userIdFromRequest'), 'baker fulfillment routes must resolve actor user');
assert(ordersService.includes('listForBaker'), 'OrdersService must list orders by verified baker');
assert(ordersService.includes('updateBakerFulfillment'), 'OrdersService must update fulfillment by verified baker');
assert(
  ordersService.includes('Only the verified baker account can manage this order'),
  'baker fulfillment must enforce baker account ownership',
);

assert(mineJs.includes('bakerOrders'), 'mine page must keep baker fulfillment orders state');
assert(mineJs.includes('/orders/baker?userId='), 'mine page must load baker orders');
assert(mineJs.includes('updateBakerFulfillment'), 'mine page must provide baker fulfillment action');
assert(mineJs.includes('/baker-fulfillment'), 'mine page must call baker fulfillment endpoint');
assert(mineJs.includes("status: 'baker_confirmed'"), 'mine page must support confirm production status');
assert(mineJs.includes("status: 'producing'"), 'mine page must support producing status');
assert(mineJs.includes("status: 'completed'"), 'mine page must support completed status');
assert(!mineJs.includes('applyBakerFulfillmentLocally'), 'mine page must not fake merchant fulfillment locally');
assert(!mineJs.includes('当前设备已暂存履约状态'), 'mine page must not present local-only merchant fulfillment as progress');
assert(mineJs.includes('promptLoginRequired'), 'mine page must route baker auth failures to login before showing a hard failure');
assert(mineJs.includes('preserveBakerFulfillmentForAuth'), 'mine page must preserve interrupted baker fulfillment updates before login');
assert(mineJs.includes('resumePendingBakerFulfillment'), 'mine page must resume interrupted baker fulfillment updates after login');
assert(mineJs.includes("consumePendingAuthDraft('baker-fulfillment')"), 'mine page must consume pending baker fulfillment auth intent');
assert(mineJs.includes('updateBakerFulfillmentById'), 'mine page must reuse the same fulfillment update path for click and auth resume');
assert(
  mineJs.includes('await this.syncCurrentBakerProfile()'),
  'mine page must refresh baker identity before resuming fulfillment after login',
);
assert(mineJs.includes('订单履约状态更新失败，请检查登录和网络后重试。'), 'mine page must tell the merchant to retry when fulfillment sync fails');

for (const copy of ['履约订单', '确认制作', '制作中', '完成订单']) {
  assert(mineWxml.includes(copy), `baker desk must render copy: ${copy}`);
}

for (const copy of ['看需求', '去报价', '确认制作', '履约售后']) {
  assert(bakersWxml.includes(copy), `baker marketplace must render loop copy: ${copy}`);
}

assert(mineWxss.includes('.baker-order-list'), 'mine styles must include baker order list');
assert(mineWxss.includes('.fulfillment-actions'), 'mine styles must include fulfillment actions');
assert(bakersWxss.includes('.demand-actions'), 'baker marketplace styles must include demand quote actions');
assert(bakersWxss.includes('.baker-flow'), 'baker marketplace styles must include the fulfillment loop strip');
assert(bakersJs.includes('marketSummary'), 'baker marketplace must summarize current demand and baker supply');
assert(bakersJs.includes('decorateDemand'), 'baker marketplace must derive scan-friendly demand signals');
assert(bakersJs.includes('demand.status === \'selected\''), 'baker marketplace must distinguish selected demands');
assert(!bakersJs.includes("onShow() {\n    app.globalData.accountRole = 'baker';"), 'baker marketplace browsing must not unconditionally switch the account role');
assert(bakersWxml.includes('等待审核'), 'baker marketplace must distinguish review-waiting demands from quote-ready demands');
assert(bakersWxml.includes('bindtap="openDemand"'), 'baker marketplace detail CTA must open demand detail');
assert(bakersWxml.includes('bindtap="openQuoteDemand"'), 'baker marketplace quote CTA must enter quote mode directly');
assert(!/bindtap="openDemand"[^>]*>去报价/.test(bakersWxml), 'baker marketplace quote CTA must not reuse the detail handler');
assert(
  packageJson.includes('miniprogram:v04-baker-fulfillment-regression'),
  'package scripts must expose miniprogram:v04-baker-fulfillment-regression',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      loop: 'baker-fulfillment-entry',
    },
    null,
    2,
  ),
);
