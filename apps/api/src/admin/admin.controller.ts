import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { UploadsService } from '../uploads/uploads.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminLoginInput, AdminRequest, AdminSessionService } from './admin-session.service';
import {
  AdminMerchantQuoteInput,
  AdminService,
  AuditInput,
  CreateRewardReviewInput,
  CreateSupportTicketInput,
  MerchantWorkbenchQuery,
  RefundMediationInput,
  RewardStatusInput,
  SupportStatusInput,
} from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminSessionService: AdminSessionService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Post('login')
  login(@Body() input: AdminLoginInput) {
    return this.adminSessionService.login(input);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@Req() request: AdminRequest) {
    return this.adminSessionService.present(request.admin!);
  }

  @Get('overview')
  @UseGuards(AdminAuthGuard)
  overview() {
    return this.adminService.overview();
  }

  @Get('review-queue')
  @UseGuards(AdminAuthGuard)
  reviewQueue() {
    return this.adminService.reviewQueue();
  }

  @Get('merchant-workbench')
  @UseGuards(AdminAuthGuard)
  merchantWorkbench(@Query() query: MerchantWorkbenchQuery) {
    return this.adminService.merchantWorkbench(query);
  }

  @Get('uploads/:id/content')
  @UseGuards(AdminAuthGuard)
  async uploadContent(@Param('id') id: string, @Res() response: any) {
    const { record, content } = await this.uploadsService.readContent(id);
    response.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', `${record.size}`);
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(record.originalName || record.fileName)}`);
    response.send(content);
  }

  @Patch('works/:id/review')
  @UseGuards(AdminAuthGuard)
  auditWork(@Param('id') id: string, @Body() input: AuditInput) {
    return this.adminService.auditWork(id, input);
  }

  @Patch('demands/:id/review')
  @UseGuards(AdminAuthGuard)
  auditDemand(@Param('id') id: string, @Body() input: AuditInput) {
    return this.adminService.auditDemand(id, input);
  }

  @Patch('bakers/:id/review')
  @UseGuards(AdminAuthGuard)
  auditBaker(@Param('id') id: string, @Body() input: AuditInput) {
    return this.adminService.auditBaker(id, input);
  }

  @Post('support-tickets')
  @UseGuards(AdminAuthGuard)
  createSupportTicket(@Body() input: CreateSupportTicketInput) {
    return this.adminService.createSupportTicket(input);
  }

  @Patch('support-tickets/:id/status')
  @UseGuards(AdminAuthGuard)
  updateSupportTicket(@Param('id') id: string, @Body() input: SupportStatusInput) {
    return this.adminService.updateSupportTicket(id, input);
  }

  @Post('merchant-quotes')
  @UseGuards(AdminAuthGuard)
  createMerchantQuote(@Body() input: AdminMerchantQuoteInput) {
    return this.adminService.createMerchantQuote(input);
  }

  @Patch('refunds/:id/mediation')
  @UseGuards(AdminAuthGuard)
  updateRefundMediation(@Param('id') id: string, @Body() input: RefundMediationInput) {
    return this.adminService.updateRefundMediation(id, input);
  }

  @Post('reward-reviews')
  @UseGuards(AdminAuthGuard)
  createRewardReview(@Body() input: CreateRewardReviewInput) {
    return this.adminService.createRewardReview(input);
  }

  @Patch('reward-reviews/:id/status')
  @UseGuards(AdminAuthGuard)
  updateRewardReview(@Param('id') id: string, @Body() input: RewardStatusInput) {
    return this.adminService.updateRewardReview(id, input);
  }
}
