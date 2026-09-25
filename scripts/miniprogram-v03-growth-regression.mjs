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
  'apps/api/src/design-tasks/design-tasks.module.ts',
  'apps/api/src/design-tasks/design-tasks.controller.ts',
  'apps/api/src/design-tasks/design-tasks.service.ts',
  'apps/api/src/design-tasks/bot-llm.service.ts',
  'apps/api/src/design-tasks/bot-reviews.controller.ts',
];

for (const file of requiredFiles) {
  assert(exists(file), `${file} must exist for v0.3 growth loop`);
}

const appTypes = readText('apps/api/src/app.types.ts');
const appModule = readText('apps/api/src/app.module.ts');
const designTasksService = readText('apps/api/src/design-tasks/design-tasks.service.ts');
const botLlmService = readText('apps/api/src/design-tasks/bot-llm.service.ts');
const designTasksController = readText('apps/api/src/design-tasks/design-tasks.controller.ts');
const botReviewsController = readText('apps/api/src/design-tasks/bot-reviews.controller.ts');
const envExample = readText('.env.example');

assert(appTypes.includes('export interface DesignTask'), 'app types must define DesignTask');
assert(appTypes.includes('export interface DesignTaskCompletion'), 'app types must define DesignTaskCompletion');
assert(appTypes.includes('designTasks: DesignTask[]'), 'database must persist designTasks');
assert(appTypes.includes('designTaskCompletions: DesignTaskCompletion[]'), 'database must persist design task completions');
assert(appModule.includes('DesignTasksModule'), 'AppModule must import DesignTasksModule');
assert(designTasksService.includes('generateCandidates'), 'DesignTasksService must generate AI Bot task candidates');
assert(designTasksService.includes('completeTask'), 'DesignTasksService must complete tasks');
assert(designTasksService.includes('rewardPending'), 'task completion must create pending inspiration coupon rewards');
assert(designTasksService.includes('existingCompletion'), 'same user must not complete the same task twice');
assert(botLlmService.includes('BOT_LLM_PROVIDER'), 'Bot LLM provider env must be supported');
assert(botLlmService.includes('deepseek'), 'Bot LLM service must support deepseek provider');
assert(botLlmService.includes('doubao'), 'Bot LLM service must support doubao provider');
assert(botLlmService.includes('chat/completions'), 'Bot LLM service must use chat completions style API');
assert(designTasksController.includes("@Get('today')"), 'GET /design-tasks/today must exist');
assert(designTasksController.includes("@Post('generate-candidates')"), 'POST /design-tasks/generate-candidates must exist');
assert(designTasksController.includes("@Post(':id/join')"), 'POST /design-tasks/:id/join must exist');
assert(designTasksController.includes("@Post(':id/complete')"), 'POST /design-tasks/:id/complete must exist');
assert(botReviewsController.includes("@Post('work')"), 'POST /bot-reviews/work must exist');
assert(envExample.includes('BOT_LLM_PROVIDER=mock'), '.env.example must document BOT_LLM_PROVIDER');
assert(envExample.includes('BOT_LLM_TIMEOUT_MS=12000'), '.env.example must document BOT_LLM_TIMEOUT_MS');

const homeJs = readText('apps/miniprogram/pages/home/home.js');
const homeWxml = readText('apps/miniprogram/pages/home/home.wxml');
const designJs = readText('apps/miniprogram/pages/design/design.js');
const designWxml = readText('apps/miniprogram/pages/design/design.wxml');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const mineWxml = readText('apps/miniprogram/pages/mine/mine.wxml');
const worksWxml = readText('apps/miniprogram/pages/works/works.wxml');

assert(homeJs.includes('/design-tasks/today'), 'home page must load today design tasks from backend');
assert(homeJs.includes('/design-tasks/'), 'home page must join a backend task before design');
assert(homeWxml.includes('今日任务'), 'home page must expose 今日任务 entry');
assert(homeWxml.includes('参与人数'), 'home task cards must show participation signal');
assert(designJs.includes('/design-tasks/today'), 'design page must load backend design tasks');
assert(designJs.includes('/design-tasks/'), 'design page must join backend tasks');
assert(designWxml.includes('任务状态'), 'design page must show task status');
assert(resultJs.includes('/design-tasks/'), 'result page must complete backend design tasks');
assert(resultJs.includes('/bot-reviews/work'), 'result page must request Bot reviews');
assert(resultWxml.includes('任务完成'), 'result page must show task completion state');
assert(resultWxml.includes('灵感券待审核'), 'result page must explain pending inspiration coupon state');
assert(resultWxml.includes('赛事奖励'), 'result page must connect task rewards to the contest gameplay');
assert(resultWxml.includes('现金奖池以活动规则为准'), 'result page must keep cash-prize messaging gated by activity rules');
assert(resultWxml.includes('feedback-loop'), 'result page must show AI review, audience vote, rose, and official-review loop');
assert(mineJs.includes('completedTaskCount'), 'mine page must summarize completed tasks');
assert(mineWxml.includes('任务/灵感券'), 'mine page must expose task/inspiration coupon section');
assert(worksWxml.includes('做同款'), 'v0.3 must preserve works gallery 做同款 action');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      checked: requiredFiles.length,
      loop: 'design-task-growth',
    },
    null,
    2,
  ),
);
