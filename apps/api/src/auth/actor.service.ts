import { Injectable, UnauthorizedException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { now, requiredString } from '../utils';

export interface ActorRequest {
  headers: {
    authorization?: string | string[];
  };
  body?: unknown;
  rawBody?: Buffer;
}

@Injectable()
export class ActorService {
  constructor(private readonly store: StoreService) {}

  async userIdFromRequest(request: ActorRequest, fallbackUserId?: unknown) {
    const token = this.bearerToken(request);
    if (token) {
      return this.userIdFromBearerToken(token);
    }

    if (this.isProduction()) {
      throw new UnauthorizedException('Authorization bearer token is required');
    }

    return requiredString(fallbackUserId, 'demo-user');
  }

  async requiredUserIdFromRequest(request: ActorRequest) {
    const token = this.bearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Authorization bearer token is required');
    }
    return this.userIdFromBearerToken(token);
  }

  async optionalUserIdFromRequest(request: ActorRequest) {
    const token = this.bearerToken(request);
    if (!token) {
      return '';
    }
    return this.userIdFromBearerToken(token);
  }

  private bearerToken(request: ActorRequest) {
    const header = request.headers.authorization;
    const authorization = Array.isArray(header) ? header[0] || '' : header || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') {
      return '';
    }
    return requiredString(token);
  }

  private async userIdFromBearerToken(token: string) {
    const db = await this.store.read();
    const session = db.sessions.find((item) => item.token === token);
    if (!session || session.expiresAt <= now()) {
      throw new UnauthorizedException('Session is invalid or expired');
    }
    return session.userId;
  }

  private isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  }
}
