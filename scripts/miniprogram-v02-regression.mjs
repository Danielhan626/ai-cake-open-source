import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appConfig = JSON.parse(readText('apps/miniprogram/app.json'));
const tabTexts = appConfig.tabBar.list.map((item) => item.text);
const tabPaths = appConfig.tabBar.list.map((item) => item.pagePath);

assert(
  JSON.stringify(tabTexts) === JSON.stringify(['首页', '作品广场', '接单广场', '我的']),
  `tabBar text mismatch: ${tabTexts.join(' / ')}`,
);
assert(tabPaths.includes('pages/works/works'), 'works gallery must be a tab page');
assert(!tabPaths.includes('pages/design/design'), 'design page must not be a tab page in v0.2');

const filesToScan = [
  'apps/miniprogram/pages/home/home.js',
  'apps/miniprogram/pages/works/works.js',
  'apps/miniprogram/pages/mine/mine.js',
  'apps/miniprogram/pages/orders/orders.js',
  'apps/miniprogram/pages/bakers/bakers.js',
  'apps/miniprogram/pages/demand/demand.js',
  'apps/miniprogram/pages/result/result.js',
];

for (const file of filesToScan) {
  const content = readText(file);
  assert(
    !content.includes("wx.switchTab({ url: '/pages/design/design' })") &&
      !content.includes('wx.switchTab({ url: "/pages/design/design" })'),
    `${file} still switchTabs to non-tab design page`,
  );
}

const homeWxml = readText('apps/miniprogram/pages/home/home.wxml');
const worksWxml = readText('apps/miniprogram/pages/works/works.wxml');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const designWxml = readText('apps/miniprogram/pages/design/design.wxml');
const designWxss = readText('apps/miniprogram/pages/design/design.wxss');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');

assert(!homeWxml.includes('直接开做'), 'home page should not use old copy: 直接开做');
assert(!homeWxml.includes('>开做<'), 'home page should not use old pill copy: 开做');
assert(worksWxml.includes('做同款'), 'works gallery must expose the adopted action as 做同款');
assert(!worksWxml.includes('采用这个设计'), 'works gallery should not use old adoption copy');
assert(designJs.includes('promptLoginFromGenerateFailure'), 'AI generation failure must expose login CTA handler');
assert(
  designJs.includes('confirmText') &&
    designJs.includes("'去登录'") &&
    designJs.includes('loginRequired && result.confirm') &&
    designJs.includes('this.goLogin()'),
  'AI generation failure modal must include a conditional 去登录 confirm action',
);
assert(mineJs.includes('authFocus'), 'mine page must support focusing the auth panel after navigation');
assert(mineWxml.includes('login-anchor'), 'mine page must expose an auth anchor for login navigation');
assert(designJs.includes('seasonalTaskCatalog'), 'design page must use seasonal AI Bot task catalog');
assert(designWxml.includes('今日创作题'), 'design page must keep the today-task entry after hierarchy cleanup');
assert(designWxml.includes('练习模式，不计真实奖励'), 'design page must keep honest practice-mode labeling after copy reduction');
assert(designWxml.includes('营销日历赛题提前发布'), 'design page must preserve marketing-calendar task context');
assert(designWxml.includes('创作者参赛入口'), 'design page must expose the creator contest entry instead of an empty today-task area');
assert(designWxml.includes('任务赚钱以官方审核为准'), 'design page must keep reward earning gated by official review');
assert(designWxss.includes('.contest-lead'), 'design page must style the contest lead area');
assert(!designWxml.includes('.join('), 'design WXML must avoid JavaScript method calls like tags.join in bindings');
assert(designWxml.includes('data-tags="{{item.tagText}}"'), 'design task cards must pass precomputed tagText');
assert(mineJs.includes('showInspirationRule'), 'mine page must explain inspiration coupon usage');
assert(mineWxml.includes('灵感券用途'), 'mine page must expose inspiration coupon usage entry');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      tabBar: tabTexts,
      checkedFiles: filesToScan.length,
      adoptionCopy: '做同款',
    },
    null,
    2,
  ),
);
