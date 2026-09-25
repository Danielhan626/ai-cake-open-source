import { createHmac, timingSafeEqual } from 'node:crypto';

const defaultTtlSeconds = 7 * 24 * 60 * 60;

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signingSecret() {
  return (
    process.env.WORK_IMAGE_SIGNING_SECRET ||
    process.env.WECHAT_APP_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'dev-work-image-secret'
  );
}

function signatureFor(payload: string) {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

export function createWorkImageAccessToken(workId: string, ttlSeconds = defaultTtlSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ w: workId, e: expiresAt });
  const encodedPayload = base64UrlEncode(payload);
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function validateWorkImageAccessToken(workId: string, token?: string) {
  if (!token || !token.includes('.')) {
    return false;
  }

  const [encodedPayload, encodedSignature] = token.split('.', 2);
  if (!encodedPayload || !encodedSignature) {
    return false;
  }

  const expectedSignature = signatureFor(encodedPayload);
  const actualBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as { w?: string; e?: number };
    if (parsed.w !== workId) {
      return false;
    }
    if (!parsed.e || parsed.e < Math.floor(Date.now() / 1000)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildWorkImageUrl(workId: string, accessToken?: string) {
  const origin = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const path = `/works/${workId}/image${accessToken ? `?access=${encodeURIComponent(accessToken)}` : ''}`;
  return origin ? `${origin}${path}` : path;
}

export function presentedWorkImageUrl(work: {
  id: string;
  visibility?: string;
  reviewStatus?: string;
}) {
  const isPublicApproved = work.visibility === 'public' && work.reviewStatus === 'approved';
  return buildWorkImageUrl(work.id, isPublicApproved ? undefined : createWorkImageAccessToken(work.id));
}

export function presentWorkImage<T extends { id: string; imageUrl: string; visibility?: string; reviewStatus?: string } | null>(work: T): T {
  if (!work) {
    return work;
  }
  return {
    ...work,
    imageUrl: presentedWorkImageUrl(work),
  };
}
