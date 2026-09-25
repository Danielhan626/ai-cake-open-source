import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [StoreModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
