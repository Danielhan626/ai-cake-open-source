import { Body, Controller, Post, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { AiService, GenerateCakeInput, RefineCakeInput } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly actorService: ActorService,
  ) {}

  @Post('generate')
  async generate(@Body() input: GenerateCakeInput, @Req() request: ActorRequest) {
    await this.actorService.userIdFromRequest(request);
    return this.aiService.generateCake(input);
  }

  @Post('refine')
  async refine(@Body() input: RefineCakeInput, @Req() request: ActorRequest) {
    await this.actorService.userIdFromRequest(request);
    return this.aiService.refineCake(input);
  }
}
