import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminController } from './admin.controller';
import { AdminSessionService } from './admin-session.service';
import { AdminService } from './admin.service';

@Module({
  imports: [StoreModule, UploadsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminSessionService, AdminAuthGuard],
  exports: [AdminSessionService, AdminAuthGuard],
})
export class AdminModule {}
