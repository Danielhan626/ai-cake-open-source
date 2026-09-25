import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreateWorkInput, GenerateWorkInput, RefineWorkInput, WorksService } from './works.service';

@Controller('works')
export class WorksController {
  constructor(
    private readonly worksService: WorksService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  async list(@Query('includePending') includePending: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.optionalUserIdFromRequest(request);
    return this.worksService.list(userId, includePending === 'true');
  }

  @Get(':id/image')
  async image(
    @Param('id') id: string,
    @Query('access') accessToken: string | undefined,
    @Req() request: ActorRequest,
    @Res() response: any,
  ) {
    const userId = await this.actorService.optionalUserIdFromRequest(request);
    const result = await this.worksService.readImage(id, userId, accessToken);
    response.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', `${result.content.length}`);
    response.setHeader('Cache-Control', result.cacheControl);
    response.send(result.content);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: ActorRequest) {
    const userId = await this.actorService.optionalUserIdFromRequest(request);
    return this.worksService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreateWorkInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.worksService.create({ ...input, userId });
  }

  @Post('generate')
  async generateAndSave(@Body() input: GenerateWorkInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.worksService.generateAndSave({ ...input, userId });
  }

  @Post(':id/refine')
  async refine(@Param('id') id: string, @Body() input: RefineWorkInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.worksService.refineAndSave(id, { ...input, userId });
  }

  @Patch(':id/publish')
  async publish(@Param('id') id: string, @Body('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.worksService.publish(id, userId);
  }
}
