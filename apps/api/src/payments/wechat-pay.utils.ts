import { createDecipheriv, createPublicKey, createSign, createVerify, randomBytes } from 'node:crypto';
import { requiredString } from '../utils';

export interface WechatPayConfig {
  appId: string;
  mchId: string;
  notifyUrl: string;
  merchantSerialNo: string;
  merchantPrivateKeyPem: string;
  verifierSerialNo: string;
  verifierPublicKeyPem: string;
  verifierMode: 'wechat-pay-public-key' | 'platform-certificate';
  publicKeyId: string;
  publicKeyPem: string;
  apiV3Key: string;
  baseUrl: string;
}

export interface WechatPaySignatureInput {
  timestamp: string;
  nonceStr: string;
  body: string;
}

export interface WechatPayDecryptInput {
  apiV3Key: string;
  nonce: string;
  associatedData?: string;
  ciphertext: string;
}

export function listWechatPayConfigProblems(env: Record<string, string | undefined> = process.env) {
  const problems: string[] = [];

  if (!requiredString(env.WECHAT_APP_ID)) {
    problems.push('WECHAT_APP_ID');
  }
  if (!requiredString(env.WECHAT_MCH_ID) || env.WECHAT_MCH_ID === 'mock_mch_id') {
    problems.push('WECHAT_MCH_ID');
  }
  if (!requiredString(env.WECHAT_PAY_NOTIFY_URL)) {
    problems.push('WECHAT_PAY_NOTIFY_URL');
  }
  if (!requiredString(env.WECHAT_PAY_MERCHANT_SERIAL_NO)) {
    problems.push('WECHAT_PAY_MERCHANT_SERIAL_NO');
  }
  const merchantPrivateKeyPem = requiredString(env.WECHAT_PAY_PRIVATE_KEY_PEM);
  if (!merchantPrivateKeyPem || !canSignWithPrivateKeyPem(merchantPrivateKeyPem)) {
    problems.push('WECHAT_PAY_PRIVATE_KEY_PEM');
  }
  const publicKeyId = requiredString(env.WECHAT_PAY_PUBLIC_KEY_ID);
  const publicKeyPem = requiredString(env.WECHAT_PAY_PUBLIC_KEY_PEM);
  const platformCertificateSerialNo = requiredString(env.WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO);
  const platformCertificatePem = requiredString(env.WECHAT_PAY_PLATFORM_CERTIFICATE_PEM);
  const hasPublicKeyVerifier = Boolean(publicKeyId && publicKeyPem);
  const hasPlatformCertificateVerifier = Boolean(platformCertificateSerialNo && platformCertificatePem);

  if (!hasPublicKeyVerifier && !hasPlatformCertificateVerifier) {
    if (!publicKeyId && !platformCertificateSerialNo) {
      problems.push('WECHAT_PAY_PUBLIC_KEY_ID');
    }
    if (!publicKeyPem && !platformCertificatePem) {
      problems.push('WECHAT_PAY_PUBLIC_KEY_PEM');
    }
  }
  if (publicKeyId && !publicKeyPem) {
    problems.push('WECHAT_PAY_PUBLIC_KEY_PEM');
  }
  if (publicKeyPem && !publicKeyId) {
    problems.push('WECHAT_PAY_PUBLIC_KEY_ID');
  }
  if (platformCertificateSerialNo && !platformCertificatePem) {
    problems.push('WECHAT_PAY_PLATFORM_CERTIFICATE_PEM');
  }
  if (platformCertificatePem && !platformCertificateSerialNo) {
    problems.push('WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO');
  }
  if (publicKeyId && publicKeyPem && !canParsePublicKeyPem(publicKeyPem)) {
    problems.push('WECHAT_PAY_PUBLIC_KEY_PEM');
  }
  if (
    platformCertificateSerialNo &&
    platformCertificatePem &&
    !canParsePublicKeyPem(platformCertificatePem)
  ) {
    problems.push('WECHAT_PAY_PLATFORM_CERTIFICATE_PEM');
  }
  if (requiredString(env.WECHAT_PAY_API_V3_KEY).length !== 32) {
    problems.push('WECHAT_PAY_API_V3_KEY');
  }

  return problems;
}

