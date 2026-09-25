import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appJson = JSON.parse(readText('apps/miniprogram/app.json'));
const worksJs = readText('apps/miniprogram/pages/works/works.js');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const workDetailJsPath = 'apps/miniprogram/pages/work-detail/work-detail.js';
const workDetailWxmlPath = 'apps/miniprogram/pages/work-detail/work-detail.wxml';
const workDetailWxssPath = 'apps/miniprogram/pages/work-detail/work-detail.wxss';
const workDetailJsonPath = 'apps/miniprogram/pages/work-detail/work-detail.json';
const packageJson = readText('package.json');

assert(
  appJson.pages.includes('pages/work-detail/work-detail'),
  'app.json must register pages/work-detail/work-detail as the work share landing page',
);
assert(existsSync(new URL(`../${workDetailJsPath}`, import.meta.url)), 'work-detail.js must exist');
assert(existsSync(new URL(`../${workDetailWxmlPath}`, import.meta.url)), 'work-detail.wxml must exist');
assert(existsSync(new URL(`../${workDetailWxssPath}`, import.meta.url)), 'work-detail.wxss must exist');
assert(existsSync(new URL(`../${workDetailJsonPath}`, import.meta.url)), 'work-detail.json must exist');

const workDetailJs = readText(workDetailJsPath);
const workDetailWxml = readText(workDetailWxmlPath);
const workDetailWxss = readText(workDetailWxssPath);

assert(
  worksJs.includes('/pages/work-detail/work-detail?id='),
  'works gallery card tap must open the work detail share page with id',
);
assert(workDetailJs.includes('onLoad(options)'), 'work-detail page must load from route options');
assert(workDetailJs.includes('/works/${this.data.workId}?userId='), 'work-detail page must load GET /works/:id');
assert(workDetailJs.includes('onShareAppMessage'), 'work-detail page must provide WeChat share metadata');
assert(workDetailJs.includes("action: 'vote'"), 'work-detail page must support friend vote');
assert(workDetailJs.includes("action: 'rose'"), 'work-detail page must support rose sending');
assert(resultJs.includes("const userInteraction = work && work.userInteraction ? work.userInteraction : {};"), 'result page must derive interaction state from persisted userInteraction');
assert(resultJs.includes('const voted = Boolean(userInteraction.voted || voteState[work.id]);'), 'result page vote state must survive successful interaction refresh');
assert(resultJs.includes('const roseSent = Boolean(userInteraction.roseSent || roseState[work.id]);'), 'result page rose state must survive successful interaction refresh');
assert(resultJs.includes('app.globalData.workVoteState[work.id] = true;'), 'result page vote action must lock local duplicate-vote protection immediately');
assert(resultJs.includes('app.globalData.workRoseState[work.id] = true;'), 'result page rose action must lock local duplicate-rose protection immediately');
assert(resultWxml.includes("{{interaction.voted ? '已投票' : '投它好看'}}"), 'result page vote CTA must reflect persisted voted state');
assert(resultWxml.includes("{{interaction.roseSent ? '已送玫瑰' : '送玫瑰'}}"), 'result page rose CTA must reflect persisted rose state');
assert(workDetailJs.includes('startSameCake'), 'work-detail page must support same-style production demand');
assert(workDetailJs.includes('joinSameThemeTask'), 'work-detail page must support same-theme task return path');
assert(workDetailJs.includes('currentDemandDraft'), 'same-style flow must create a demand draft');
assert(workDetailJs.includes('currentTask'), 'same-theme task flow must seed the design task context');

for (const requiredCopy of ['作品详情', '投它好看', '送玫瑰', '做同款', '同主题任务', '分享给朋友']) {
  assert(workDetailWxml.includes(requiredCopy), `work-detail page must render copy: ${requiredCopy}`);
}
for (const requiredCopy of ['作品如何进入奖励池', 'AI 点评创意与细节', '观众投票、送花形成认同', '官方审核后进入奖励池，现金奖励以活动规则为准', '再由师傅查看需求、报价和确认履约']) {
  assert(workDetailWxml.includes(requiredCopy), `work-detail page must render truthful commercial-loop copy: ${requiredCopy}`);
}

assert(workDetailWxss.includes('.share-hero'), 'work-detail styles must include share hero layout');
assert(workDetailWxss.includes('.action-grid'), 'work-detail styles must include stable action grid');
assert(workDetailWxss.includes('.detail-loop'), 'work-detail styles must include the reward-pool loop layout');
assert(workDetailWxss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'work-detail action grid must constrain both columns within the viewport');
assert(workDetailWxss.includes('.mini-button') && workDetailWxss.includes('width: 100%'), 'work-detail interaction buttons must be width-constrained');
assert(
  packageJson.includes('miniprogram:v04-share-regression'),
  'package scripts must expose miniprogram:v04-share-regression',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      loop: 'work-sharing-landing',
      checkedFiles: 6,
    },
    null,
    2,
  ),
);
