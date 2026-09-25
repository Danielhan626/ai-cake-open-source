import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const packageJson = JSON.parse(readText('package.json'));
const rolePath = 'apps/api/src/design-tasks/bot-review-roles.ts';
const miniProgramReviewUtilPath = 'apps/miniprogram/utils/bot-reviews.js';

assert(existsSync(new URL(`../${rolePath}`, import.meta.url)), 'bot review role matrix must exist');
assert(existsSync(new URL(`../${miniProgramReviewUtilPath}`, import.meta.url)), 'mini-program review helper must exist');

const roles = readText(rolePath);
const miniProgramReviewUtil = readText(miniProgramReviewUtilPath);
const botLlmService = readText('apps/api/src/design-tasks/bot-llm.service.ts');
const resultJs = readText('apps/miniprogram/pages/result/result.js');
const resultWxml = readText('apps/miniprogram/pages/result/result.wxml');
const workDetailJs = readText('apps/miniprogram/pages/work-detail/work-detail.js');
const workDetailWxml = readText('apps/miniprogram/pages/work-detail/work-detail.wxml');
const worksWxml = readText('apps/miniprogram/pages/works/works.wxml');
const appJs = readText('apps/miniprogram/app.js');
const envExample = readText('.env.example');
const firstStage = readText('scripts/first-stage-readiness.mjs');

assert(roles.includes('export const botReviewRoles'), 'role matrix must export botReviewRoles');

const expectedRoleIds = [
  'deepseek',
  'qwen',
  'doubao',
  'wenxin',
  'hunyuan',
  'xinghuo',
];

for (const id of expectedRoleIds) {
  assert(roles.includes(`id: '${id}'`), `role matrix must include ${id}`);
  assert(miniProgramReviewUtil.includes(`id: '${id}'`), `mini-program review helper must include ${id}`);
}

const miniProgramSourceBundle = [
  appJs,
  resultJs,
  workDetailJs,
  readText('apps/miniprogram/pages/works/works.js'),
  readText('apps/miniprogram/pages/works/works.wxml'),
  readText('apps/miniprogram/pages/home/home.wxml'),
  readText('apps/miniprogram/pages/mine/mine.js'),
  readText('apps/miniprogram/pages/mine/mine.wxml'),
  miniProgramReviewUtil,
  readText('apps/miniprogram/config/seasonal-tasks.js'),
].join('\n');

for (const blocked of ['ChatGPT', 'chatgpt', 'GPT', 'OpenAI', 'Claude', 'ComfyUI']) {
  assert(!miniProgramSourceBundle.includes(blocked), `mini-program package-facing source must not expose ${blocked}`);
}

for (const blocked of ['ChatGPT', 'GPT', 'Claude', 'ComfyUI']) {
  assert(!roles.includes(blocked), `bot review role display copy must not expose ${blocked}`);
}

for (const copy of ['微调建议', '广场互动', '制作沟通', '蛋糕作品本身']) {
  assert(roles.includes(copy) || botLlmService.includes(copy), `bot review prompt must cover ${copy}`);
}

for (const copy of ['祝福式短评', '描绘蛋糕细节', '一句祝福式点评', '一个模型只说一个角度', '不能跨角度串场']) {
  assert(botLlmService.includes(copy), `bot review prompt must require ${copy}`);
}

assert(roles.includes('angleRule'), 'role matrix must define one-angle rules per model');
assert(roles.includes('focusSignals'), 'role matrix must define model-specific focus signals');
assert(botLlmService.includes('观众更懂这只蛋糕') && botLlmService.includes('我也想来创作一款'), 'bot review prompt must make comments help viewers understand details and join creation');
assert(miniProgramReviewUtil.includes('想来创作') || miniProgramReviewUtil.includes('想跟着参加一题'), 'mini-program fallback reviews must invite viewers into creator participation');

assert(botLlmService.includes('botReviewRoles'), 'BotLlmService must use the shared role matrix');
assert(botLlmService.includes('isAcceptableReviewLine'), 'Bot LLM service must reject non-compliant generated review lines');
assert(botLlmService.includes('focusSignals.some'), 'Bot LLM service must reject a line that does not match the model-specific angle');
assert(botLlmService.includes('BOT_REVIEW_PROVIDER'), 'Bot review provider override must exist');
assert(botLlmService.includes('BOT_LLM_PROVIDER'), 'Bot reviews must still fall back to shared Bot LLM provider');
assert(botLlmService.includes('imageUrl'), 'Bot reviews must accept imageUrl as work context');

assert(resultJs.includes('/bot-reviews/work'), 'result page must request backend Bot reviews');
assert(resultJs.includes('imageUrl: work.imageUrl'), 'result page must send work imageUrl to Bot reviews');
assert(resultJs.includes('buildBotReviewPreview'), 'result page fallback reviews must use blessing detail preview helper');
assert(resultJs.includes('reviewPanelExpanded'), 'result page must support collapsing long review seats by default');
assert(resultJs.includes('mergeReviewInteractionState(work, currentReviews)'), 'result page review likes must preserve the current model review lines');
assert(resultWxml.includes('六位评审各看一件事'), 'result page must explain one-model-one-angle review seats');
assert(resultWxml.includes('只看{{item.focus}}'), 'result review cards must show the single angle for each model');
assert(resultWxml.includes('toggleReviewPanel'), 'result page must expose a review expand/collapse button');
assert(readText('apps/miniprogram/pages/works/works.js').includes('buildBotReviewPreview'), 'works gallery preview copy must reuse blessing detail preview helper');
assert(worksWxml.includes('gallery-review-focus'), 'works gallery cards must surface the single-angle review focus');
assert(workDetailJs.includes('/bot-reviews/work'), 'work detail page must request backend Bot reviews');
assert(workDetailJs.includes('imageUrl: work.imageUrl'), 'work detail page must send work imageUrl to Bot reviews');
assert(workDetailJs.includes('buildBotReviewPreview'), 'work detail fallback reviews must use blessing detail preview helper');
assert(!workDetailJs.includes('bots.slice(0, 4)'), 'work detail must not truncate the AI comment seats to four roles');
assert(workDetailWxml.includes('六位评审各看一件事'), 'work detail must explain one-model-one-angle review seats');
assert(workDetailWxml.includes('只看{{item.focus}}'), 'work detail review cards must show the single angle for each model');

for (const staleCopy of ['主题清楚，适合分享给朋友投票。', '整体情绪成立，主体装饰可以再明确一点。']) {
  assert(!resultJs.includes(staleCopy), `result fallback review copy must remove stale generic line: ${staleCopy}`);
  assert(!workDetailJs.includes(staleCopy), `work-detail fallback review copy must remove stale generic line: ${staleCopy}`);
}

assert(envExample.includes('BOT_REVIEW_PROVIDER'), 'env example must document BOT_REVIEW_PROVIDER');
assert(
  packageJson.scripts['miniprogram:bot-review-regression'] === 'node scripts/miniprogram-bot-review-regression.mjs',
  'package scripts must expose miniprogram:bot-review-regression',
);
assert(firstStage.includes('miniprogram:bot-review-regression'), 'first-stage readiness must include bot review static regression');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'bot-review-comment-seats',
    },
    null,
    2,
  ),
);
