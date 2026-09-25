import assert from 'node:assert/strict';
import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const distPath = fileURLToPath(new URL('../apps/api/dist/payments/wechat-pay.utils.js', import.meta.url));

assert(existsSync(distPath), 'Build output for wechat-pay.utils.js must exist before running regression');

const paymentUtils = await import(pathToFileURL(distPath).href);

const {
  buildMiniProgramPaySign,
  buildWechatPayAuthorization,
  buildWechatPaySignatureMessage,
  decryptWechatPayResource,
  generateWechatPayNonceStr,
  getWechatPayConfig,
  listWechatPayConfigProblems,
  verifyWechatPaySignature,
} = paymentUtils;

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const timeStamp = '1785265357';
const nonceStr = generateWechatPayNonceStr();
const body = JSON.stringify({
  mchid: '1900000109',
  appid: 'wx1234567890abcdef',
  description: '如意鲜果蛋糕测试订单',
});

const authorization = buildWechatPayAuthorization({
  method: 'POST',
  canonicalUrl: '/v3/pay/transactions/jsapi',
  body,
  timestamp: timeStamp,
  nonceStr,
  config: {
    mchId: '1900000109',
    merchantSerialNo: 'serial-20260728',
    merchantPrivateKeyPem: privateKey,
  },
});

assert(authorization.startsWith('WECHATPAY2-SHA256-RSA2048 '), 'Authorization header must use WeChat Pay RSA schema');
assert(authorization.includes('mchid="1900000109"'), 'Authorization header must include mchid');
assert(authorization.includes('serial_no="serial-20260728"'), 'Authorization header must include merchant serial number');

const signature = authorization.match(/signature="([^\"]+)"/)?.[1];
assert(signature, 'Authorization header must contain signature');

const responseSigner = createSign('RSA-SHA256');
responseSigner.update(buildWechatPaySignatureMessage({
  body,
  timestamp: timeStamp,
  nonceStr,
}));
responseSigner.end();
const responseSignature = responseSigner.sign(privateKey, 'base64');

assert(
  verifyWechatPaySignature({
    body,
    timestamp: timeStamp,
    nonceStr,
    signature: responseSignature,
    publicKeyPem: publicKey,
  }),
  'WeChat response signature verifier must accept the generated signature',
);

const packageValue = 'prepay_id=wx201410272009395522657a690389285100';
const paySign = buildMiniProgramPaySign({
  appId: 'wx1234567890abcdef',
  timeStamp,
  nonceStr,
  packageValue,
  merchantPrivateKeyPem: privateKey,
});

const payVerify = createVerify('RSA-SHA256');
payVerify.update(`wx1234567890abcdef\n${timeStamp}\n${nonceStr}\n${packageValue}\n`);
payVerify.end();
assert(payVerify.verify(publicKey, paySign, 'base64'), 'Mini-program paySign must verify against the merchant public key');

const apiV3Key = '12345678901234567890123456789012';
const associatedData = 'transaction';
const notifyNonce = 'nonce-20260728';
const resource = JSON.stringify({
  mchid: '1900000109',
  out_trade_no: 'pay_123',
  transaction_id: '4200000000000000001',
});

