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
  'apps/api/src/profile/profile.module.ts',
  'apps/api/src/profile/profile.controller.ts',
  'apps/api/src/profile/profile.service.ts',
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist for first-stage user history`);
}

const appModule = readText('apps/api/src/app.module.ts');
const profileController = readText('apps/api/src/profile/profile.controller.ts');
const profileService = readText('apps/api/src/profile/profile.service.ts');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const packageJson = readText('package.json');

assert(appModule.includes('ProfileModule'), 'AppModule must import ProfileModule');
assert(profileController.includes("@Get('history')"), 'GET /profile/history must exist');
assert(profileService.includes('history'), 'ProfileService must expose user history');
assert(profileService.includes('works'), 'history must include user works');
assert(profileService.includes('demands'), 'history must include user demands');
assert(profileService.includes('quotes'), 'history must include user quotes');
assert(profileService.includes('orders'), 'history must include user orders');
assert(mineJs.includes('/profile/history?userId='), 'mine page must load backend profile history');
assert(mineJs.includes('historySummary'), 'mine page must keep history summary state');
assert(mineJs.includes('recentWorks'), 'mine page must keep recent works state');
assert(mineJs.includes('recentDemands'), 'mine page must keep recent demands state');
assert(mineJs.includes('recentOrders'), 'mine page must keep recent orders state');
assert(mineWxml.includes('我的历史'), 'mine page must render history panel');
assert(mineWxml.includes('最近作品'), 'mine page must render recent works');
assert(mineWxml.includes('最近需求'), 'mine page must render recent demands');
assert(mineWxml.includes('最近订单'), 'mine page must render recent orders');
assert(packageJson.includes('miniprogram:v04-history-regression'), 'package scripts must expose v0.4 history regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      loop: 'first-stage-history',
      checkedFiles: requiredFiles.length,
    },
    null,
    2,
  ),
);
