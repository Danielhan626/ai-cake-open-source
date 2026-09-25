import { Body, Controller, Post } from '@nestjs/common';
import { BotLlmService, BotReviewInput } from './bot-llm.service';

@Controller('bot-reviews')
export class BotReviewsController {
  constructor(private readonly botLlmService: BotLlmService) {}

  @Post('work')
  reviewWork(@Body() input: BotReviewInput) {
    return this.botLlmService.reviewWork(input);
  }
}
