import { BadGatewayException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { User } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';

export interface WechatLoginInput {
  code: string;
  nickname?: string;
  avatarUrl?: string;
  city?: string;
}

export interface PhoneLoginInput {
  userId: string;
  phoneCode: string;
}

export interface DevLoginInput {
  userId?: string;
  nickname?: string;
  city?: string;
}

interface WechatSessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WechatPhoneResponse {
  errcode?: number;
  errmsg?: string;
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly store: StoreService) {}

  async wechatLogin(input: WechatLoginInput) {
    const appId = requiredString(process.env.WECHAT_APP_ID);
    const appSecret = requiredString(process.env.WECHAT_APP_SECRET);
    const code = requiredString(input.code);

    if (!appId || !appSecret) {
      throw new BadGatewayException('WECHAT_APP_ID and WECHAT_APP_SECRET are required for WeChat login');
    }

    const params = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    const session = await this.getJson<WechatSessionResponse>(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`);
    if (session.errcode || !session.openid) {
      throw new BadGatewayException(session.errmsg || 'WeChat login failed');
    }

    const user = await this.store.mutate((db) => {
      const existing = db.users.find((item) => item.openId === session.openid);
      if (existing) {
        existing.nickname = requiredString(input.nickname, existing.nickname || '微信用户');
        existing.avatarUrl = input.avatarUrl || existing.avatarUrl;
        existing.city = input.city || existing.city;
        existing.unionId = session.unionid || existing.unionId;
        existing.updatedAt = now();
        return existing;
      }

      const next: User = {
        id: createId('user'),
        openId: session.openid,
        unionId: session.unionid,
        nickname: requiredString(input.nickname, '微信用户'),
        avatarUrl: input.avatarUrl || '',
        city: input.city || '长治',
        createdAt: now(),
        updatedAt: now(),
      };
      db.users.push(next);
      return next;
    });

    return {
      user,
      token: await this.createSession(user.id),
      hasPhone: Boolean(user.phoneNumber),
    };
  }

  async phoneLogin(input: PhoneLoginInput) {
    const userId = requiredString(input.userId);
    const phoneCode = requiredString(input.phoneCode);
    if (!userId) {
      throw new BadGatewayException('userId is required before phone login');
    }

    const accessToken = await this.getAccessToken();
    const phone = await this.getJson<WechatPhoneResponse>(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: phoneCode }),
    });

    if (phone.errcode || !phone.phone_info?.phoneNumber) {
      throw new BadGatewayException(phone.errmsg || 'WeChat phone login failed');
    }

    const user = await this.store.mutate((db) => {
      const existing = db.users.find((item) => item.id === userId);
      if (!existing) {
        throw new NotFoundException('User not found');
      }
      existing.phoneNumber = phone.phone_info?.phoneNumber;
      existing.updatedAt = now();
      return existing;
    });

    return {
      user,
      token: await this.createSession(user.id),
      hasPhone: true,
    };
  }

  async devLogin(input: DevLoginInput) {
    if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
      throw new UnauthorizedException('Developer login is disabled in production');
    }

    const userId = requiredString(input.userId, 'demo-user');
    const user = await this.store.mutate((db) => {
      const existing = db.users.find((item) => item.id === userId);
      if (existing) {
        existing.nickname = requiredString(input.nickname, existing.nickname);
        existing.city = requiredString(input.city, existing.city || '长治');
        existing.updatedAt = now();
        return existing;
      }

      const next: User = {
        id: userId,
        nickname: requiredString(input.nickname, '体验用户'),
        avatarUrl: '',
        city: requiredString(input.city, '长治'),
        createdAt: now(),
        updatedAt: now(),
      };
      db.users.push(next);
      return next;
    });

    return {
      user,
      token: await this.createSession(user.id),
      hasPhone: Boolean(user.phoneNumber),
    };
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await this.store.mutate((db) => {
      db.sessions = db.sessions.filter((item) => item.expiresAt > createdAt);
      db.sessions.push({
        token,
        userId,
        createdAt,
        expiresAt,
      });
    });
    return token;
  }

  private async getAccessToken() {
    const appId = requiredString(process.env.WECHAT_APP_ID);
    const appSecret = requiredString(process.env.WECHAT_APP_SECRET);
    if (!appId || !appSecret) {
      throw new BadGatewayException('WECHAT_APP_ID and WECHAT_APP_SECRET are required for phone login');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
    });
    const token = await this.getJson<WechatAccessTokenResponse>(`https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`);
    if (token.errcode || !token.access_token) {
      throw new BadGatewayException(token.errmsg || 'Failed to get WeChat access token');
    }
    return token.access_token;
  }

  private async getJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    const data = (await response.json()) as T;
    if (!response.ok) {
      throw new BadGatewayException(`WeChat API request failed: ${response.status}`);
    }
    return data;
  }
}
