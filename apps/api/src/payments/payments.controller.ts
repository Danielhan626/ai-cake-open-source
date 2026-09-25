import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreatePaymentInput, PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  async list(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.paymentsService.list(userId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.paymentsService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreatePaymentInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.paymentsService.create({ ...input, userId });
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string, @Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.paymentsService.sync(id, userId);
  }

  @Post('wechat/notify')
  @HttpCode(200)
  async wechatNotify(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: ActorRequest & { rawBody?: Buffer },
  ) {
    return this.paymentsService.handleWechatNotify({
      headers,
      rawBody: request.rawBody ? request.rawBody.toString('utf8') : JSON.stringify(request.body || {}),
    });
  }

  @Patch(':id/mock-paid')
  async mockPaid(@Param('id') id: string, @Req() request: ActorRequest) {
    const userId = await this.actorService.requiredUserIdFromRequest(request);
    return this.paymentsService.mockPaid(id, userId);
  }
}
