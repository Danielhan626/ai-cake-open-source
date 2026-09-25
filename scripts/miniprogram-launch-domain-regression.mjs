import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function readOptionalText(path) {
  const fileUrl = new URL(`../${path}`, import.meta.url);
  return existsSync(fileUrl) ? readFileSync(fileUrl, 'utf8') : null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readProjectFiles(dir) {
  return readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return readProjectFiles(path);
    }
    if (!entry.isFile() || !/\.(js|json|wxml|wxss)$/.test(entry.name)) {
      return [];
    }
    const fileUrl = new URL(`../${path}`, import.meta.url);
    const size = statSync(fileUrl).size;
    if (size > 512 * 1024) {
      return [];
    }
    return [{ path, text: readFileSync(fileUrl, 'utf8') }];
  });
}

const miniProgramConfig = readText('apps/miniprogram/config/index.js');
const appConfig = JSON.parse(readText('apps/miniprogram/app.json'));
const projectConfig = JSON.parse(readText('apps/miniprogram/project.config.json'));
const privateProjectConfigText = readOptionalText('apps/miniprogram/project.private.config.json');
const privateProjectConfig = privateProjectConfigText ? JSON.parse(privateProjectConfigText) : null;
const deployScript = readText('scripts/deploy-aliyun-ecs.sh');
const launchChecklist = readOptionalText('docs/launch-readiness-checklist.md');
const miniProgramFiles = readProjectFiles('apps/miniprogram');
const isPublicLocalConfig = projectConfig.appid === 'touristappid';
const expectedApiBase = isPublicLocalConfig ? 'http://127.0.0.1:4000' : 'https://example.com';
const expectedUrlCheck = !isPublicLocalConfig;

assert(
  miniProgramConfig.includes(`apiBase: '${expectedApiBase}'`),
  `mini-program apiBase must use ${expectedApiBase}`,
);
assert(
  projectConfig.setting?.urlCheck === expectedUrlCheck,
  `project.config.json urlCheck must be ${expectedUrlCheck}`,
);
if (privateProjectConfig) {
  assert(
    privateProjectConfig.setting?.urlCheck === expectedUrlCheck,
    `project.private.config.json urlCheck must be ${expectedUrlCheck}`,
  );
}
assert(
  deployScript.includes('PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://${DEPLOY_DOMAIN}}"'),
  'deployment script must support HTTPS PUBLIC_ORIGIN from DEPLOY_DOMAIN',
);
assert(
  deployScript.includes('WECHAT_PAY_NOTIFY_URL=${PUBLIC_ORIGIN}/payments/wechat/notify'),
  'deployment script must derive WeChat Pay notify URL from PUBLIC_ORIGIN',
);
if (!isPublicLocalConfig) {
  assert(launchChecklist, 'production source must include the launch readiness checklist');
  assert(
    launchChecklist.includes(expectedApiBase) && launchChecklist.includes('urlCheck=true'),
    'launch checklist must document the production HTTPS domain and URL validation',
  );
}
assert(
  appConfig.permission?.['scope.userFuzzyLocation']?.desc,
  'mini-program app.json must declare scope.userFuzzyLocation when optional auto-location is enabled',
);
assert(
  (appConfig.requiredPrivateInfos || []).includes('getFuzzyLocation'),
  'mini-program app.json must declare getFuzzyLocation in requiredPrivateInfos when optional auto-location is enabled',
);
assert(
  miniProgramConfig.includes("locationMode: 'optional_auto_city'"),
  'mini-program config must record optional auto-city mode',
);
assert(
  miniProgramFiles.some((file) => file.path === 'apps/miniprogram/pages/home/home.js' && file.text.includes('wx.getFuzzyLocation')),
  'home page must call wx.getFuzzyLocation when optional auto-location is enabled',
);
assert(
  miniProgramFiles.some((file) => file.path === 'apps/miniprogram/pages/home/home.js' && file.text.includes('resolveCityFromLocation')),
  'home page must resolve the closest supported city from phone coordinates',
);
assert(
  miniProgramFiles.some((file) => file.path === 'apps/miniprogram/pages/home/home.js' && file.text.includes('runWithPrivacy')),
  'home page optional auto-location must still respect privacy authorization',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      mode: isPublicLocalConfig ? 'public-local' : 'production',
      apiBase: expectedApiBase,
      urlCheck: projectConfig.setting.urlCheck,
      locationPrivateInterface: 'enabled_optional_auto_city_fuzzy',
    },
    null,
    2,
  ),
);
