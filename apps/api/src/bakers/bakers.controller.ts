import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { BakersService, CreateBakerInput } from './bakers.service';

@Controller('bakers')
export class BakersController {
  constructor(
    private readonly bakersService: BakersService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  list(@Query('city') city?: string) {
    return this.bakersService.list(city);
  }

  @Get('mine')
  async listMine(@Req() request: ActorRequest) {
    const userId = await this.actorService.requiredUserIdFromRequest(request);
    return this.bakersService.listMine(userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.bakersService.get(id);
  }

  @Post()
  async create(@Body() input: CreateBakerInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.bakersService.create({ ...input, userId });
  }
}
