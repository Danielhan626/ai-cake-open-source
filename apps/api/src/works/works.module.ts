import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { CreationCreditsModule } from '../creation-credits/creation-credits.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';

@Module({
  imports: [AiModule, AuthModule, CreationCreditsModule, UploadsModule],
  controllers: [WorksController],
  providers: [WorksService],
  exports: [WorksService],
})
export class WorksModule {}
