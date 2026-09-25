import assert from 'node:assert/strict';
import { createCipheriv, createSign, generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const servicePath = fileURLToPath(new URL('../apps/api/dist/payments/payments.service.js', import.meta.url));
const utilsPath = fileURLToPath(new URL('../apps/api/dist/payments/wechat-pay.utils.js', import.meta.url));

assert(existsSync(servicePath), 'Build output for payments.service.js must exist before running live wireup regression');
assert(existsSync(utilsPath), 'Build output for wechat-pay.utils.js must exist before running live wireup regression');

const { PaymentsService } = await import(pathToFileURL(servicePath).href);
const { buildWechatPaySignatureMessage } = await import(pathToFileURL(utilsPath).href);

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const envBackup = { ...process.env };
process.env.PAY_PROVIDER = 'wechat';
process.env.WECHAT_APP_ID = 'wx1234567890abcdef';
process.env.WECHAT_MCH_ID = '1900000109';
process.env.WECHAT_PAY_NOTIFY_URL = 'https://example.com/payments/wechat/notify';
process.env.WECHAT_PAY_MERCHANT_SERIAL_NO = 'serial-20260728';
process.env.WECHAT_PAY_PRIVATE_KEY_PEM = privateKey.replace(/\n/g, '\\n');
process.env.WECHAT_PAY_PUBLIC_KEY_ID = 'pub-key-id';
process.env.WECHAT_PAY_PUBLIC_KEY_PEM = publicKey.replace(/\n/g, '\\n');
process.env.WECHAT_PAY_API_V3_KEY = '12345678901234567890123456789012';
process.env.WECHAT_PAY_BASE_URL = 'https://mock-wechatpay.local';

const db = {
  users: [
    {
      id: 'user_live_pay',
      openId: 'openid_live_pay',
      nickname: '真实支付测试用户',
      city: '长治',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  sessions: [],
  adminAccounts: [],
  adminSessions: [],
  works: [
    {
      id: 'work_live_pay',
      userId: 'user_live_pay',
      title: '鲜果毕业蛋糕',
      prompt: '鲜果毕业蛋糕',
      imageUrl: 'mock://work_live_pay',
      scenario: '毕业',
      style: '清新水果',
      color: '白绿',
      size: '6寸',
      budget: '299',
      visibility: 'public',
      reviewStatus: 'approved',
      createdAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  demands: [
    {
      id: 'demand_live_pay',
      userId: 'user_live_pay',
      workId: 'work_live_pay',
      title: '鲜果毕业蛋糕制作',
      description: '需要在长治同城配送',
      city: '长治',
      district: '潞州区',
      expectedDate: '2026-08-01',
      budget: '299',
      servings: '8-10人',
      deliveryMethod: '同城配送',
      allowAdjustments: true,
      contact: '13800000000',
      status: 'selected',
      reviewStatus: 'approved',
      createdAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  bakers: [
    {
      id: 'baker_live_pay',
      userId: 'baker_user_live_pay',
      name: '测试蛋糕师',
      city: '长治',
      district: '潞州区',
      deliveryRadiusKm: 8,
      specialties: ['鲜果'],
      startingPrice: 268,
      contact: 'wechat_baker',
      bio: 'test baker',
      portfolio: [],
      healthCertificateUrl: 'upload://health',
      businessLicenseUrl: 'upload://license',
      reviewStatus: 'approved',
      createdAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  quotes: [
    {
      id: 'quote_live_pay',
      demandId: 'demand_live_pay',
      bakerId: 'baker_live_pay',
      amount: 299,
      deliveryFee: 20,
      availableDate: '2026-08-01',
      productionDays: 2,
      decision: 'as_designed',
      adjustmentNote: '',
      message: '可以制作',
      status: 'selected',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  payments: [],
  orders: [
    {
      id: 'order_live_pay',
      userId: 'user_live_pay',
      workId: 'work_live_pay',
      demandId: 'demand_live_pay',
      quoteId: 'quote_live_pay',
      bakerId: 'baker_live_pay',
      amount: 319,
      status: 'intent_confirmed',
      city: '长治',
      district: '潞州区',
      deliveryMethod: '同城配送',
      expectedDate: '2026-08-01',
      contact: '13800000000',
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: '2026-07-28T00:00:00.000Z',
    },
  ],
  fulfillments: [],
  refundRequests: [],
  supportTickets: [],
  rewardReviews: [],
  designTasks: [],
  designTaskJoins: [],
  designTaskCompletions: [],
  interactions: [],
  wallets: [],
  checkIns: [],
  uploads: [],
  auditLogs: [],
};

const fakeStore = {
  async read() {
    return structuredClone(db);
  },
  async write(next) {
    Object.keys(db).forEach((key) => {
      db[key] = structuredClone(next[key]);
    });
    return structuredClone(db);
  },
  async mutate(mutator) {
    const clone = structuredClone(db);
    const result = mutator(clone);
    Object.keys(db).forEach((key) => {
      db[key] = structuredClone(clone[key]);
    });
    return result;
  },
};

const fetchCalls = [];
global.fetch = async (url, options = {}) => {
  fetchCalls.push({
    url: String(url),
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ? String(options.body) : '',
  });

  if (String(url).includes('/v3/pay/transactions/jsapi')) {
    return new Response(JSON.stringify({ prepay_id: 'wx_prepay_live_123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (String(url).includes('/v3/pay/transactions/out-trade-no/')) {
    const outTradeNo = String(url).split('/out-trade-no/')[1].split('?')[0];
    return new Response(
      JSON.stringify({
        out_trade_no: decodeURIComponent(outTradeNo),
        transaction_id: '42000000000000000001',
        trade_state: 'SUCCESS',
        trade_state_desc: '支付成功',
        success_time: '2026-07-28T08:00:00+08:00',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  if (String(url).includes('/v3/refund/domestic/refunds')) {
    return new Response(
      JSON.stringify({
        out_refund_no: JSON.parse(String(options.body || '{}')).out_refund_no,
        refund_id: 'wx_refund_remote_001',
        status: 'PROCESSING',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  throw new Error(`Unexpected fetch url: ${url}`);
};

const service = new PaymentsService(fakeStore);

const created = await service.create({
  quoteId: 'quote_live_pay',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
});

assert.equal(created.provider, 'wechat', 'Live payment create must use provider=wechat');
assert.equal(created.status, 'pending', 'Live payment must start pending before callback or sync');
assert.equal(created.orderId, 'order_live_pay', 'Live payment must link to the recoverable order');
assert.equal(created.prepayId, 'wx_prepay_live_123', 'Live payment must persist the prepay id');
assert.match(created.payParams.package, /^prepay_id=/, 'Live payment must expose mini-program package value');
assert.equal(fetchCalls[0].method, 'POST', 'Create payment must call WeChat JSAPI create order endpoint');
assert(fetchCalls[0].url.includes('/v3/pay/transactions/jsapi'), 'Create payment must call the JSAPI order endpoint');
assert(String(fetchCalls[0].headers.Authorization || '').startsWith('WECHATPAY2-SHA256-RSA2048 '), 'Create payment must sign the WeChat request');

const createBody = JSON.parse(fetchCalls[0].body);
assert.equal(createBody.payer.openid, 'openid_live_pay', 'Create payment must send the authenticated user openid');
assert.equal(createBody.out_trade_no, created.id, 'Create payment must use the payment id as out_trade_no');

const synced = await service.sync(created.id, 'user_live_pay');
assert.equal(synced.status, 'paid', 'Sync must update WeChat payment to paid after trade_state=SUCCESS');
assert.equal(synced.transactionId, '42000000000000000001', 'Sync must persist the WeChat transaction id');
assert.equal(synced.tradeState, 'SUCCESS', 'Sync must persist the trade state');
assert.equal(synced.tradeStateDesc, '支付成功', 'Sync must persist the trade state description');
assert(fetchCalls[1].url.includes(`/v3/pay/transactions/out-trade-no/${created.id}`), 'Sync must query payment state by out_trade_no');

const transactionNotifyResource = JSON.stringify({
  out_trade_no: created.id,
  transaction_id: '42000000000000000009',
  trade_state: 'SUCCESS',
  trade_state_desc: '支付成功',
  success_time: '2026-07-28T08:05:00+08:00',
});
const notifyNonce = 'notify-nonce-20260728';
const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(notifyNonce, 'utf8'));
cipher.setAAD(Buffer.from('transaction', 'utf8'));
const encrypted = Buffer.concat([cipher.update(transactionNotifyResource, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();
const rawNotifyBody = JSON.stringify({
  id: 'notify_001',
  event_type: 'TRANSACTION.SUCCESS',
  resource: {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
    associated_data: 'transaction',
    nonce: notifyNonce,
  },
});

const callbackTimestamp = '1785265357';
const callbackNonce = 'callback-nonce-001';
const callbackSigner = createSign('RSA-SHA256');
callbackSigner.update(
  buildWechatPaySignatureMessage({
    timestamp: callbackTimestamp,
    nonceStr: callbackNonce,
    body: rawNotifyBody,
  }),
);
callbackSigner.end();
const callbackSignature = callbackSigner.sign(privateKey, 'base64');

const notifyResult = await service.handleWechatNotify({
  headers: {
    'wechatpay-timestamp': callbackTimestamp,
    'wechatpay-nonce': callbackNonce,
    'wechatpay-signature': callbackSignature,
    'wechatpay-serial': 'pub-key-id',
  },
  rawBody: rawNotifyBody,
});

assert.deepEqual(notifyResult, { code: 'SUCCESS', message: '成功' }, 'Notify handler must acknowledge successful callback processing');

const storedPayment = (await fakeStore.read()).payments.find((item) => item.id === created.id);
assert.equal(storedPayment.notifyId, 'notify_001', 'Notify handler must persist notify id');
assert.equal(storedPayment.transactionId, '42000000000000000009', 'Notify handler must update transaction id from callback resource');
assert.equal(storedPayment.paidAt, '2026-07-28T08:05:00+08:00', 'Notify handler must persist callback success time');

db.supportTickets.push({
  id: 'ticket_refund_live_1',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
  type: '退款申请',
  contact: '13800000000',
  description: '用户申请退款',
  evidenceNote: '成品与确认图差异较大',
  status: 'pending',
  createdAt: '2026-07-28T08:10:00.000Z',
  updatedAt: '2026-07-28T08:10:00.000Z',
});
db.refundRequests.push({
  id: 'refund_request_live_1',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
  bakerId: 'baker_live_pay',
  paymentId: created.id,
  supportTicketId: 'ticket_refund_live_1',
  reason: '成品差异',
  description: '用户申请退款',
  evidenceImages: ['upload://supportEvidence/refund-live-1'],
  evidenceNote: '成品与确认图差异较大',
  requestedAmount: 319,
  contact: '13800000000',
  status: 'pending_baker',
  createdAt: '2026-07-28T08:10:00.000Z',
  updatedAt: '2026-07-28T08:10:00.000Z',
});

const refundCreated = await service.createRefund({
  paymentId: created.id,
  refundRequestId: 'refund_request_live_1',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
  amount: 319,
  reason: '成品差异',
});
assert.equal(refundCreated.provider, 'wechat', 'WeChat refund must keep provider=wechat');
assert.equal(refundCreated.kind, 'refund', 'Refund payment must be recorded as kind=refund');
assert.equal(refundCreated.status, 'pending', 'Processing WeChat refund must not be marked as refunded immediately');
assert.equal(refundCreated.providerRefundId, 'wx_refund_remote_001', 'Refund create must persist remote refund id');
assert(fetchCalls[2].url.includes('/v3/refund/domestic/refunds'), 'Refund create must call the WeChat refund endpoint');
const refundCreateBody = JSON.parse(fetchCalls[2].body);
assert.equal(refundCreateBody.transaction_id, '42000000000000000009', 'Refund create must use the WeChat transaction id when available');
assert.equal(refundCreateBody.amount.refund, 31900, 'Refund create must convert refund amount to fen');
assert.equal(refundCreateBody.amount.total, 31900, 'Refund create must include original payment total in fen');

const refundNotifyResource = JSON.stringify({
  out_refund_no: refundCreated.id,
  refund_id: 'wx_refund_remote_001',
  refund_status: 'SUCCESS',
  success_time: '2026-07-28T08:15:00+08:00',
});
const refundNotifyNonce = 'refund-notify-0728';
const refundCipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(refundNotifyNonce, 'utf8'));
refundCipher.setAAD(Buffer.from('refund', 'utf8'));
const refundEncrypted = Buffer.concat([refundCipher.update(refundNotifyResource, 'utf8'), refundCipher.final()]);
const refundAuthTag = refundCipher.getAuthTag();
const rawRefundNotifyBody = JSON.stringify({
  id: 'notify_refund_001',
  event_type: 'REFUND.SUCCESS',
  resource: {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([refundEncrypted, refundAuthTag]).toString('base64'),
    associated_data: 'refund',
    nonce: refundNotifyNonce,
  },
});
const refundNotifySignature = signCallback(rawRefundNotifyBody, 'callback-nonce-refund-1');
const refundNotifyResult = await service.handleWechatNotify({
  headers: {
    'wechatpay-timestamp': callbackTimestamp,
    'wechatpay-nonce': 'callback-nonce-refund-1',
    'wechatpay-signature': refundNotifySignature,
    'wechatpay-serial': 'pub-key-id',
  },
  rawBody: rawRefundNotifyBody,
});
assert.deepEqual(refundNotifyResult, { code: 'SUCCESS', message: '成功' }, 'Refund notify handler must acknowledge successful callback processing');

const refundStoredState = await fakeStore.read();
const storedRefundPayment = refundStoredState.payments.find((item) => item.id === refundCreated.id);
assert.equal(storedRefundPayment.status, 'refunded', 'Refund notify must mark refund payment as refunded after success');
assert.equal(storedRefundPayment.refundedAt, '2026-07-28T08:15:00+08:00', 'Refund notify must persist refund success time');
const storedRefundRequest = refundStoredState.refundRequests.find((item) => item.id === 'refund_request_live_1');
assert.equal(storedRefundRequest.status, 'refunded', 'Refund notify must move refund request to refunded');
const storedRefundTicket = refundStoredState.supportTickets.find((item) => item.id === 'ticket_refund_live_1');
assert.equal(storedRefundTicket.status, 'resolved', 'Refund notify must resolve the linked support ticket');

db.supportTickets.push({
  id: 'ticket_refund_closed_1',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
  type: '退款申请',
  contact: '13800000000',
  description: '第二笔退款异常测试',
  evidenceNote: '用于验证关闭回调',
  status: 'processing',
  createdAt: '2026-07-28T08:20:00.000Z',
  updatedAt: '2026-07-28T08:20:00.000Z',
});
db.refundRequests.push({
  id: 'refund_request_closed_1',
  orderId: 'order_live_pay',
  userId: 'user_live_pay',
  bakerId: 'baker_live_pay',
  paymentId: created.id,
  refundPaymentId: 'refund_pay_closed_1',
  supportTicketId: 'ticket_refund_closed_1',
  reason: '退款关闭测试',
  description: '第二笔退款异常测试',
  evidenceImages: [],
  evidenceNote: '用于验证关闭回调',
  requestedAmount: 100,
  approvedAmount: 100,
  contact: '13800000000',
  status: 'refund_processing',
  bakerDecision: 'agree',
  createdAt: '2026-07-28T08:20:00.000Z',
  updatedAt: '2026-07-28T08:20:00.000Z',
});
db.payments.push({
  id: 'refund_pay_closed_1',
  quoteId: 'quote_live_pay',
  userId: 'user_live_pay',
  amount: 100,
  provider: 'wechat',
  status: 'pending',
  kind: 'refund',
  orderId: 'order_live_pay',
  refundRequestId: 'refund_request_closed_1',
  providerRefundId: 'wx_refund_closed_001',
  payParams: {},
  createdAt: '2026-07-28T08:20:00.000Z',
  paidAt: '2026-07-28T08:05:00+08:00',
});

const closedRefundNotifyResource = JSON.stringify({
  out_refund_no: 'refund_pay_closed_1',
  refund_id: 'wx_refund_closed_001',
  refund_status: 'CLOSED',
});
const closedRefundNonce = 'refund-closed-0728';
const closedRefundCipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(closedRefundNonce, 'utf8'));
closedRefundCipher.setAAD(Buffer.from('refund', 'utf8'));
const closedRefundEncrypted = Buffer.concat([closedRefundCipher.update(closedRefundNotifyResource, 'utf8'), closedRefundCipher.final()]);
const closedRefundAuthTag = closedRefundCipher.getAuthTag();
const rawClosedRefundNotifyBody = JSON.stringify({
  id: 'notify_refund_002',
  event_type: 'REFUND.CLOSED',
  resource: {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([closedRefundEncrypted, closedRefundAuthTag]).toString('base64'),
    associated_data: 'refund',
    nonce: closedRefundNonce,
  },
});
const closedRefundNotifySignature = signCallback(rawClosedRefundNotifyBody, 'callback-nonce-refund-2');
await service.handleWechatNotify({
  headers: {
    'wechatpay-timestamp': callbackTimestamp,
    'wechatpay-nonce': 'callback-nonce-refund-2',
    'wechatpay-signature': closedRefundNotifySignature,
    'wechatpay-serial': 'pub-key-id',
  },
  rawBody: rawClosedRefundNotifyBody,
});

const closedRefundState = await fakeStore.read();
const closedRefundPayment = closedRefundState.payments.find((item) => item.id === 'refund_pay_closed_1');
assert.equal(closedRefundPayment.status, 'failed', 'Refund CLOSED notify must mark refund payment as failed');
const closedRefundRequest = closedRefundState.refundRequests.find((item) => item.id === 'refund_request_closed_1');
assert.equal(closedRefundRequest.status, 'refund_processing', 'Refund CLOSED notify must keep the refund request in manual follow-up state');
const closedRefundTicket = closedRefundState.supportTickets.find((item) => item.id === 'ticket_refund_closed_1');
assert.equal(closedRefundTicket.status, 'processing', 'Refund CLOSED notify must keep the linked support ticket in processing');
assert.match(closedRefundTicket.handlerNote, /CLOSED/, 'Refund CLOSED notify must explain that manual follow-up is needed');

Object.keys(process.env).forEach((key) => {
  if (!(key in envBackup)) {
    delete process.env[key];
  }
});
Object.assign(process.env, envBackup);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'wechat-pay-live-wireup',
    },
    null,
    2,
  ),
);

function signCallback(body, nonceStr) {
  const signer = createSign('RSA-SHA256');
  signer.update(
    buildWechatPaySignatureMessage({
      timestamp: callbackTimestamp,
      nonceStr,
      body,
    }),
  );
  signer.end();
  return signer.sign(privateKey, 'base64');
}
