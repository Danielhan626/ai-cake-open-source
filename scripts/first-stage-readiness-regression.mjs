import { existsSync, readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = JSON.parse(readText('package.json'));
const readinessScriptPath = 'scripts/first-stage-readiness.mjs';

assert(
  packageJson.scripts['first-stage:readiness'] === 'node scripts/first-stage-readiness.mjs',
  'package scripts must expose first-stage:readiness',
);
assert(
  packageJson.scripts['wechat-pay:prepare-env'] === 'bash scripts/prepare-wechat-pay-env.sh',
  'package scripts must expose wechat-pay:prepare-env',
);
assert(
  packageJson.scripts['wechat-pay-env-prep-regression'] === 'node scripts/wechat-pay-env-prep-regression.mjs',
  'package scripts must expose wechat-pay-env-prep-regression',
);
assert(existsSync(new URL(`../${readinessScriptPath}`, import.meta.url)), 'first-stage readiness script must exist');
assert(existsSync(new URL('../scripts/prepare-wechat-pay-env.sh', import.meta.url)), 'wechat pay env helper script must exist');
assert(
  existsSync(new URL('../scripts/wechat-pay-env-prep-regression.mjs', import.meta.url)),
  'wechat pay env preparation regression must exist',
);

const readinessScript = readText(readinessScriptPath);
const deployScript = readText('scripts/deploy-aliyun-ecs.sh');
const healthController = readText('apps/api/src/health.controller.ts');
const liveReadinessScript = readText('scripts/live-commercial-readiness.mjs');
const requiredChecks = [
  'miniprogram:v02-regression',
  'miniprogram:v03-growth-regression',
  'miniprogram:v04-order-regression',
  'miniprogram:v04-history-regression',
  'miniprogram:v04-share-regression',
  'miniprogram:v04-baker-fulfillment-regression',
  'miniprogram:city-order-regression',
  'miniprogram:production-communication-regression',
  'miniprogram:marketing-calendar-regression',
  'miniprogram:bot-review-regression',
  'miniprogram:creation-credit-regression',
  'miniprogram:refund-regression',
  'miniprogram:payment-boundary-regression',
  'miniprogram:launch-domain-regression',
  'miniprogram:post-launch-p0p1-regression',
  'miniprogram:button-integrity-regression',
  'miniprogram:login-return-regression',
  'miniprogram:commercial-auth-regression',
  'miniprogram:merchant-identity-regression',
  'web:v04-fulfillment-regression',
  'web:merchant-admin-regression',
  'api:v03-growth-regression',
  'api:v04-order-regression',
  'api:v04-history-regression',
  'api:v04-baker-fulfillment-regression',
  'api:city-order-regression',
  'api:production-communication-regression',
  'api:marketing-calendar-regression',
  'api:bot-review-regression',
  'api:creation-credit-regression',
  'api:refund-regression',
  'api:baker-profile-regression',
  'api:merchant-admin-regression',
  'security-regression',
  'admin-auth-regression',
  'typecheck',
  'build',
  'wechat-pay-crypto-regression',
  'wechat-pay-env-prep-regression',
  'wechat-pay-live-regression',
  'prepare-wechat-pay-env.sh',
];

for (const check of requiredChecks) {
  assert(readinessScript.includes(check), `first-stage readiness must run ${check}`);
}

assert(
  readinessScript.includes("find apps/miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check"),
  'first-stage readiness must check all mini-program JS syntax',
);
assert(healthController.includes('releaseId'), 'health endpoint must expose non-sensitive release id for deployment verification');
assert(healthController.includes('wechatLoginConfigured'), 'health endpoint must expose non-sensitive WeChat login readiness');
assert(healthController.includes('paymentProvider'), 'health endpoint must expose current payment provider for live verification');
assert(healthController.includes('wechatPayConfigured'), 'health endpoint must expose whether WeChat Pay runtime config is complete');
assert(healthController.includes('locationMode'), 'health endpoint must expose current location-mode boundary for live verification');
assert(deployScript.includes('APP_RELEASE_ID=${RELEASE_ID}'), 'deployment script must write APP_RELEASE_ID for live release verification');
assert(
  deployScript.includes('COMMERCIAL_RUNTIME_REQUIRED="${COMMERCIAL_RUNTIME_REQUIRED:-0}"'),
  'deployment script must support an explicit commercial-runtime gate before a real-market deploy',
);
assert(
  deployScript.includes('WECHAT_APP_SECRET') && deployScript.includes('PAY_PROVIDER') && deployScript.includes('WECHAT_MCH_ID'),
  'deployment script commercial-runtime gate must validate WeChat login and payment essentials',
);
assert(
  deployScript.includes('RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"'),
  'deployment script must allow a caller-supplied RELEASE_ID for deterministic post-deploy verification',
);
assert(
  deployScript.includes('EXPECTED_RELEASE_ID=${RELEASE_ID} npm run live:commercial-readiness'),
  'deployment script must print the exact expected-release live readiness command after deploy',
);
assert(liveReadinessScript.includes('EXPECTED_RELEASE_ID'), 'live readiness gate must support expected release verification after deploy');
assert(liveReadinessScript.includes('runtimeConfigFailures'), 'live readiness gate must fail clearly when auth/pay runtime config is not commercially ready');
assert(liveReadinessScript.includes('wechatLoginConfigured'), 'live readiness gate must read WeChat login runtime readiness');
assert(liveReadinessScript.includes('paymentProvider'), 'live readiness gate must read current payment provider');
assert(liveReadinessScript.includes('wechatPayConfigured'), 'live readiness gate must read WeChat Pay runtime readiness');

const checklist = readText('docs/launch-readiness-checklist.md');
assert(
  checklist.includes('npm run first-stage:readiness'),
  'launch readiness checklist must document npm run first-stage:readiness',
);
const deploymentRunbook = readText('docs/aliyun-ecs-deployment-runbook.md');
assert(
  deploymentRunbook.includes('prepare-wechat-pay-env.sh'),
  'deployment runbook must document the WeChat Pay env helper script',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'first-stage-readiness',
      requiredChecks: requiredChecks.length,
    },
    null,
    2,
  ),
);
