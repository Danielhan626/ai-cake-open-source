import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreationCreditsModule } from '../creation-credits/creation-credits.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, CreationCreditsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
