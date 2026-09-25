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
  'apps/api/src/orders/orders.module.ts',
  'apps/api/src/orders/orders.controller.ts',
  'apps/api/src/orders/orders.service.ts',
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist for recoverable order intents`);
}

const appTypes = readText('apps/api/src/app.types.ts');
const appModule = readText('apps/api/src/app.module.ts');
const ordersController = readText('apps/api/src/orders/orders.controller.ts');
const ordersService = readText('apps/api/src/orders/orders.service.ts');
const storeService = readText('apps/api/src/store/store.service.ts');
const quotesJs = readText('apps/miniprogram/pages/quotes/quotes.js');
const ordersJs = readText('apps/miniprogram/pages/orders/orders.js');
const ordersWxml = readText('apps/miniprogram/pages/orders/orders.wxml');
const packageJson = readText('package.json');

assert(appTypes.includes('export interface Order'), 'app types must define Order');
assert(appTypes.includes('export interface Fulfillment'), 'app types must define Fulfillment');
assert(appTypes.includes('orders: Order[]'), 'database must persist orders');
assert(appTypes.includes('fulfillments: Fulfillment[]'), 'database must persist fulfillments');
assert(appTypes.includes('export type OrderStatus') && appTypes.includes("'intent_confirmed'"), 'OrderStatus must include intent_confirmed');
assert(appTypes.includes('export type FulfillmentStatus') && appTypes.includes("'created'"), 'FulfillmentStatus must include created');
assert(appModule.includes('OrdersModule'), 'AppModule must import OrdersModule');
assert(storeService.includes('orders: db.orders || []'), 'StoreService must migrate orders');
assert(storeService.includes('fulfillments: db.fulfillments || []'), 'StoreService must migrate fulfillments');
assert(ordersController.includes("@Get()"), 'GET /orders must exist');
assert(ordersController.includes("@Get(':id')"), 'GET /orders/:id must exist');
assert(ordersController.includes("@Post()"), 'POST /orders must exist');
assert(ordersController.includes("@Patch(':id/fulfillment')"), 'PATCH /orders/:id/fulfillment must exist');
assert(ordersService.includes('createFromQuote'), 'OrdersService must create orders from selected quotes');
assert(ordersService.includes('existingOrder'), 'OrdersService must be idempotent for the same quote');
assert(ordersService.includes('fulfillment'), 'OrdersService must include fulfillment state');
assert(quotesJs.includes("request('/orders'"), 'quote confirmation must persist an order intent');
assert(ordersJs.includes('/orders?userId='), 'orders page must load backend order history');
assert(ordersJs.includes('loadOrders'), 'orders page must have a backend loading path');
assert(ordersJs.includes('cachedServerOrder'), 'orders page must distinguish cached server snapshots from real-time server orders');
assert(ordersJs.includes("orderSource: 'cached-server'"), 'orders page must mark cached server snapshots explicitly');
assert(ordersJs.includes('clearOrderSurface'), 'orders page must clear the order surface instead of fabricating a local order when the server is empty');
assert(ordersWxml.includes('订单列表'), 'orders page must render recoverable order history');
assert(ordersJs.includes('buildOrderActionButtons'), 'orders page must derive actions from order state');
assert(ordersJs.includes('handleOrderAction'), 'orders page must route state-derived actions through one handler');
assert(ordersJs.includes('refundEligible'), 'orders page must gate the refund surface by eligibility');
assert(ordersJs.includes('pendingRefundOrderId'), 'refund auth resume must keep the original order id');
assert(ordersJs.includes('preferredOrder'), 'orders page must restore the intended order instead of always choosing the latest');
assert(ordersJs.includes('item.orderId === currentOrderId'), 'refund records must be scoped to the selected order');
assert(ordersJs.includes('refundRequestSubmitted'), 'orders page must prevent duplicate refund submissions');
assert(ordersJs.includes('currentQuote = quote'), 'selecting an older order must replace stale global quote context');
assert(ordersWxml.includes('当前要做'), 'orders page must show the next actionable state');
assert(ordersWxml.includes('refundEligible && refundPanelOpen'), 'orders refund form must only render after eligibility and explicit expansion');
assert(!ordersWxml.includes('看同城报价'), 'orders page must not keep a static quote-market action after fulfillment');
assert(!readText('apps/miniprogram/pages/quotes/quotes.wxml').includes('bindtap="goBakers"'), 'quote empty state must not send a buyer into the baker market');
assert(!ordersJs.includes('demo-order'), 'orders page must not create demo-order fallback ids');
assert(!ordersJs.includes('local-order-'), 'orders page must not fabricate local order ids for commercial order history');
assert(!ordersJs.includes("'13800000000'"), 'orders page must not expose fake courier phone numbers');
assert(!ordersWxml.includes('配送员信息'), 'orders page must not present simulated courier info as real');
assert(ordersWxml.includes('履约信息'), 'orders page must frame first-stage delivery as fulfillment state');
assert(packageJson.includes('miniprogram:v04-order-regression'), 'package scripts must expose v0.4 order regression');
assert(packageJson.includes('api:v04-order-regression'), 'package scripts must expose v0.4 API order regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      loop: 'recoverable-order-intent',
      checkedFiles: requiredFiles.length,
    },
    null,
    2,
  ),
);
