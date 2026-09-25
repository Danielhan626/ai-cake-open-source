import { spawn } from 'node:child_process';

const apiBaseDev = 'http://127.0.0.1:4100';
const apiBaseProd = 'http://127.0.0.1:4101';

const staticChecks = [
  ['npm', ['run', 'miniprogram:v02-regression']],
  ['npm', ['run', 'miniprogram:v03-growth-regression']],
  ['npm', ['run', 'miniprogram:v04-order-regression']],
  ['npm', ['run', 'miniprogram:v04-history-regression']],
  ['npm', ['run', 'miniprogram:v04-share-regression']],
  ['npm', ['run', 'miniprogram:v04-baker-fulfillment-regression']],
  ['npm', ['run', 'miniprogram:city-order-regression']],
  ['npm', ['run', 'miniprogram:production-communication-regression']],
  ['npm', ['run', 'miniprogram:marketing-calendar-regression']],
  ['npm', ['run', 'miniprogram:bot-review-regression']],
  ['npm', ['run', 'miniprogram:creation-credit-regression']],
  ['npm', ['run', 'miniprogram:refund-regression']],
  ['npm', ['run', 'miniprogram:payment-boundary-regression']],
  ['npm', ['run', 'miniprogram:launch-domain-regression']],
  ['npm', ['run', 'miniprogram:post-launch-p0p1-regression']],
  ['npm', ['run', 'miniprogram:button-integrity-regression']],
  ['npm', ['run', 'miniprogram:login-return-regression']],
  ['npm', ['run', 'miniprogram:commercial-auth-regression']],
  ['npm', ['run', 'miniprogram:merchant-identity-regression']],
  ['npm', ['run', 'web:v04-fulfillment-regression']],
  ['npm', ['run', 'web:merchant-admin-regression']],
  ['sh', ['-c', "find apps/miniprogram -name '*.js' -print0 | xargs -0 -n1 node --check"]],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'aliyun-provider-regression']],
  ['npm', ['run', 'wechat-pay-crypto-regression']],
  ['npm', ['run', 'wechat-pay-env-prep-regression']],
  ['npm', ['run', 'wechat-pay-live-regression']],
  ['bash', ['-n', 'scripts/prepare-wechat-pay-env.sh']],
];

const devApiChecks = [
  ['npm', ['run', 'api:v03-growth-regression']],
  ['npm', ['run', 'api:v04-order-regression']],
  ['npm', ['run', 'api:v04-history-regression']],
  ['npm', ['run', 'api:v04-baker-fulfillment-regression']],
  ['npm', ['run', 'api:city-order-regression']],
  ['npm', ['run', 'api:production-communication-regression']],
  ['npm', ['run', 'api:marketing-calendar-regression']],
  ['npm', ['run', 'api:bot-review-regression']],
  ['npm', ['run', 'api:creation-credit-regression']],
  ['npm', ['run', 'api:refund-regression']],
  ['npm', ['run', 'api:baker-profile-regression']],
  ['npm', ['run', 'api:merchant-admin-regression']],
  ['npm', ['run', 'security-regression']],
  ['npm', ['run', 'smoke']],
];

const productionAuthChecks = [
  ['npm', ['run', 'production-auth-regression']],
  ['npm', ['run', 'admin-auth-regression']],
];

async function main() {
  console.log('[first-stage] Running static and build checks');
  for (const command of staticChecks) {
    await run(command[0], command[1]);
  }

  console.log('[first-stage] Starting local development API for API regressions');
  const devApi = startApi({
    HOST: '127.0.0.1',
    PORT: '4100',
    APP_ENV: 'development',
    ADMIN_PASSWORD: 'dev-admin-password',
    AI_PROVIDER: 'mock',
    BOT_LLM_PROVIDER: 'mock',
  });
  try {
    await waitForHealth(apiBaseDev);
    for (const command of devApiChecks) {
      await run(command[0], command[1], {
        API_BASE: apiBaseDev,
        ADMIN_PASSWORD: 'dev-admin-password',
      });
    }
  } finally {
    await stopProcess(devApi);
  }

  console.log('[first-stage] Starting local production-mode API for auth boundary regression');
  const prodApi = startApi({
    HOST: '127.0.0.1',
    PORT: '4101',
    APP_ENV: 'production',
    ADMIN_PASSWORD: 'dev-admin-password',
    AI_PROVIDER: 'mock',
    BOT_LLM_PROVIDER: 'mock',
  });
  try {
    await waitForHealth(apiBaseProd);
    for (const command of productionAuthChecks) {
      await run(command[0], command[1], {
        API_BASE: apiBaseProd,
      });
    }
  } finally {
    await stopProcess(prodApi);
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        gate: 'first-stage-readiness',
        staticChecks: staticChecks.length,
        devApiChecks: devApiChecks.length,
        productionAuthChecks: productionAuthChecks.length,
      },
      null,
      2,
    ),
  );
}

function startApi(env) {
  return spawn('npm', ['--workspace', 'apps/api', 'run', 'start'], {
    cwd: new URL('..', import.meta.url),
    detached: true,
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'inherit',
  });
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[first-stage] $ ${[command, ...args].join(' ')}`);
    const child = spawn(command, args, {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with ${signal || code}`));
    });
  });
}

async function waitForHealth(baseUrl) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`API did not become healthy at ${baseUrl}: ${lastError ? lastError.message : 'timeout'}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          // Already gone.
        }
      }
    }),
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
