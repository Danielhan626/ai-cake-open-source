import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BakersModule } from './bakers/bakers.module';
import { DemandsModule } from './demands/demands.module';
import { CreationCreditsModule } from './creation-credits/creation-credits.module';
import { DesignTasksModule } from './design-tasks/design-tasks.module';
import { PaymentsModule } from './payments/payments.module';
import { PublicModule } from './public/public.module';
import { QuotesModule } from './quotes/quotes.module';
import { OrdersModule } from './orders/orders.module';
import { ProfileModule } from './profile/profile.module';
import { RefundsModule } from './refunds/refunds.module';
import { StoreModule } from './store/store.module';
import { UploadsModule } from './uploads/uploads.module';
import { WorksModule } from './works/works.module';
import { HealthController } from './health.controller';
import { InteractionsModule } from './interactions/interactions.module';

@Module({
  imports: [
    StoreModule,
    AuthModule,
    AiModule,
    CreationCreditsModule,
    WorksModule,
    DemandsModule,
    DesignTasksModule,
    BakersModule,
    QuotesModule,
    OrdersModule,
    ProfileModule,
    RefundsModule,
    PaymentsModule,
    PublicModule,
    InteractionsModule,
    UploadsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
