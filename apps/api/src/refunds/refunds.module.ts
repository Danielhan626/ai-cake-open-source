import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { StoreModule } from '../store/store.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [StoreModule, AuthModule, PaymentsModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
