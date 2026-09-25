import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreationCreditsService } from './creation-credits.service';

@Controller('creation-credits')
export class CreationCreditsController {
  constructor(
    private readonly creationCreditsService: CreationCreditsService,
    private readonly actorService: ActorService,
  ) {}

  @Get('summary')
  async summary(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.creationCreditsService.summary(userId);
  }

  @Get('recharge-orders')
  async listRechargeOrders(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.creationCreditsService.listRechargeOrders(userId);
  }

  @Post('recharge-orders')
  async createRechargeOrder(
    @Body() input: { userId?: string; productId?: string },
    @Req() request: ActorRequest,
  ) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.creationCreditsService.createRechargeOrder({ ...input, userId });
  }

  @Post('recharge-orders/:id/sync')
  async syncRechargeOrder(
    @Param('id') id: string,
    @Query('userId') fallbackUserId: string | undefined,
    @Req() request: ActorRequest,
  ) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.creationCreditsService.syncRechargeOrder(id, userId);
  }

  @Patch('recharge-orders/:id/mock-paid')
  async mockPaidRechargeOrder(@Param('id') id: string, @Req() request: ActorRequest) {
    const userId = await this.actorService.requiredUserIdFromRequest(request);
    return this.creationCreditsService.mockPaidRechargeOrder(id, userId);
  }

  @Post('wechat/notify')
  @HttpCode(200)
  async wechatNotify(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: ActorRequest & { rawBody?: Buffer },
  ) {
    return this.creationCreditsService.handleWechatNotify({
      headers,
      rawBody: request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(request.body || {}),
    });
  }
}
