import { Body, Controller, Post, Req } from '@nestjs/common';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { UploadInput, UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly actorService: ActorService,
  ) {}

  @Post()
  async create(@Body() input: UploadInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.uploadsService.create({ ...input, userId });
  }
}
