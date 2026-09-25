import { Module } from '@nestjs/common';
import { ActorService } from './actor.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, ActorService],
  exports: [ActorService],
})
export class AuthModule {}
