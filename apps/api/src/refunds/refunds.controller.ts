import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { BakerRefundResponseInput, CreateRefundRequestInput, RefundsService } from './refunds.service';

@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly refundsService: RefundsService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  async list(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.refundsService.list(userId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.refundsService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreateRefundRequestInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.refundsService.createRefundRequest({ ...input, userId });
  }

  @Patch(':id/baker-response')
  async bakerResponse(@Param('id') id: string, @Body() input: BakerRefundResponseInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.refundsService.respondAsBaker(id, { ...input, userId });
  }
}
