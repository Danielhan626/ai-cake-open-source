import { spawn } from 'node:child_process';

const shouldManageApi = !process.env.API_BASE;
const base = process.env.API_BASE || 'http://127.0.0.1:4102';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'dev-admin-password';
let apiProcess = null;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }
  return data;
}

async function expectFailure(label, path, options, expectedStatus, expectedText) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (response.status !== expectedStatus || !text.includes(expectedText)) {
    throw new Error(`Expected ${label} to fail with ${expectedStatus} containing "${expectedText}", got ${response.status}: ${text}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  if (shouldManageApi) {
    await run('npm', ['--workspace', 'apps/api', 'run', 'build']);
    apiProcess = startApi();
    await waitForHealth(base);
  }

  await expectFailure('anonymous admin overview', '/admin/overview', {}, 401, 'Admin session token is required');
  await expectFailure(
    'anonymous task candidate generation',
    '/design-tasks/generate-candidates',
    {
      method: 'POST',
      body: JSON.stringify({ operator: 'anonymous' }),
    },
    401,
    'Admin session token is required',
  );
  await expectFailure(
    'anonymous publish today',
    '/design-tasks/publish-today',
    {
      method: 'POST',
      body: JSON.stringify({
        operator: 'anonymous',
        taskIds: ['task_missing_probe'],
      }),
    },
    401,
    'Admin session token is required',
  );
  await expectFailure(
    'legacy admin password header in production',
    '/admin/overview',
    {
      headers: {
        'x-admin-password': adminPassword,
      },
    },
    401,
    'Admin session token is required',
  );
  await expectFailure(
    'bad admin login',
    '/admin/login',
    {
      method: 'POST',
      body: JSON.stringify({
        username: adminUsername,
        password: `${adminPassword}-wrong`,
      }),
    },
    401,
    'Invalid admin credentials',
  );
  await expectFailure(
    'wrong admin username',
    '/admin/login',
    {
      method: 'POST',
      body: JSON.stringify({
        username: `${adminUsername}-wrong`,
        password: adminPassword,
      }),
    },
    401,
    'Invalid admin credentials',
  );

  const session = await request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      username: adminUsername,
      password: adminPassword,
    }),
  });

  assert(session.token, 'admin login must return a token');
  assert(session.admin && session.admin.username === adminUsername, 'admin login must return admin profile');
  assert(Array.isArray(session.admin.roles), 'admin profile must include roles');
  assert(session.admin.roles.includes('operator'), 'default admin must include operator role');

  const me = await request('/admin/me', {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  assert(me.username === adminUsername, 'admin token must access current admin profile');

  const overview = await request('/admin/overview', {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  assert(overview.counts, 'admin token must access overview');

  const queue = await request('/admin/review-queue', {
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
  });
  assert(Array.isArray(queue.works), 'admin token must access review queue');

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        admin: session.admin.username,
        roles: session.admin.roles,
        protectedOperatorRoutes: ['generate-candidates', 'publish-today'],
      },
      null,
      2,
    ),
  );
} finally {
  await stopProcess(apiProcess);
}

function startApi() {
  return spawn('npm', ['--workspace', 'apps/api', 'run', 'start'], {
    cwd: new URL('..', import.meta.url),
    detached: true,
    env: {
      ...process.env,
      PORT: '4102',
      APP_ENV: 'production',
      ADMIN_USERNAME: adminUsername,
      ADMIN_PASSWORD: adminPassword,
      AI_PROVIDER: 'mock',
      BOT_LLM_PROVIDER: 'mock',
    },
    stdio: 'inherit',
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`[admin-auth] $ ${[command, ...args].join(' ')}`);
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
