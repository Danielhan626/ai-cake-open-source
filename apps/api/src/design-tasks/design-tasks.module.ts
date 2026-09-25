import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { StoreModule } from '../store/store.module';
import { BotLlmService } from './bot-llm.service';
import { BotReviewsController } from './bot-reviews.controller';
import { DesignTasksController } from './design-tasks.controller';
import { DesignTasksService } from './design-tasks.service';

@Module({
  imports: [StoreModule, AuthModule, AdminModule],
  controllers: [DesignTasksController, BotReviewsController],
  providers: [DesignTasksService, BotLlmService],
})
export class DesignTasksModule {}
