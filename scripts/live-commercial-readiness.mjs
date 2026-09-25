const publicBase = process.env.PUBLIC_BASE || 'https://example.com';
const marketCity = process.env.MARKET_CITY || '长治';
const encodedCity = encodeURIComponent(marketCity);
const guestUserId = process.env.GUEST_USER_ID || 'guest_live_check_20260728';
const demoUserId = process.env.DEMO_USER_ID || 'demo-user';
const expectedReleaseId = process.env.EXPECTED_RELEASE_ID || '';
const expectedLocationMode = process.env.EXPECTED_LOCATION_MODE || '';
const allowedLocationModes = ['manual_city', 'optional_auto_city'];

const protectedUserPaths = [
  `/profile/history?userId=${encodeURIComponent(demoUserId)}`,
  `/orders?userId=${encodeURIComponent(demoUserId)}`,
  `/payments?userId=${encodeURIComponent(demoUserId)}`,
  `/refunds?userId=${encodeURIComponent(demoUserId)}`,
  `/quotes?userId=${encodeURIComponent(demoUserId)}`,
];
const protectedAdminPaths = ['/admin/uploads/test/content'];
const protectedMutationChecks = [
  {
    surface: 'payments',
    path: '/payments/payment_probe_mock_paid/mock-paid',
    method: 'PATCH',
    acceptedStatuses: [401],
  },
  {
    surface: 'operator',
    path: '/design-tasks/publish-today',
    method: 'POST',
    acceptedStatuses: [401],
    body: JSON.stringify({
      operator: 'live-readiness-probe',
      taskIds: ['task_missing_probe_live'],
    }),
  },
  {
    surface: 'rewards',
    path: '/public/reward-reviews',
    method: 'POST',
    acceptedStatuses: [401, 404],
    body: JSON.stringify({
      userId: 'live-readiness-probe',
      workId: 'work_live_boundary_probe',
      amount: 20,
      reason: 'anonymous reward review must stay closed',
    }),
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${publicBase}${path}`, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    data,
    text,
  };
}

async function requestJson(path) {
  const result = await request(path);
  if (typeof result.data === 'string') {
    throw new Error(`${path} did not return JSON: ${result.text.slice(0, 160)}`);
  }
  if (!result.ok) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  return result.data;
}

async function requestHead(path) {
  const response = await fetch(`${publicBase}${path}`, {
    method: 'HEAD',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isDemoMerchant(item) {
  if (!item || typeof item !== 'object') return false;
  return (
    `${item.id || ''}`.startsWith('demo-') ||
    `${item.userId || ''}`.startsWith('demo-') ||
    `${item.contact || ''}`.includes('wechat_demo') ||
    `${item.healthCertificateUrl || ''}`.startsWith('mock://') ||
    `${item.businessLicenseUrl || ''}`.startsWith('mock://') ||
    `${item.foodPermitUrl || ''}`.startsWith('mock://')
  );
}

async function main() {
  const health = await requestJson('/health');
  assert(health && health.status === 'ok', 'public /health must return status=ok');
  const observedReleaseId = `${health.releaseId || ''}`;
  const wechatLoginConfigured = health.wechatLoginConfigured === true;
  const paymentProvider = `${health.paymentProvider || ''}`;
  const wechatPayConfigured = health.wechatPayConfigured === true;
  const locationMode = `${health.locationMode || ''}`;
  const releaseMismatch = expectedReleaseId
    ? observedReleaseId === expectedReleaseId
      ? null
      : { expectedReleaseId, observedReleaseId }
    : null;
  const runtimeConfigFailures = [];
  if (!wechatLoginConfigured) {
    runtimeConfigFailures.push({
      surface: 'auth',
      issue: 'wechatLoginConfigured',
      observed: health.wechatLoginConfigured,
    });
  }
  if (paymentProvider !== 'wechat') {
    runtimeConfigFailures.push({
      surface: 'payments',
      issue: 'paymentProvider',
      observed: paymentProvider || null,
    });
  } else if (!wechatPayConfigured) {
    runtimeConfigFailures.push({
      surface: 'payments',
      issue: 'wechatPayConfigured',
      observed: health.wechatPayConfigured,
    });
  }
  if (expectedLocationMode && locationMode !== expectedLocationMode) {
    runtimeConfigFailures.push({
      surface: 'location',
      issue: 'locationMode',
      observed: locationMode,
      expected: expectedLocationMode,
    });
  } else if (locationMode && !allowedLocationModes.includes(locationMode)) {
    runtimeConfigFailures.push({
      surface: 'location',
      issue: 'locationMode',
      observed: locationMode,
      expected: allowedLocationModes,
    });
  }

  const works = await requestJson('/works');
  assert(Array.isArray(works), 'public /works must return an array');

  const bakers = await requestJson(`/bakers?city=${encodedCity}`);
  assert(Array.isArray(bakers), 'public /bakers must return an array');
  const leakedDemoBakers = bakers.filter(isDemoMerchant).map((item) => ({
    id: item.id,
    userId: item.userId,
    contact: item.contact,
    healthCertificateUrl: item.healthCertificateUrl,
    businessLicenseUrl: item.businessLicenseUrl,
  }));

  const tasks = await requestJson(`/design-tasks/today?userId=${encodeURIComponent(guestUserId)}`);
  assert(tasks && Array.isArray(tasks.tasks), 'public /design-tasks/today must return tasks array');

  const opsResponse = await requestHead('/ops/');
  const protectedUserChecks = await Promise.all(
    protectedUserPaths.map(async (path) => {
      const result = await request(path);
      return {
        path,
        status: result.status,
        ok: result.ok,
      };
    }),
  );
  const protectedAdminChecks = await Promise.all(
    protectedAdminPaths.map(async (path) => {
      const result = await request(path);
      return {
        path,
        status: result.status,
        ok: result.ok,
      };
    }),
  );
  const protectedMutationResults = await Promise.all(
    protectedMutationChecks.map(async (check) => {
      const result = await request(check.path, {
        method: check.method,
        headers: check.body
          ? {
              'Content-Type': 'application/json',
            }
          : undefined,
        body: check.body,
      });
      return {
        surface: check.surface,
        path: check.path,
        method: check.method,
        status: result.status,
        ok: result.ok,
        acceptedStatuses: check.acceptedStatuses || [401],
      };
    }),
  );
  const authBoundaryFailures = [
    ...protectedUserChecks.filter((item) => item.status !== 401).map((item) => ({
      surface: 'user',
      path: item.path,
      status: item.status,
    })),
    ...protectedAdminChecks.filter((item) => item.status !== 401).map((item) => ({
      surface: 'admin',
      path: item.path,
      status: item.status,
    })),
    ...protectedMutationResults.filter((item) => !item.acceptedStatuses.includes(item.status)).map((item) => ({
      surface: item.surface,
      path: item.path,
      method: item.method,
      status: item.status,
    })),
  ];

  if (leakedDemoBakers.length || authBoundaryFailures.length || releaseMismatch || runtimeConfigFailures.length) {
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          gate: 'live-commercial-readiness',
          publicBase,
          marketCity,
          healthStatus: health.status,
          observedReleaseId,
          expectedReleaseId: expectedReleaseId || undefined,
          wechatLoginConfigured,
          paymentProvider: paymentProvider || null,
          wechatPayConfigured,
          locationMode: locationMode || null,
          expectedLocationMode: expectedLocationMode || undefined,
          publicWorkCount: works.length,
          opsStatus: opsResponse.status,
          leakedDemoBakers,
          authBoundaryFailures,
          releaseMismatch,
          runtimeConfigFailures,
          taskCount: tasks.tasks.length,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        gate: 'live-commercial-readiness',
        publicBase,
        marketCity,
        healthStatus: health.status,
        observedReleaseId,
        wechatLoginConfigured,
        paymentProvider,
        wechatPayConfigured,
        locationMode,
        expectedLocationMode: expectedLocationMode || undefined,
        publicWorkCount: works.length,
        opsStatus: opsResponse.status,
        publicBakerCount: bakers.length,
        protectedUserChecks,
        protectedAdminChecks,
        protectedMutationResults,
        taskCount: tasks.tasks.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        gate: 'live-commercial-readiness',
        publicBase,
        marketCity,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
