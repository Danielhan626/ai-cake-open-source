import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BakersController } from './bakers.controller';
import { BakersService } from './bakers.service';

@Module({
  imports: [AuthModule],
  controllers: [BakersController],
  providers: [BakersService],
  exports: [BakersService],
})
export class BakersModule {}
