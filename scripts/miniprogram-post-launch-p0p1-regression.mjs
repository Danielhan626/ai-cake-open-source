import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walkFiles(dir, predicate) {
  const root = new URL(`../${dir}`, import.meta.url).pathname;
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
      } else if (predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function assertNoForbidden(source, patterns, label) {
  for (const pattern of patterns) {
    assert(!pattern.test(source), `${label} must not contain ${pattern}`);
  }
}

const appJson = JSON.parse(readText('apps/miniprogram/app.json'));
const appJs = readText('apps/miniprogram/app.js');
const appWxss = readText('apps/miniprogram/app.wxss');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const designWxml = readText('apps/miniprogram/pages/design/design.wxml');
const designWxss = readText('apps/miniprogram/pages/design/design.wxss');
const homeWxml = readText('apps/miniprogram/pages/home/home.wxml');
const tasksJs = readText('apps/miniprogram/utils/tasks.js');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const mineWxss = readText('apps/miniprogram/pages/mine/mine.wxss');
const worksJs = readText('apps/miniprogram/pages/works/works.js');
const worksWxml = readText('apps/miniprogram/pages/works/works.wxml');
const worksWxss = readText('apps/miniprogram/pages/works/works.wxss');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const resultWxss = readText('apps/miniprogram/pages/result/result.wxss');
const bakersWxml = readText('apps/miniprogram/pages/bakers/bakers.wxml');
const bakersWxss = readText('apps/miniprogram/pages/bakers/bakers.wxss');
const homeJs = readText('apps/miniprogram/pages/home/home.js');
const appTypes = readText('apps/api/src/app.types.ts');
const storeService = readText('apps/api/src/store/store.service.ts');
const designTasksService = readText('apps/api/src/design-tasks/design-tasks.service.ts');
const resultTaskCompletionJs = resultJs.slice(resultJs.indexOf('async completeDesignTask(work)'));

assert(appJs.includes('pendingLoginReturn'), 'app global data must keep a pending login return route');
assert(appJs.includes('setPendingLoginReturn'), 'app must expose setPendingLoginReturn before switching to Mine');
assert(appJs.includes('consumePendingLoginReturn'), 'app must expose consumePendingLoginReturn after successful login');
assert(appJs.includes("badges: []"), 'default player badges must start empty');
assert(!appJs.includes('论坛首发'), 'default player profile must not fake forum achievements');
assert(!appJs.includes('长治灵感玩家'), 'default player profile must not expose a hard-coded player rank');
assert(
  designJs.includes('setPendingLoginReturn') || designJs.includes('saveLoginReturn'),
  'design login CTA must save the current page as login return target',
);
assert(mineJs.includes('resumePendingLoginReturn'), 'Mine page must resume the pending return route after login');
assert(mineJs.includes('consumePendingLoginReturn'), 'Mine page must consume pending login return exactly once');
assert(mineJs.includes('buildPlayerBadges'), 'Mine page must derive player badges from real state');
assert(mineJs.includes('playerWorkspaceTab'), 'Mine page must keep the player workspace behind a compact secondary hierarchy');
assert(mineJs.includes('accountPanelExpanded'), 'Mine page must support collapsing the account panel after login');
assert(mineJs.includes('historyExpanded'), 'Mine page must support collapsing long history sections by default');
assert(mineJs.includes('toggleAccountPanel'), 'Mine page must expose an account-panel toggle handler');
assert(mineJs.includes('toggleHistoryPanel'), 'Mine page must expose a history toggle handler');
assert(mineWxml.includes('playerProfile.badges.length'), 'Mine page must hide badge row when there are no real badges');
assert(mineWxml.includes('workspace-tabs'), 'Mine page must render workspace tabs to reduce long vertical scrolling');
assert(mineWxml.includes('account-summary-panel'), 'Mine page must render a compact account summary when login details can be collapsed');
assert(mineWxml.includes('history-toggle-button'), 'Mine page must render a dedicated history expand/collapse control');
assert(!mineWxss.includes('position: sticky'), 'Mine workspace tabs must not use sticky positioning that can block taps in WeChat');
assert(worksJs.includes('buildForumStats'), 'works page must derive forum stats from live data');
assert(worksJs.includes('myWorks'), 'works page must keep owned pending/private works separate from the public gallery');
assert(worksJs.includes('inspirationTasks'), 'works page must provide a next-step fallback when the public gallery is empty');
assert(worksWxml.includes('forumStats'), 'works page must render derived forum stats');
assert(worksWxml.includes('我的作品'), 'works page must surface the creator-owned works area');
assert(worksWxml.includes('公开广场'), 'works page must clearly separate approved public works from other content');
assert(!worksWxml.includes('gallery-card" wx:for="{{works}}" wx:key="id" bindtap="openWork"'), 'works public gallery card must not nest a card-level tap target around action buttons');
assert(!worksWxml.includes('catchtap="voteWork"'), 'works public gallery vote action must use a direct button tap instead of nested catchtap');
assert(!worksWxml.includes('catchtap="sendRose"'), 'works public gallery rose action must use a direct button tap instead of nested catchtap');
assert(!worksWxml.includes('catchtap="adoptWork"'), 'works public gallery adopt action must use a direct button tap instead of nested catchtap');
assert(worksWxml.includes('bindtap="openWork"'), 'works gallery must provide a direct open-work control');
assert(worksWxml.includes('gallery-detail-button'), 'works public gallery must expose a visible detail button for opening a work');
assert(worksWxml.includes('owned-open-button'), 'works owned gallery must expose a visible button for opening owned works');
assert(!worksJs.includes("AI 首评', value: '8 个角色"), 'works page must not expose hard-coded forum stats');
assert(appWxss.includes('overflow-x: hidden'), 'mini-program pages must guard against horizontal overflow');
assert(appWxss.includes('max-width: 100%'), 'global styles must cap button/card content within the viewport');
assert(worksWxml.includes('gallery-metrics'), 'works public cards must move interaction counts into a compact metrics row');
assert(worksWxml.includes('官方已审'), 'works public cards must signal that public supply is official-review gated');
assert(worksWxml.includes('奖励池'), 'works empty/task fallback must explain the contest reward-pool path');
assert(worksWxml.includes('card-loop'), 'works public cards must show the AI review, audience, and quote loop');
assert(worksWxml.includes('market-bridge'), 'works public cards must explain the same-style to quote bridge');
assert(worksWxml.includes('gallery-review-focus'), 'works public cards must show the single-angle review focus');
assert(worksWxss.includes('.gallery-cover') && worksWxss.includes('height: 360rpx'), 'works public cards must use a stable full-width gallery cover image');
assert(worksWxss.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'works public action buttons must use stable two-column grid tracks');
assert(worksWxss.includes('.mini-button') && worksWxss.includes('width: 100%'), 'works action buttons must be width-constrained');
assert(mineWxml.includes('<button class="role-tab'), 'Mine role tabs must be real buttons so phone taps fire reliably');
assert(mineWxml.includes('<button class="workspace-tab'), 'Mine workspace tabs must be real buttons so phone taps fire reliably');
assert(!/<view\s+class="role-tab(?:\s|\{)/.test(mineWxml), 'Mine role tabs must not rely on bare view tap targets');
assert(!/<view\s+class="workspace-tab(?:\s|\{)/.test(mineWxml), 'Mine workspace tabs must not rely on bare view tap targets');
assert(mineJs.includes('openMiniPage(url)'), 'Mine page must centralize non-tab navigation with a resilient helper');
assert(mineJs.includes('openMiniTab(url)'), 'Mine page must centralize tab navigation with a resilient helper');
assert(mineJs.includes('wx.reLaunch'), 'Mine page must recover from navigateTo failures with a reLaunch fallback');
assert(!mineJs.includes("wx.navigateTo({ url: '/pages/quotes/quotes' })"), 'Mine quick entries must not rely on raw navigateTo without fallback');
assert(!mineJs.includes("wx.navigateTo({ url: '/pages/orders/orders' })"), 'Mine order entry must not rely on raw navigateTo without fallback');
assert(!mineJs.includes("wx.navigateTo({ url: '/pages/rules/rules' })"), 'Mine rules entry must not rely on raw navigateTo without fallback');
assert(!mineJs.includes("wx.navigateTo({ url: '/pages/support/support' })"), 'Mine support entry must not rely on raw navigateTo without fallback');
assert(!mineJs.includes("wx.navigateTo({ url: '/pages/onboarding/onboarding' })"), 'Mine onboarding entry must not rely on raw navigateTo without fallback');

assertNoForbidden(
  worksJs,
  [/120 \+ index/, /\(index \+ 1\) \* 2/, /5 \+ index/, /18 \+ index/, /6 \+ index/],
  'works gallery',
);
assertNoForbidden(resultJs, [/baseLikes\s*=\s*8/, /\|\|\s*18(?!\d)/, /\|\|\s*6(?!\d)/], 'result page');
assertNoForbidden(homeJs, [/participantCount:\s*12/], 'home task fallback');
assert(storeService.includes('participantCount: 0'), 'seed design tasks must start from real zero participants');
assert(tasksJs.includes("source: 'local-practice'"), 'task helper must label local fallback tasks as local practice');
assert(tasksJs.includes("rewardLabel: '练习模式'"), 'task helper must label local fallback rewards as practice mode');
assert(tasksJs.includes("rewardStatusText: '练习模式'"), 'task helper must label local fallback status as practice mode');
assert(tasksJs.includes('!id.startsWith(LOCAL_TASK_PREFIX)'), 'backend task detection must exclude local fallback ids');
assert(homeJs.includes('toLocalPracticeTask'), 'home page must render fallback tasks through local practice helper');
assert(homeJs.includes('isBackendTaskId(task.id)'), 'home page must only join backend tasks through the API');
assert(homeWxml.includes('练习模式，不计真实奖励'), 'home page must clearly label local fallback tasks as practice mode');
assert(homeWxml.includes('营销日历提前发布，创作者用积分参赛。'), 'home page must explain early marketing-calendar tasks and credit-based contest entry');
assert(homeWxml.includes('AI 点评、观众投票送花，优质作品进入官方审核。'), 'home page must explain the AI, audience, and official-review contest loop');
assert(homeWxml.includes('奖励池按活动规则审核；喜欢的作品可做同款并进入师傅报价。'), 'home page must keep reward and baker-quote claims truthful');
assert(homeWxml.includes('calendar-task-board'), 'home page must render a denser task board instead of a blank-feeling strip');
assert(homeJs.includes("value: '45 天'") && homeJs.includes("label: '提前预告'"), 'home page must tell creators that marketing-calendar tasks are published in advance');
assert(homeWxml.includes('upcoming-task-list'), 'home page must surface additional near-future contest tasks');
assert(homeJs.includes('challengeGroups'), 'home page must group contest tasks by cycle');
assert(homeWxml.includes('challenge-groups'), 'home page must render grouped task cycles');
assert(homeWxml.includes('periodLabel') && homeWxml.includes('scheduleText'), 'home page must show each task period and schedule');
assert(homeWxml.includes('task-cycle-strip'), 'home page must summarize multiple task cycles before the full task list');
assert(homeJs.includes('goTaskHub'), 'home page must provide a direct entry to the full task hub');

assert(appTypes.includes('templateId?: string'), 'DesignTask must separate templateId from instance id');
assert(appTypes.includes('campaignId?: string'), 'DesignTask must separate campaignId from instance id');
assert(!/id:\s*'task_world_cup_watch_party'/.test(storeService), 'seed task id must not be the World Cup template id');
assert(storeService.includes("templateId: 'world_cup_watch_party'"), 'World Cup seed task must keep a template id');
assert(storeService.includes("legacyIds: ['task_world_cup_watch_party']"), 'legacy task id must remain as an alias');
assert(designTasksService.includes('legacyIds'), 'DesignTasksService must resolve legacy task ids for compatibility');
assert(designTasksService.includes('countTaskParticipants'), 'DesignTasksService must display participant count from real joins');
assert(designJs.includes('任务实例编号'), 'AI prompt must label task id as an instance id');
assert(designJs.includes('任务模板'), 'AI prompt must keep task template/type separate from instance id');
assert(designJs.includes('toLocalPracticeTask'), 'design page must render local fallback tasks through practice mode helper');
assert(designJs.includes('isBackendTaskId(challenge.id)'), 'design page must only join backend tasks through the API');
assert(designJs.includes('当前为练习模式，不计真实任务奖励'), 'AI prompt must keep local practice tasks out of real reward language');

assert(designJs.includes('showTaskList'), 'design page must support collapsed task hierarchy');
assert(designJs.includes('showAdvancedRecipe'), 'design page must support collapsed advanced recipe controls');
assert(designJs.includes('challengeGroups'), 'design page must keep grouped task cycles');
assert(designJs.includes('taskCycleSummary'), 'design page must surface compact task-cycle summaries');
assert(designJs.includes('onLoad(options = {})'), 'design page must accept direct task-hub entry parameters');
assert(designJs.includes("options.showTasks === '1'"), 'design page must auto-open the task list when entering from the task hub');
assert(designJs.includes("prompt: ''"), 'design prompt must start empty so examples stay as placeholder text');
assert(designWxml.includes('showTaskList'), 'design task list must be hidden until the user expands it');
assert(designWxml.includes('showAdvancedRecipe'), 'design advanced recipe controls must be hidden until expanded');
assert(designWxml.includes('design-cycle-strip'), 'design page must show compact cycle summaries before the full task picker');
assert(designWxml.includes('quest-group'), 'design task picker must render grouped task cycles');
assert(designWxml.includes('quest-select-button'), 'design task picker must use an explicit task selection button');
assert(designWxml.includes('练习模式，不计真实奖励'), 'design page must clearly label local fallback tasks as practice mode');
assert(designWxml.includes('营销日历赛题提前发布'), 'design page must explain marketing-calendar tasks before the user selects one');
assert(designWxml.includes('创作者参赛入口'), 'design page must expose the creator contest entry');
assert(designWxml.includes('任务赚钱以官方审核为准'), 'design page must present reward earning as official-review gated');
assert(designWxml.includes('AI 点评') && designWxml.includes('观众投票送花') && designWxml.includes('官方审核'), 'design page must show the contest scoring loop');
assert(designWxss.includes('.contest-lead'), 'design page must style the non-empty contest lead card');
assert(designWxml.includes('例如：送给女朋友的粉色蝴蝶结生日蛋糕'), 'design prompt must keep the example in placeholder form');
assert(!designWxml.includes('hero-copy'), 'design page should not keep the extra hero helper copy');
assert(designWxml.includes('item.rewardLabel'), 'design page task cards must show a practice-mode reward label when applicable');
assert(designWxml.includes("状态 {{activeChallenge.rewardStatusText || '进行中'}}"), 'design active task card must show current task status');
assert(designWxml.includes('参与人数 {{activeChallenge.participantCount || 0}}'), 'design active task card must show participant context for real tasks');
assert(designWxml.includes("奖励池 {{activeChallenge.rewardLabel || '待定'}}"), 'design active task card must show reward-pool context for real tasks');
assert(!designWxml.includes('任务实例 {{activeChallenge.id}}'), 'design active task card must not expose raw task instance ids to ordinary users');
assert(!designWxml.includes("任务模板 {{activeChallenge.templateId || 'local'}}"), 'design active task card must not expose raw task template ids to ordinary users');
assert(resultJs.includes('activeResultTab'), 'result page must default to a compact tabbed hierarchy');
assert(resultJs.includes('switchResultTab'), 'result page must provide a tab switch handler');
assert(resultJs.includes("address: ''"), 'result demand address must start empty instead of prefilled sample text');
assert(!resultJs.includes('希望尽量还原「${work.prompt}」'), 'result demand description must not be auto-filled with editable sample text');
assert(!resultJs.includes('保留主体创意、主色和最有记忆点的装饰。'), 'result must-keep field must not be auto-filled with sample text');
assert(!resultJs.includes('尺寸、材料、支撑结构和局部装饰都可以和蛋糕师沟通调整。'), 'result can-adjust field must not be auto-filled with sample text');
assert(resultWxml.includes('result-tabs'), 'result page must render secondary content behind tabs');
assert(resultWxml.includes("activeResultTab === 'actions'"), 'result page must prioritize the action tab first');
assert(resultWxml.includes('feedback-loop'), 'result feedback tab must show AI review, vote, rose, and official-review loop');
assert(resultWxml.includes('feedback-summary'), 'result feedback tab must explain why audience interaction matters');
assert(resultWxml.includes('现金奖池以活动规则为准'), 'result reward copy must avoid automatic cash payout promises');
assert(resultWxss.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'), 'result tabs must use minmax tracks to avoid WeChat button overflow');
assert(resultWxss.includes('.result-tab') && resultWxml.includes('class="result-tab'), 'result tabs must use custom tab cells instead of relying on raw native button layout');
assert(resultWxml.includes('<button class="result-tab'), 'result tabs must be real buttons for reliable taps');
assert(!resultWxss.includes('position: sticky'), 'result tabs must not use sticky positioning that can block top-page taps on device');
assert(resultWxss.includes('.interaction-card') && resultWxss.includes('overflow: hidden'), 'result interaction cards must clip within their grid');
assert(resultWxss.includes('.mini-action') && resultWxss.includes('width: 100%'), 'result interaction buttons must fit inside cards');
assert(resultWxml.includes('例如：还原粉色蝴蝶结和手写祝福牌，奶油不要太甜'), 'result demand description must keep an example placeholder');
assert(resultWxml.includes('例如：长治市潞州区某小区，门牌号可稍后沟通'), 'result address must keep an example placeholder');
assert(!resultWxml.includes('field-hint'), 'result demand form should remove extra helper copy under production level');
assert(resultJs.includes("rewardStatus: '任务奖励待同步'"), 'result page must keep reward status honest when task reward sync fails');
assert(
  resultJs.includes("completion && completion.status === 'sync-pending'"),
  'result page publish-demand success feedback must distinguish reward sync-pending from reward-created',
);
assertNoForbidden(
  resultTaskCompletionJs,
  [/catch\s*\(error\)\s*{[\s\S]*rewardWallet\.pending\s*=\s*\(app\.globalData\.rewardWallet\.pending \|\| 0\)\s*\+\s*rewardAmount/],
  'result task reward completion',
);
assertNoForbidden(
  resultJs,
  [/rewardStatus:\s*rewardAmount\s*\?\s*'灵感券待审核'\s*:\s*'无奖励任务'/],
  'result publish-demand reward status',
);

assert(bakersWxml.includes('看需求') && bakersWxml.includes('去报价'), 'bakers page must expose explicit demand and quote actions');
assert(bakersWxml.includes('履约售后'), 'bakers page must explain the fulfillment loop');
assert(!bakersWxml.includes('wx:key="id" bindtap="openDemand"'), 'bakers demand cards must not hide quote entry behind a whole-card tap');
assert(bakersWxss.includes('.demand-actions'), 'bakers page must style explicit demand action buttons');

assert(appJson.permission?.['scope.userFuzzyLocation']?.desc, 'P0/P1 build must declare optional userFuzzyLocation permission');
assert((appJson.requiredPrivateInfos || []).includes('getFuzzyLocation'), 'P0/P1 build must declare getFuzzyLocation private info');

const miniProgramJsFiles = walkFiles('apps/miniprogram', (file) => file.endsWith('.js'));
const homeJsFile = miniProgramJsFiles.find((file) => file.endsWith('/pages/home/home.js'));
assert(Boolean(homeJsFile), 'P0/P1 build must include home page script');
if (homeJsFile) {
  const homePageSource = readFileSync(homeJsFile, 'utf8');
  assert(homePageSource.includes('wx.getFuzzyLocation'), 'P0/P1 build must support optional fuzzy auto-location on the home page');
  assert(homePageSource.includes('runWithPrivacy'), 'P0/P1 home location must still respect privacy authorization');
  assert(homePageSource.includes('setOrderCity'), 'P0/P1 home location flow must keep manual city override');
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-post-launch-p0p1',
      checkedMiniProgramJs: miniProgramJsFiles.length,
    },
    null,
    2,
  ),
);
