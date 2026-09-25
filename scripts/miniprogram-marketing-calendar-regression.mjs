import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const packageJson = JSON.parse(readText('package.json'));
const appTypes = readText('apps/api/src/app.types.ts');
const marketingCalendar = readText('apps/api/src/design-tasks/marketing-calendar.ts');
const miniProgramSeasonalTasks = readText('apps/miniprogram/config/seasonal-tasks.js');
const botLlmService = readText('apps/api/src/design-tasks/bot-llm.service.ts');
const designTasksService = readText('apps/api/src/design-tasks/design-tasks.service.ts');
const designTasksController = readText('apps/api/src/design-tasks/design-tasks.controller.ts');
const firstStage = readText('scripts/first-stage-readiness.mjs');
const { getSeasonalTasks } = require('../apps/miniprogram/config/seasonal-tasks.js');
const { getSeasonalTaskBoard } = require('../apps/miniprogram/config/seasonal-tasks.js');

assert(appTypes.includes('marketingNodeId?: string'), 'DesignTask must persist marketingNodeId');
assert(appTypes.includes('marketingTitle?: string'), 'DesignTask must persist marketingTitle');

for (const token of [
  'world-cup-2026',
  'graduation-season',
  'school-opening',
  'spring-outing',
  'qixi-love',
  'double-eleven',
  'christmas',
  'getMarketingCalendarContext',
]) {
  assert(marketingCalendar.includes(token), `marketing calendar must include ${token}`);
}

assert(botLlmService.includes('MarketingCalendarContext'), 'Bot LLM must accept marketing calendar context');
assert(botLlmService.includes('当前营销节点'), 'Bot prompt must include current marketing nodes');
assert(botLlmService.includes('世界杯、毕业季、开学季、踏青、七夕、双11、圣诞'), 'Bot prompt must name supported marketing calendar categories');
assert(botLlmService.includes('官方奖励池审核'), 'Bot prompt must allow reward-pool contest language');
assert(botLlmService.includes('不要承诺自动现金到账'), 'Bot prompt must not promise automatic cash payout');

assert(miniProgramSeasonalTasks.includes('daysUntilTaskStart'), 'mini-program local task catalog must include upcoming marketing-node logic');
assert(miniProgramSeasonalTasks.includes('item.daysUntil >= 0 && item.daysUntil <= 45'), 'mini-program local task catalog must publish near-future tasks in advance');
assert(miniProgramSeasonalTasks.includes('getSeasonalTaskBoard'), 'mini-program local task catalog must expose grouped task cycles');
assert(miniProgramSeasonalTasks.includes('periodLabel'), 'mini-program local task catalog must label task period status');
assert(
  getSeasonalTasks(new Date('2026-07-31T12:00:00')).some((task) => task.id === 'qixi-love'),
  'mini-program local fallback must show Qixi tasks before the August campaign window opens',
);
assert(
  getSeasonalTaskBoard(new Date('2026-07-31T12:00:00')).upcoming.some((task) => task.id === 'qixi-love'),
  'mini-program grouped task board must place Qixi in the upcoming cycle before August',
);

assert(designTasksService.includes('publishToday'), 'DesignTasksService must support manual publish-today');
assert(designTasksService.includes('generateTaskCandidates(marketingContext'), 'DesignTasksService must pass marketing context into Bot LLM');
assert(designTasksService.includes('marketingNodeId'), 'DesignTasksService must persist marketing node metadata');
assert(designTasksController.includes("@Post('publish-today')"), 'POST /design-tasks/publish-today must exist');

assert(
  packageJson.scripts['miniprogram:marketing-calendar-regression'] ===
    'node scripts/miniprogram-marketing-calendar-regression.mjs',
  'package scripts must expose miniprogram:marketing-calendar-regression',
);
assert(
  packageJson.scripts['api:marketing-calendar-regression'] === 'node scripts/api-marketing-calendar-regression.mjs',
  'package scripts must expose api:marketing-calendar-regression',
);
assert(firstStage.includes('miniprogram:marketing-calendar-regression'), 'first-stage readiness must include static marketing calendar regression');
assert(firstStage.includes('api:marketing-calendar-regression'), 'first-stage readiness must include API marketing calendar regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'marketing-calendar-task-engine',
    },
    null,
    2,
  ),
);
