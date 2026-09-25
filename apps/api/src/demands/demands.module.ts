import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemandsController } from './demands.controller';
import { DemandsService } from './demands.service';

@Module({
  imports: [AuthModule],
  controllers: [DemandsController],
  providers: [DemandsService],
  exports: [DemandsService],
})
export class DemandsModule {}
