import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let apiBase = process.env.API_BASE || 'http://127.0.0.1:4102';

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function main() {
  const runId = `baker-profile-${Date.now().toString(36)}`;
  const publicSeedBakers = await request('/bakers?city=%E9%95%BF%E6%B2%BB');
  assert.equal(
    publicSeedBakers.some((item) => item.source === 'seed' || item.id === 'demo-baker'),
    false,
    'public baker listing must not expose seed/demo merchants by default',
  );

  const session = await request('/auth/dev-login', {
    method: 'POST',
    body: {
      userId: runId,
      nickname: `商家资料回归-${runId}`,
      city: '长治',
    },
  });

  const empty = await request('/bakers/mine', { token: session.token });
  assert.deepEqual(empty, [], 'new user should have no owned baker profile');

  let missingCredentialRejected = false;
  try {
    await request('/bakers', {
      method: 'POST',
      token: session.token,
      body: {
        userId: runId,
        name: `缺资质商家-${runId}`,
        city: '长治',
        district: '潞州区',
        deliveryRadiusKm: 8,
        specialties: ['鲜果', '生日'],
        startingPrice: 199,
        contact: 'merchant-contact',
        bio: '用于商家资质缺失回归测试。',
      },
    });
  } catch (error) {
    missingCredentialRejected = error.status === 400 && error.message.includes('healthCertificateUrl is required');
  }
  assert.equal(missingCredentialRejected, true, 'baker application must reject missing credential uploads');

  let mockCredentialRejected = false;
  try {
    await request('/bakers', {
      method: 'POST',
      token: session.token,
      body: {
        userId: runId,
        name: `假资质商家-${runId}`,
        city: '长治',
        district: '潞州区',
        deliveryRadiusKm: 8,
        specialties: ['鲜果', '生日'],
        startingPrice: 199,
        contact: 'merchant-contact',
        bio: '用于商家 mock 资质回归测试。',
        healthCertificateUrl: 'mock://health-certificate/new-baker',
        businessLicenseUrl: 'upload://license',
        foodPermitUrl: 'upload://food-permit',
      },
    });
  } catch (error) {
    mockCredentialRejected = error.status === 400 && error.message.includes('must be an uploaded credential file');
  }
  assert.equal(mockCredentialRejected, true, 'baker application must reject mock credential placeholders');

  const baker = await request('/bakers', {
    method: 'POST',
    token: session.token,
    body: {
      userId: runId,
      name: `真实商家-${runId}`,
      city: '长治',
      district: '潞州区',
      deliveryRadiusKm: 8,
      specialties: ['鲜果', '生日'],
      startingPrice: 199,
      contact: 'merchant-contact',
      bio: '用于商家身份回归测试。',
      healthCertificateUrl: 'upload://health',
      businessLicenseUrl: 'upload://license',
      foodPermitUrl: 'upload://food-permit',
    },
  });
  assert.equal(baker.userId, runId, 'created baker must belong to the session actor');
  assert.equal(baker.reviewStatus, 'pending', 'new baker should wait for platform review');

  const mine = await request('/bakers/mine', { token: session.token });
  assert.equal(mine.length, 1, 'owned baker profile should be returned');
  assert.equal(mine[0].id, baker.id, 'owned baker id should match created baker');
  assert.equal(mine[0].reviewStatus, 'pending', 'owned baker review status must be visible');

  let unauthorized = false;
  try {
    await request('/bakers/mine');
  } catch (error) {
    unauthorized = error.status === 401;
  }
  assert.equal(unauthorized, true, 'production-style owned baker profile endpoint must require actor auth');

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        surface: 'api-baker-owned-profile',
        bakerId: baker.id,
        reviewStatus: mine[0].reviewStatus,
      },
      null,
      2,
    ),
  );
}

async function runWithServer() {
  if (process.env.API_BASE) {
    await main();
    return;
  }

  await run('npm', ['--workspace', 'apps/api', 'run', 'build']);
  const child = spawn('npm', ['--workspace', 'apps/api', 'run', 'start'], {
    cwd: new URL('..', import.meta.url),
    detached: true,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '4102',
      APP_ENV: 'development',
      ADMIN_PASSWORD: 'dev-admin-password',
      AI_PROVIDER: 'mock',
      BOT_LLM_PROVIDER: 'mock',
    },
    stdio: 'inherit',
  });

  try {
    apiBase = 'http://127.0.0.1:4102';
    await waitForHealth(apiBase);
    await main();
  } finally {
    await stopProcess(child);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL('..', import.meta.url),
      env: process.env,
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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API did not become healthy: ${lastError ? lastError.message : 'timeout'}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

runWithServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
