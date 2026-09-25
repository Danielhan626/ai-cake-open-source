import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { StoreModule } from '../store/store.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [StoreModule, AuthModule, AdminModule],
  controllers: [OrdersController],
  providers: [OrdersService, AdminAuthGuard],
})
export class OrdersModule {}
