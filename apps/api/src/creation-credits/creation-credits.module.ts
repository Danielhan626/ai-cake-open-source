import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreationCreditsController } from './creation-credits.controller';
import { CreationCreditsService } from './creation-credits.service';

@Module({
  imports: [AuthModule],
  controllers: [CreationCreditsController],
  providers: [CreationCreditsService],
  exports: [CreationCreditsService],
})
export class CreationCreditsModule {}
