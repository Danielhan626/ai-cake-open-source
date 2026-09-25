import { readFileSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = JSON.parse(readText('package.json'));
const demandJs = readText('apps/miniprogram/pages/demand/demand.js');
const demandWxml = readText('apps/miniprogram/pages/demand/demand.wxml');
const bakersJs = readText('apps/miniprogram/pages/bakers/bakers.js');
const mineJs = readText('apps/miniprogram/pages/mine/mine.js');
const onboardingJs = readText('apps/miniprogram/pages/onboarding/onboarding.js');
const onboardingWxml = readText('apps/miniprogram/pages/onboarding/onboarding.wxml');
const bakersWxml = readText('apps/miniprogram/pages/bakers/bakers.wxml');
const bakersService = readText('apps/api/src/bakers/bakers.service.ts');
const envExample = readText('.env.example');
const deployScript = readText('scripts/deploy-aliyun-ecs.sh');
const apiJs = readText('apps/miniprogram/utils/api.js');

assert(
  packageJson.scripts['miniprogram:merchant-identity-regression'] === 'node scripts/miniprogram-merchant-identity-regression.mjs',
  'package scripts must expose miniprogram:merchant-identity-regression',
);

assert(demandJs.includes('syncCurrentBakerProfile'), 'demand page must refresh the current merchant profile from backend');
assert(demandJs.includes("/bakers/mine"), 'merchant-side demand page must use the owned baker profile endpoint');
assert(!/reviewStatus:\s*profile\.verifyStatus === '待平台审核' \? 'pending' : 'approved'/.test(demandJs), 'merchant review status must not treat every non-pending state as approved');
assert(demandJs.includes("this.data.baker.reviewStatus !== 'approved'"), 'merchant quoting must still require approved review status');
assert(mineJs.includes('syncCurrentBakerProfile'), 'Mine page must refresh owned merchant profile state');
assert(mineJs.includes('/bakers/mine'), 'Mine page must sync owned merchant profile from backend');
assert(onboardingJs.includes('missingCredentialLabels'), 'merchant onboarding must validate required credential uploads before submit');
assert(onboardingJs.includes('先上传资质图片'), 'merchant onboarding must explain missing credential uploads');
assert(!onboardingJs.includes('healthCertificateUrl: form.healthCertUrl || form.healthCert'), 'merchant onboarding must not treat typed health certificate text as an uploaded credential');
assert(!onboardingJs.includes('businessLicenseUrl: form.businessLicenseUrl || form.businessLicense'), 'merchant onboarding must not treat typed business-license text as an uploaded credential');
assert(!onboardingJs.includes('foodPermitUrl: form.foodPermitUrl || form.foodPermit'), 'merchant onboarding must not treat typed food-permit text as an uploaded credential');
assert(!onboardingWxml.includes('data-field="healthCert"'), 'health certificate credential must be uploaded, not manually typed');
assert(!onboardingWxml.includes('data-field="businessLicense"'), 'business license credential must be uploaded, not manually typed');
assert(!onboardingWxml.includes('data-field="foodPermit"'), 'food permit credential must be uploaded, not manually typed');
assert(!demandWxml.includes('健康证：已提交 · 营业执照：已提交'), 'recommended baker panel must not hard-code credential submission status');
assert(demandWxml.includes("baker.reviewStatus === 'approved'"), 'recommended baker panel must show platform review state');
assert(!bakersWxml.includes('健康证：已提交 · 营业执照：已提交'), 'baker listing must not hard-code credential submission status');
assert(bakersService.includes("item.source !== 'seed'"), 'public baker listing must filter out seed/demo merchants by default');
assert(envExample.includes('INCLUDE_SEED_BAKERS_IN_PUBLIC=0'), '.env.example must document that public seed bakers stay hidden by default');
assert(deployScript.includes('INCLUDE_SEED_BAKERS_IN_PUBLIC=0'), 'deployment script must pin public seed baker visibility off in production');
assert(bakersWxml.includes('当前城市商家招募中'), 'baker square must explain the zero-state when no approved real merchants exist');
assert(bakersJs.includes('goOnboarding'), 'baker square zero-state must offer merchant onboarding entry');
assert(apiJs.includes('请先上传健康证、营业执照和食品经营相关资质图片'), 'API errors for missing merchant credentials must be translated for users');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      gate: 'miniprogram-merchant-identity',
    },
    null,
    2,
  ),
);
