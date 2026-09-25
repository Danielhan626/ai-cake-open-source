import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CheckInInput, InteractionInput, InteractionsService } from './interactions.service';

@Controller('interactions')
export class InteractionsController {
  constructor(
    private readonly interactionsService: InteractionsService,
    private readonly actorService: ActorService,
  ) {}

  @Get('summary')
  async summary(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.interactionsService.summary(userId);
  }

  @Post()
  async create(@Body() input: InteractionInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.interactionsService.create({ ...input, userId });
  }

  @Post('check-in')
  async checkIn(@Body() input: CheckInInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.interactionsService.checkIn({ ...input, userId });
  }
}
