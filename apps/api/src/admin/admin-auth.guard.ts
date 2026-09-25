import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminRequest, AdminSessionService } from './admin-session.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminSessionService: AdminSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest<AdminRequest>();
      request.admin = await this.adminSessionService.adminFromRequest(request);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Admin session token is required');
    }
  }
}
