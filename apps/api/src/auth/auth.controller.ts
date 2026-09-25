import { Body, Controller, Post, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from './actor.service';
import { AuthService, DevLoginInput, PhoneLoginInput, WechatLoginInput } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly actorService: ActorService,
  ) {}

  @Post('wechat-login')
  wechatLogin(@Body() input: WechatLoginInput) {
    return this.authService.wechatLogin(input);
  }

  @Post('phone-login')
  async phoneLogin(@Body() input: PhoneLoginInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.authService.phoneLogin({ ...input, userId });
  }

  @Post('dev-login')
  devLogin(@Body() input: DevLoginInput) {
    return this.authService.devLogin(input);
  }
}
