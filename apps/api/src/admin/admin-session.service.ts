import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AdminAccount, AdminRole } from '../app.types';
import { StoreService } from '../store/store.service';
import { now, requiredString } from '../utils';

export interface AdminLoginInput {
  username?: string;
  password?: string;
}

export interface AdminRequest {
  headers: {
    authorization?: string | string[];
    'x-admin-password'?: string | string[] | undefined;
  };
  admin?: AdminAccount;
}

@Injectable()
export class AdminSessionService {
  constructor(private readonly store: StoreService) {}

  async login(input: AdminLoginInput) {
    const username = requiredString(input.username, process.env.ADMIN_USERNAME || 'admin');
    const password = requiredString(input.password);
    const configuredPassword = requiredString(process.env.ADMIN_PASSWORD);
    const configuredUsername = requiredString(process.env.ADMIN_USERNAME, 'admin');

    if (!configuredPassword) {
      throw new UnauthorizedException('ADMIN_PASSWORD must be configured for admin login');
    }
    if (username !== configuredUsername) {
      throw new UnauthorizedException('Invalid admin credentials');
    }
    if (password !== configuredPassword) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    const admin = await this.store.mutate((db) => {
      const existing = db.adminAccounts.find((item) => item.username === username);
      if (existing) {
        if (existing.status !== 'active') {
          throw new UnauthorizedException('Admin account is disabled');
        }
        existing.updatedAt = now();
        return existing;
      }

      const timestamp = now();
      const next: AdminAccount = {
        id: `admin_${username}`,
        username,
        displayName: username === 'admin' ? '平台管理员' : username,
        roles: this.defaultRoles(),
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.adminAccounts.push(next);
      return next;
    });

    return {
      admin: this.present(admin),
      token: await this.createSession(admin.id),
    };
  }

  async adminFromRequest(request: AdminRequest) {
    const token = this.bearerToken(request);
    if (token) {
      const db = await this.store.read();
      const session = db.adminSessions.find((item) => item.token === token);
      if (!session || session.expiresAt <= now()) {
        throw new UnauthorizedException('Admin session is invalid or expired');
      }
      const admin = db.adminAccounts.find((item) => item.id === session.adminId);
      if (!admin || admin.status !== 'active') {
        throw new UnauthorizedException('Admin account is disabled');
      }
      return admin;
    }

    if (!this.isProduction()) {
      return this.legacyPasswordAdmin(request);
    }

    throw new UnauthorizedException('Admin session token is required');
  }

  present(admin: AdminAccount) {
    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      roles: admin.roles,
      status: admin.status,
    };
  }

  private async legacyPasswordAdmin(request: AdminRequest) {
    const password = requiredString(process.env.ADMIN_PASSWORD);
    if (!password) {
      const db = await this.store.read();
      return db.adminAccounts.find((item) => item.status === 'active') || this.fallbackAdmin();
    }

    const header = request.headers['x-admin-password'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (provided !== password) {
      throw new UnauthorizedException('Admin password is required');
    }

    const db = await this.store.read();
    return db.adminAccounts.find((item) => item.username === (process.env.ADMIN_USERNAME || 'admin')) || this.fallbackAdmin();
  }

  private async createSession(adminId: string) {
    const token = randomBytes(32).toString('hex');
    const createdAt = now();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await this.store.mutate((db) => {
      db.adminSessions = db.adminSessions.filter((item) => item.expiresAt > createdAt);
      db.adminSessions.push({
        token,
        adminId,
        createdAt,
        expiresAt,
      });
    });
    return token;
  }

  private bearerToken(request: AdminRequest) {
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] || '' : header || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') {
      return '';
    }
    return requiredString(token);
  }

  private defaultRoles(): AdminRole[] {
    return ['owner', 'operator', 'support', 'finance'];
  }

  private fallbackAdmin(): AdminAccount {
    const timestamp = now();
    return {
      id: 'admin_owner',
      username: process.env.ADMIN_USERNAME || 'admin',
      displayName: '平台管理员',
      roles: this.defaultRoles(),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  }
}
