import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreateDemandInput, DemandsService } from './demands.service';

@Controller('demands')
export class DemandsController {
  constructor(
    private readonly demandsService: DemandsService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  list(@Query('city') city?: string) {
    return this.demandsService.list(city);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: ActorRequest) {
    const userId = await this.actorService.optionalUserIdFromRequest(request);
    return this.demandsService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreateDemandInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.demandsService.create({ ...input, userId });
  }

}
