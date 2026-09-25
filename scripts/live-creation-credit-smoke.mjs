import { execFileSync } from 'node:child_process';

const publicBase = process.env.PUBLIC_BASE || 'https://example.com';
const deployHost = process.env.DEPLOY_HOST || '203.0.113.10';
const deployUser = process.env.DEPLOY_USER || 'root';
const sshPort = process.env.SSH_PORT || '22';
const sshKey = process.env.SSH_KEY || `${process.env.HOME || '~'}/.ssh/aicake_aliyun_ed25519`;
const dbPath = process.env.DB_PATH || '/opt/aicake/shared/api-data/db.json';
const logPath = process.env.LOG_PATH || '/opt/aicake/shared/logs/api.log';
const logTailLines = parseInteger(process.env.LOG_TAIL_LINES, 80);
const expectedReleaseId = process.env.EXPECTED_RELEASE_ID || '';
const expectedLocationMode = process.env.EXPECTED_LOCATION_MODE || '';

const targetProductId = process.env.TARGET_PRODUCT_ID || 'credit_pack_60';
const targetUserId = process.env.TARGET_USER_ID || '';
const targetOrderId = process.env.TARGET_ORDER_ID || '';
const targetOutTradeNo = process.env.TARGET_OUT_TRADE_NO || '';
const sinceIso = process.env.SINCE_ISO || '';

