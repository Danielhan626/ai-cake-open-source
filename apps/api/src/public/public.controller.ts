import { Body, Controller, Post } from '@nestjs/common';
import { CreateSupportTicketInput, PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Post('support-tickets')
  createSupportTicket(@Body() input: CreateSupportTicketInput) {
    return this.publicService.createSupportTicket(input);
  }
}
