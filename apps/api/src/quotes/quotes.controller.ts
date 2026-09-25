import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreateQuoteInput, QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  async list(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.quotesService.list(userId);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.quotesService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreateQuoteInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.quotesService.create({ ...input, userId });
  }

  @Patch(':id/select')
  async select(@Param('id') id: string, @Body('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.quotesService.select(id, userId);
  }
}