const requireRechargeOrder = process.env.REQUIRE_RECHARGE_ORDER === '1';
const requireSettled = process.env.REQUIRE_SETTLED === '1';
const expectedOrderStatus = process.env.EXPECT_ORDER_STATUS || '';
const expectedTradeState = process.env.EXPECT_TRADE_STATE || '';
const expectedCredits = parseMaybeNumber(process.env.EXPECT_CREDITS);
const expectedAmount = parseMaybeNumber(process.env.EXPECT_AMOUNT);

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
  if (!result.ok) {
    throw new Error(`${path} returned HTTP ${result.status}`);
  }
  if (typeof result.data === 'string') {
    throw new Error(`${path} did not return JSON`);
  }
  return result.data;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(`${value || ''}`, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMaybeNumber(value) {
  if (value === undefined || value === null || `${value}`.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shellQuote(value) {
  return `'${`${value}`.replace(/'/g, `'\\''`)}'`;
}

function sshRun(command) {
  try {
    return execFileSync(
      'ssh',
      ['-i', sshKey, '-p', sshPort, `${deployUser}@${deployHost}`, command],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const stderr = error && error.stderr ? `${error.stderr}`.trim() : '';
    const stdout = error && error.stdout ? `${error.stdout}`.trim() : '';
    const detail = stderr || stdout || (error && error.message) || 'unknown ssh error';
    throw new Error(`SSH command failed: ${detail}`);
  }
}

function normalizeOrder(order) {
  return {
    id: `${order.id || ''}`,
    userId: `${order.userId || ''}`,
    productId: `${order.productId || ''}`,
    status: `${order.status || ''}`,
    provider: `${order.provider || ''}`,
    amount: typeof order.amount === 'number' ? order.amount : Number(order.amount || 0),
    credits: typeof order.credits === 'number' ? order.credits : Number(order.credits || 0),
    outTradeNo: `${order.outTradeNo || ''}`,
    tradeState: order.tradeState ? `${order.tradeState}` : '',
    tradeStateDesc: order.tradeStateDesc ? `${order.tradeStateDesc}` : '',
    createdAt: `${order.createdAt || ''}`,
    updatedAt: `${order.updatedAt || ''}`,
    paidAt: order.paidAt ? `${order.paidAt}` : '',
    lastSyncedAt: order.lastSyncedAt ? `${order.lastSyncedAt}` : '',
    transactionIdPresent: Boolean(order.transactionId),
    notifyIdPresent: Boolean(order.notifyId),
  };
}

function normalizeLedger(ledger) {
  return {
    id: `${ledger.id || ''}`,
    userId: `${ledger.userId || ''}`,
    delta: typeof ledger.delta === 'number' ? ledger.delta : Number(ledger.delta || 0),
    balanceAfter: typeof ledger.balanceAfter === 'number' ? ledger.balanceAfter : Number(ledger.balanceAfter || 0),
    source: `${ledger.source || ''}`,
    refId: `${ledger.refId || ''}`,
    reason: `${ledger.reason || ''}`,
    createdAt: `${ledger.createdAt || ''}`,
  };
}

function normalizeWallet(wallet) {
  return {
    userId: `${wallet.userId || ''}`,
    roseBalance: typeof wallet.roseBalance === 'number' ? wallet.roseBalance : Number(wallet.roseBalance || 0),
    creationCreditBalance:
      typeof wallet.creationCreditBalance === 'number'
        ? wallet.creationCreditBalance
        : Number(wallet.creationCreditBalance || 0),
    updatedAt: `${wallet.updatedAt || ''}`,
  };
}

function matchesTarget(order) {
  if (sinceIso && order.createdAt && order.createdAt < sinceIso) return false;
  if (targetUserId && order.userId !== targetUserId) return false;
  if (targetOrderId && order.id !== targetOrderId) return false;
  if (targetOutTradeNo && order.outTradeNo !== targetOutTradeNo) return false;
  if (targetProductId && order.productId !== targetProductId) return false;
  return true;
}

function summarizeLogLines(logText) {
  return `${logText || ''}`
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => /creation-credits|wechat|notify|credit_order|trade_state|TRANSACTION|BadGateway|Unauthorized/i.test(line))
    .slice(-20);
}

function evaluateChecks(input) {
  const failures = [];
  const health = input.health || {};
  if (health.status !== 'ok') {
    failures.push('public /health must return status=ok');
  }
  if (health.paymentProvider !== 'wechat') {
    failures.push(`paymentProvider must be wechat, observed ${health.paymentProvider || '<empty>'}`);
  }
  if (health.wechatPayConfigured !== true) {
    failures.push(`wechatPayConfigured must be true, observed ${health.wechatPayConfigured}`);
  }
  if (expectedReleaseId && health.releaseId !== expectedReleaseId) {
    failures.push(`releaseId must be ${expectedReleaseId}, observed ${health.releaseId || '<empty>'}`);
  }
  if (expectedLocationMode && health.locationMode !== expectedLocationMode) {
    failures.push(`locationMode must be ${expectedLocationMode}, observed ${health.locationMode || '<empty>'}`);
  }

  const latestOrder = input.latestOrder || null;
  if (requireRechargeOrder && !latestOrder) {
    failures.push('no matching creation-credit recharge order observed yet');
  }
  if (latestOrder) {
    if (expectedOrderStatus && latestOrder.status !== expectedOrderStatus) {
      failures.push(`latest order status must be ${expectedOrderStatus}, observed ${latestOrder.status || '<empty>'}`);
    }
    if (expectedTradeState && latestOrder.tradeState !== expectedTradeState) {
      failures.push(`latest order tradeState must be ${expectedTradeState}, observed ${latestOrder.tradeState || '<empty>'}`);
    }
    if (expectedCredits !== null && latestOrder.credits !== expectedCredits) {
      failures.push(`latest order credits must be ${expectedCredits}, observed ${latestOrder.credits}`);
    }
    if (expectedAmount !== null && latestOrder.amount !== expectedAmount) {
      failures.push(`latest order amount must be ${expectedAmount}, observed ${latestOrder.amount}`);
    }
    if (requireSettled) {
      if (latestOrder.status !== 'paid') {
        failures.push(`latest order is not paid yet, observed ${latestOrder.status || '<empty>'}`);
      }
      if (latestOrder.tradeState !== 'SUCCESS') {
        failures.push(`latest order tradeState is not SUCCESS, observed ${latestOrder.tradeState || '<empty>'}`);
      }
      if (!input.latestRechargeLedger) {
        failures.push('latest paid order is missing a recharge ledger entry');
      }
    }
  }
  return failures;
}

async function main() {
  const health = await requestJson('/health');

  const dbText = sshRun(`cat ${shellQuote(dbPath)}`);
  const db = JSON.parse(dbText || '{}');
  const allOrders = Array.isArray(db.creationRechargeOrders) ? db.creationRechargeOrders.map(normalizeOrder) : [];
  const allLedgers = Array.isArray(db.creationCreditLedgers) ? db.creationCreditLedgers.map(normalizeLedger) : [];
  const allWallets = Array.isArray(db.wallets) ? db.wallets.map(normalizeWallet) : [];

  const targetOrders = allOrders
    .filter(matchesTarget)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const targetOrderIds = new Set(targetOrders.map((item) => item.id));
  const targetUserIds = new Set(targetOrders.map((item) => item.userId).filter(Boolean));

  const rechargeLedgers = allLedgers
    .filter((item) => item.source === 'recharge')
    .filter((item) => (targetOrderIds.size ? targetOrderIds.has(item.refId) : true))
    .filter((item) => (targetUserId ? item.userId === targetUserId : true))
    .filter((item) => (sinceIso && item.createdAt ? item.createdAt >= sinceIso : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  rechargeLedgers.forEach((item) => targetUserIds.add(item.userId));
  const relatedWallets = targetUserIds.size
    ? allWallets
        .filter((item) => targetUserIds.has(item.userId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : [];

  const latestOrder = targetOrders[0] || null;
  const latestRechargeLedger = latestOrder
    ? rechargeLedgers.find((item) => item.refId === latestOrder.id) || null
    : null;
  const latestWallet = latestOrder
    ? relatedWallets.find((item) => item.userId === latestOrder.userId) || null
    : null;

  const logTail = summarizeLogLines(sshRun(`tail -n ${logTailLines} ${shellQuote(logPath)}`));
  const failures = evaluateChecks({
    health,
    latestOrder,
    latestRechargeLedger,
  });
  const smokeState = !latestOrder
    ? 'waiting_for_recharge_order'
    : latestOrder.status === 'paid' && latestOrder.tradeState === 'SUCCESS' && latestRechargeLedger
      ? 'settled'
      : latestOrder.status === 'paid'
        ? 'paid_needs_ledger_or_sync_check'
        : latestOrder.status === 'failed'
          ? 'failed'
          : 'pending_payment_or_callback';

  const result = {
    status: failures.length ? 'needs-attention' : smokeState === 'settled' ? 'ok' : smokeState,
    gate: 'live-creation-credit-smoke',
    smokeState,
    publicBase,
    deployHost,
    health: {
      status: `${health.status || ''}`,
      releaseId: `${health.releaseId || ''}`,
      paymentProvider: `${health.paymentProvider || ''}`,
      wechatPayConfigured: health.wechatPayConfigured === true,
      wechatLoginConfigured: health.wechatLoginConfigured === true,
      locationMode: `${health.locationMode || ''}`,
    },
    target: {
      productId: targetProductId || null,
      userId: targetUserId || null,
      orderId: targetOrderId || null,
      outTradeNo: targetOutTradeNo || null,
      sinceIso: sinceIso || null,
    },
    summary: {
      totalRechargeOrders: allOrders.length,
      matchingRechargeOrders: targetOrders.length,
      rechargeLedgers: rechargeLedgers.length,
      relatedWallets: relatedWallets.length,
    },
    latestOrder,
    recentOrders: targetOrders.slice(0, 3),
    latestRechargeLedger,
    recentRechargeLedgers: rechargeLedgers.slice(0, 3),
    latestWallet,
    relatedWallets: relatedWallets.slice(0, 3),
    logHints: logTail,
    failures,
  };

  if (failures.length) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

await main();
