import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appTsx = readText('apps/web-preview/src/App.tsx');
const apiTs = readText('apps/web-preview/src/api.ts');
const typesTs = readText('apps/web-preview/src/types.ts');
const stylesCss = readText('apps/web-preview/src/styles.css');
const packageJson = readText('package.json');

assert(typesTs.includes('export interface Order'), 'web types must define Order');
assert(typesTs.includes('export interface Fulfillment'), 'web types must define Fulfillment');
assert(apiTs.includes('listOrders'), 'web api must load orders');
assert(apiTs.includes('updateFulfillment'), 'web api must update fulfillment');
assert(apiTs.includes('/orders?userId='), 'web api must call GET /orders?userId=');
assert(apiTs.includes('/fulfillment'), 'web api must call PATCH /orders/:id/fulfillment');
assert(appTsx.includes('orders, setOrders'), 'admin dashboard must keep order list state');
assert(appTsx.includes('refreshOrders'), 'admin dashboard must refresh orders');
assert(appTsx.includes('订单履约'), 'admin dashboard must render order fulfillment panel');
assert(appTsx.includes('确认制作'), 'admin dashboard must expose baker confirmation action');
assert(appTsx.includes('制作中'), 'admin dashboard must expose producing action');
assert(appTsx.includes('完成订单'), 'admin dashboard must expose completion action');
assert(stylesCss.includes('.order-admin-list'), 'web styles must include order admin list');
assert(packageJson.includes('web:v04-fulfillment-regression'), 'package scripts must expose web fulfillment regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'web-admin-fulfillment',
    },
    null,
    2,
  ),
);
