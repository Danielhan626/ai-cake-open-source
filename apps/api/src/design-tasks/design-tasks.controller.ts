import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CompleteTaskInput, DesignTasksService, GenerateCandidatesInput, PublishTodayInput } from './design-tasks.service';

@Controller('design-tasks')
export class DesignTasksController {
  constructor(
    private readonly designTasksService: DesignTasksService,
    private readonly actorService: ActorService,
  ) {}

  @Get('today')
  async today(@Req() request: ActorRequest) {
    const userId = await this.actorService.optionalUserIdFromRequest(request);
    return this.designTasksService.today(userId);
  }

  @Post('generate-candidates')
  @UseGuards(AdminAuthGuard)
  generateCandidates(@Body() input: GenerateCandidatesInput) {
    return this.designTasksService.generateCandidates(input);
  }

  @Post('publish-today')
  @UseGuards(AdminAuthGuard)
  publishToday(@Body() input: PublishTodayInput) {
    return this.designTasksService.publishToday(input);
  }

  @Post(':id/join')
  async join(@Param('id') id: string, @Body('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.designTasksService.join(id, userId);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string, @Body() input: CompleteTaskInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.designTasksService.completeTask(id, { ...input, userId });
  }
}