const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(notifyNonce, 'utf8'));
cipher.setAAD(Buffer.from(associatedData, 'utf8'));
const encrypted = Buffer.concat([cipher.update(resource, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();
const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64');

assert.equal(
  decryptWechatPayResource({
    apiV3Key,
    nonce: notifyNonce,
    associatedData,
    ciphertext,
  }),
  resource,
  'Wechat Pay AES-GCM decryptor must restore the callback resource payload',
);

const config = getWechatPayConfig({
  WECHAT_APP_ID: 'wx1234567890abcdef',
  WECHAT_MCH_ID: '1900000109',
  WECHAT_PAY_NOTIFY_URL: 'https://example.com/payments/wechat/notify',
  WECHAT_PAY_MERCHANT_SERIAL_NO: 'serial-20260728',
  WECHAT_PAY_PRIVATE_KEY_PEM: privateKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_PUBLIC_KEY_ID: 'pub-key-id',
  WECHAT_PAY_PUBLIC_KEY_PEM: publicKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_API_V3_KEY: apiV3Key,
});

assert(config, 'Wechat Pay config helper must accept a complete public-key-mode config');
assert.equal(config.baseUrl, 'https://api.mch.weixin.qq.com', 'Wechat Pay config helper must provide the default API base URL');
assert.equal(config.verifierMode, 'wechat-pay-public-key', 'Wechat Pay config helper must preserve public-key mode');
assert.equal(config.verifierSerialNo, 'pub-key-id', 'Wechat Pay config helper must expose the public-key serial');
assert.equal(config.verifierPublicKeyPem.trim(), publicKey.trim(), 'Wechat Pay config helper must normalize the public key PEM');

const platformCertConfig = getWechatPayConfig({
  WECHAT_APP_ID: 'wx1234567890abcdef',
  WECHAT_MCH_ID: '1900000109',
  WECHAT_PAY_NOTIFY_URL: 'https://example.com/payments/wechat/notify',
  WECHAT_PAY_MERCHANT_SERIAL_NO: 'serial-20260728',
  WECHAT_PAY_PRIVATE_KEY_PEM: privateKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO: 'platform-serial-20260728',
  WECHAT_PAY_PLATFORM_CERTIFICATE_PEM: publicKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_API_V3_KEY: apiV3Key,
});

assert(platformCertConfig, 'Wechat Pay config helper must accept a complete platform-certificate config');
assert.equal(platformCertConfig.verifierMode, 'platform-certificate', 'Wechat Pay config helper must preserve platform certificate mode');
assert.equal(platformCertConfig.verifierSerialNo, 'platform-serial-20260728', 'Wechat Pay config helper must expose the platform certificate serial');

const problems = listWechatPayConfigProblems({
  WECHAT_APP_ID: 'wx1234567890abcdef',
  WECHAT_MCH_ID: 'mock_mch_id',
  WECHAT_PAY_API_V3_KEY: 'short-key',
});

assert(problems.includes('WECHAT_MCH_ID'), 'Wechat Pay config problems must reject mock merchant ids');
assert(problems.includes('WECHAT_PAY_API_V3_KEY'), 'Wechat Pay config problems must validate API v3 key length');
assert(problems.includes('WECHAT_PAY_PRIVATE_KEY_PEM'), 'Wechat Pay config problems must report missing merchant private key');

const malformedPrivateKeyProblems = listWechatPayConfigProblems({
  WECHAT_APP_ID: 'wx1234567890abcdef',
  WECHAT_MCH_ID: '1900000109',
  WECHAT_PAY_NOTIFY_URL: 'https://example.com/payments/wechat/notify',
  WECHAT_PAY_MERCHANT_SERIAL_NO: 'serial-20260728',
  WECHAT_PAY_PRIVATE_KEY_PEM: ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
  WECHAT_PAY_PUBLIC_KEY_ID: 'pub-key-id',
  WECHAT_PAY_PUBLIC_KEY_PEM: publicKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_API_V3_KEY: apiV3Key,
});

assert(
  malformedPrivateKeyProblems.includes('WECHAT_PAY_PRIVATE_KEY_PEM'),
  'Wechat Pay config problems must reject malformed merchant private key PEM, not only missing keys',
);

const malformedVerifierProblems = listWechatPayConfigProblems({
  WECHAT_APP_ID: 'wx1234567890abcdef',
  WECHAT_MCH_ID: '1900000109',
  WECHAT_PAY_NOTIFY_URL: 'https://example.com/payments/wechat/notify',
  WECHAT_PAY_MERCHANT_SERIAL_NO: 'serial-20260728',
  WECHAT_PAY_PRIVATE_KEY_PEM: privateKey.replace(/\n/g, '\\n'),
  WECHAT_PAY_PUBLIC_KEY_ID: 'pub-key-id',
  WECHAT_PAY_PUBLIC_KEY_PEM: '-----BEGIN PUBLIC KEY-----',
  WECHAT_PAY_API_V3_KEY: apiV3Key,
});

assert(
  malformedVerifierProblems.includes('WECHAT_PAY_PUBLIC_KEY_PEM'),
  'Wechat Pay config problems must reject malformed verifier public key PEM, not only missing keys',
);

assert.equal(
  buildWechatPaySignatureMessage({
    timestamp: timeStamp,
    nonceStr,
    body,
  }),
  `${timeStamp}\n${nonceStr}\n${body}\n`,
  'Wechat Pay signature message helper must keep the official newline-delimited format',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      surface: 'wechat-pay-crypto',
    },
    null,
    2,
  ),
);