export function getWechatPayConfig(env: Record<string, string | undefined> = process.env): WechatPayConfig | null {
  const problems = listWechatPayConfigProblems(env);
  if (problems.length) {
    return null;
  }

  const publicKeyId = requiredString(env.WECHAT_PAY_PUBLIC_KEY_ID);
  const publicKeyPem = requiredString(env.WECHAT_PAY_PUBLIC_KEY_PEM);
  const platformCertificateSerialNo = requiredString(env.WECHAT_PAY_PLATFORM_CERTIFICATE_SERIAL_NO);
  const platformCertificatePem = requiredString(env.WECHAT_PAY_PLATFORM_CERTIFICATE_PEM);
  const verifierMode = publicKeyId && publicKeyPem ? 'wechat-pay-public-key' : 'platform-certificate';
  const verifierSerialNo = publicKeyId || platformCertificateSerialNo;
  const verifierPublicKeyPem = publicKeyPem || platformCertificatePem;

  return {
    appId: requiredString(env.WECHAT_APP_ID),
    mchId: requiredString(env.WECHAT_MCH_ID),
    notifyUrl: requiredString(env.WECHAT_PAY_NOTIFY_URL),
    merchantSerialNo: requiredString(env.WECHAT_PAY_MERCHANT_SERIAL_NO),
    merchantPrivateKeyPem: normalizePem(requiredString(env.WECHAT_PAY_PRIVATE_KEY_PEM)),
    verifierSerialNo,
    verifierPublicKeyPem: normalizePem(verifierPublicKeyPem),
    verifierMode,
    publicKeyId: verifierSerialNo,
    publicKeyPem: normalizePem(verifierPublicKeyPem),
    apiV3Key: requiredString(env.WECHAT_PAY_API_V3_KEY),
    baseUrl: requiredString(env.WECHAT_PAY_BASE_URL, 'https://api.mch.weixin.qq.com'),
  };
}

export function generateWechatPayNonceStr() {
  return randomBytes(16).toString('hex');
}

export function buildWechatPaySignatureMessage(input: WechatPaySignatureInput) {
  return `${input.timestamp}\n${input.nonceStr}\n${input.body}\n`;
}

export function buildWechatPayAuthorization(input: {
  method: string;
  canonicalUrl: string;
  body: string;
  timestamp: string;
  nonceStr: string;
  config: Pick<WechatPayConfig, 'mchId' | 'merchantSerialNo' | 'merchantPrivateKeyPem'>;
}) {
  const message = `${input.method.toUpperCase()}\n${input.canonicalUrl}\n${input.timestamp}\n${input.nonceStr}\n${input.body}\n`;
  const signature = signWechatPayMessage(message, input.config.merchantPrivateKeyPem);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${input.config.mchId}",nonce_str="${input.nonceStr}",timestamp="${input.timestamp}",serial_no="${input.config.merchantSerialNo}",signature="${signature}"`;
}

export function buildMiniProgramPaySign(input: {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  packageValue: string;
  merchantPrivateKeyPem: string;
}) {
  const message = `${input.appId}\n${input.timeStamp}\n${input.nonceStr}\n${input.packageValue}\n`;
  return signWechatPayMessage(message, input.merchantPrivateKeyPem);
}

export function verifyWechatPaySignature(input: {
  body: string;
  timestamp: string;
  nonceStr: string;
  signature: string;
  publicKeyPem: string;
}) {
  const verifier = createVerify('RSA-SHA256');
  verifier.update(buildWechatPaySignatureMessage({
    body: input.body,
    timestamp: input.timestamp,
    nonceStr: input.nonceStr,
  }));
  verifier.end();
  return verifier.verify(normalizePem(input.publicKeyPem), input.signature, 'base64');
}

export function decryptWechatPayResource(input: WechatPayDecryptInput) {
  const ciphertext = Buffer.from(input.ciphertext, 'base64');
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(input.apiV3Key, 'utf8'), Buffer.from(input.nonce, 'utf8'));
  if (input.associatedData) {
    decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plain.toString('utf8');
}

function signWechatPayMessage(message: string, merchantPrivateKeyPem: string) {
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(normalizePem(merchantPrivateKeyPem), 'base64');
}

function canSignWithPrivateKeyPem(value: string) {
  try {
    signWechatPayMessage('wechat-pay-config-check', value);
    return true;
  } catch {
    return false;
  }
}

function canParsePublicKeyPem(value: string) {
  try {
    createPublicKey(normalizePem(value));
    return true;
  } catch {
    return false;
  }
}

function normalizePem(value: string) {
  return value.replace(/\\n/g, '\n').trim();
}
