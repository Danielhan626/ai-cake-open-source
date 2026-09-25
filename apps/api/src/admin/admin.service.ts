import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLog,
  Baker,
  Database,
  Payment,
  Quote,
  QuoteDecision,
  RefundRequest,
  RefundStatus,
  ReviewStatus,
  RewardStatus,
  SupportTicketStatus,
} from '../app.types';
import { StoreService } from '../store/store.service';
import { UploadsService } from '../uploads/uploads.service';
import { createId, now, requiredNumber, requiredString } from '../utils';
import { presentWorkImage as presentClientWorkImage } from '../works/work-image.utils';

export interface AuditInput {
  status: ReviewStatus;
  note?: string;
  operator?: string;
}

export interface SupportStatusInput {
  status: SupportTicketStatus;
  note?: string;
  operator?: string;
}

export interface RewardStatusInput {
  status: RewardStatus;
  note?: string;
  operator?: string;
}

export interface CreateSupportTicketInput {
  orderId?: string;
  userId?: string;
  type?: string;
  contact?: string;
  description?: string;
  evidenceNote?: string;
}

export interface CreateRewardReviewInput {
  userId?: string;
  workId?: string;
  amount?: number;
  reason?: string;
}

export interface MerchantWorkbenchQuery {
  bakerId?: string;
}

export interface AdminMerchantQuoteInput {
  demandId: string;
  bakerId?: string;
  amount?: number;
  deliveryFee?: number;
  availableDate?: string;
  productionDays?: number;
  decision?: QuoteDecision;
  adjustmentNote?: string;
  message?: string;
  operator?: string;
}

export interface RefundMediationInput {
  status?: RefundStatus;
  platformNote?: string;
  supportStatus?: SupportTicketStatus;
  note?: string;
  operator?: string;
}

export interface BakerCredentialFile {
  kind: 'healthCertificate' | 'businessLicense' | 'foodPermit';
  label: string;
  sourceUrl: string;
  available: boolean;
  uploadId?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  directUrl?: string;
  uploadedAt?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly store: StoreService,
    private readonly uploadsService: UploadsService,
  ) {}

  async overview() {
    const db = await this.store.read();
    return {
      counts: {
        users: db.users.length,
        works: db.works.length,
        demands: db.demands.length,
        bakers: db.bakers.length,
        quotes: db.quotes.length,
        payments: db.payments.length,
        orders: db.orders.length,
        fulfillments: db.fulfillments.length,
        refundRequests: db.refundRequests.length,
        supportTickets: db.supportTickets.length,
        rewardReviews: db.rewardReviews.length,
      },
      pending: {
        works: db.works.filter((item) => this.isWorkAwaitingPublicReview(item)).length,
        demands: db.demands.filter((item) => this.isDemandAwaitingReview(item)).length,
        bakers: db.bakers.filter((item) => this.isBakerAwaitingReview(item)).length,
        pendingQuoteDemands: db.demands.filter((item) => item.reviewStatus === 'approved' && item.status === 'quoting').length,
        fulfillmentOrders: db.orders.filter((item) => !['completed', 'disputed'].includes(item.status)).length,
        refundNegotiations: db.refundRequests.filter((item) => item.status === 'pending_baker' || item.status === 'platform_mediating').length,
        supportTickets: db.supportTickets.filter((item) => this.isSupportTicketAwaitingReview(item)).length,
        rewards: db.rewardReviews.filter((item) => this.isRewardAwaitingReview(item)).length,
      },
      latestAuditLogs: db.auditLogs.slice(-10).reverse(),
    };
  }

  async reviewQueue() {
    const db = await this.store.read();
    return {
      works: db.works
        .filter((item) => this.isWorkAwaitingPublicReview(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((work) => this.presentWorkImage(work)),
      demands: db.demands
        .filter((item) => this.isDemandAwaitingReview(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((demand) => ({
          ...demand,
          work: this.presentWorkImage(db.works.find((work) => work.id === demand.workId) || null),
        })),
      bakers: await Promise.all(
        db.bakers
          .filter((item) => this.isBakerAwaitingReview(item))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((baker) => this.presentBaker(baker)),
      ),
      supportTickets: db.supportTickets
        .filter((item) => this.isSupportTicketAwaitingReview(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      rewardReviews: db.rewardReviews
        .filter((item) => this.isRewardAwaitingReview(item))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  async merchantWorkbench(query: MerchantWorkbenchQuery) {
    const db = await this.store.read();
    const bakerId = requiredString(query.bakerId);
    return {
      bakerId: bakerId || null,
      pendingQuoteDemands: db.demands
        .filter((demand) => demand.reviewStatus === 'approved' && demand.status === 'quoting')
        .filter((demand) => !bakerId || !db.quotes.some((quote) => quote.demandId === demand.id && quote.bakerId === bakerId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((demand) => ({
          ...demand,
          work: this.presentWorkImage(db.works.find((work) => work.id === demand.workId) || null),
          quotes: db.quotes
            .filter((quote) => quote.demandId === demand.id)
            .map((quote) => this.presentQuote(quote, db)),
          quoteCount: db.quotes.filter((quote) => quote.demandId === demand.id).length,
        })),
      fulfillmentOrders: db.orders
        .filter((order) => !bakerId || order.bakerId === bakerId)
        .filter((order) => order.status !== 'completed' && order.status !== 'disputed')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((order) => this.presentOrder(order, db)),
      refundNegotiations: db.refundRequests
        .filter((refund) => !bakerId || refund.bakerId === bakerId)
        .filter((refund) => refund.status === 'pending_baker' || refund.status === 'platform_mediating')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((refund) => this.presentRefund(refund, db)),
    };
  }

  async auditWork(id: string, input: AuditInput) {
    const reviewed = await this.store.mutate((db) => {
      const work = db.works.find((item) => item.id === id);
      if (!work) throw new NotFoundException('Work not found');
      if (!this.isWorkAwaitingPublicReview(work)) {
        throw new BadRequestException('Work is not awaiting public review');
      }
      work.reviewStatus = input.status;
      work.visibility = input.status === 'approved' ? 'public' : 'private';
      db.auditLogs.push(this.auditLog('work', id, `review:${input.status}`, input.operator, input.note));
      return work;
    });
    return this.presentWorkImage(reviewed);
  }

  private isWorkAwaitingPublicReview(work: { visibility: string; reviewStatus: string }) {
    return work.visibility === 'public' && work.reviewStatus === 'pending';
  }

  private isDemandAwaitingReview(demand: { reviewStatus: string }) {
    return demand.reviewStatus === 'pending';
  }

  private isBakerAwaitingReview(baker: { reviewStatus: string }) {
    return baker.reviewStatus === 'pending';
  }

  private isSupportTicketAwaitingReview(ticket: { status: SupportTicketStatus }) {
    return ticket.status === 'pending';
  }

  private isRewardAwaitingReview(reward: { status: RewardStatus }) {
    return reward.status === 'pending';
  }

  private presentWorkImage<T extends { id: string; imageUrl: string; visibility?: string; reviewStatus?: string } | null>(work: T): T {
    return presentClientWorkImage(work);
  }

  async auditDemand(id: string, input: AuditInput) {
    return this.store.mutate((db) => {
      const demand = db.demands.find((item) => item.id === id);
      if (!demand) throw new NotFoundException('Demand not found');
      demand.reviewStatus = input.status;
      demand.status = input.status === 'approved' ? 'quoting' : input.status === 'rejected' ? 'closed' : 'reviewing';
      db.auditLogs.push(this.auditLog('demand', id, `review:${input.status}`, input.operator, input.note));
      return demand;
    });
  }

  async auditBaker(id: string, input: AuditInput) {
    return this.store.mutate((db) => {
      const baker = db.bakers.find((item) => item.id === id);
      if (!baker) throw new NotFoundException('Baker not found');
      baker.reviewStatus = input.status;
      baker.auditNote = input.note;
      db.auditLogs.push(this.auditLog('baker', id, `review:${input.status}`, input.operator, input.note));
      return baker;
    });
  }

  async createSupportTicket(input: CreateSupportTicketInput) {
    const timestamp = now();
    const ticket = {
      id: createId('ticket'),
      orderId: requiredString(input.orderId, 'unlinked-order'),
      userId: requiredString(input.userId, 'demo-user'),
      type: requiredString(input.type, '订单沟通'),
      contact: requiredString(input.contact, 'wechat_demo_user'),
      description: requiredString(input.description, '用户提交售后问题'),
      evidenceNote: requiredString(input.evidenceNote, '暂无凭证说明'),
      status: 'pending' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.store.mutate((db) => {
      db.supportTickets.push(ticket);
      db.auditLogs.push(this.auditLog('support', ticket.id, 'create', 'system', ticket.type));
      return ticket;
    });
  }

  async updateSupportTicket(id: string, input: SupportStatusInput) {
    return this.store.mutate((db) => {
      const ticket = db.supportTickets.find((item) => item.id === id);
      if (!ticket) throw new NotFoundException('Support ticket not found');
      ticket.status = input.status;
      ticket.handlerNote = input.note;
      ticket.updatedAt = now();
      db.auditLogs.push(this.auditLog('support', id, `status:${input.status}`, input.operator, input.note));
      return ticket;
    });
  }

  async createRewardReview(input: CreateRewardReviewInput) {
    const timestamp = now();
    const reward = {
      id: createId('reward'),
      userId: requiredString(input.userId, 'demo-user'),
      workId: requiredString(input.workId),
      amount: Math.min(Math.max(requiredNumber(input.amount, 20), 20), 100),
      reason: requiredString(input.reason, 'AI 设计任务灵感券'),
      status: 'pending' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.store.mutate((db) => {
      db.rewardReviews.push(reward);
      const wallet = db.wallets.find((item) => item.userId === reward.userId);
      if (wallet) {
        wallet.rewardPending += reward.amount;
        wallet.updatedAt = timestamp;
      } else {
        db.wallets.push({
          userId: reward.userId,
          roseBalance: 0,
          score: 0,
          rewardPending: reward.amount,
          rewardApproved: 0,
          creationCreditBalance: 0,
          updatedAt: timestamp,
        });
      }
      db.auditLogs.push(this.auditLog('reward', reward.id, 'create', 'system', reward.reason));
      return reward;
    });
  }

  async updateRewardReview(id: string, input: RewardStatusInput) {
    return this.store.mutate((db) => {
      const reward = db.rewardReviews.find((item) => item.id === id);
      if (!reward) throw new NotFoundException('Reward review not found');
      const oldStatus = reward.status;
      reward.status = input.status;
      reward.auditNote = input.note;
      reward.updatedAt = now();
      const wallet = db.wallets.find((item) => item.userId === reward.userId);
      if (wallet) {
        this.adjustRewardWallet(wallet, reward.amount, oldStatus, reward.status, reward.updatedAt);
      }
      db.auditLogs.push(this.auditLog('reward', id, `status:${input.status}`, input.operator, input.note));
      return reward;
    });
  }

  async createMerchantQuote(input: AdminMerchantQuoteInput) {
    const timestamp = now();
    return this.store.mutate((db) => {
      const demand = db.demands.find((item) => item.id === requiredString(input.demandId));
      if (!demand) throw new NotFoundException('Demand not found');
      if (demand.reviewStatus !== 'approved' || demand.status !== 'quoting') {
        throw new NotFoundException('Demand is not open for merchant quote');
      }

      const baker = db.bakers.find((item) => item.id === requiredString(input.bakerId, 'demo-baker'));
      if (!baker) throw new NotFoundException('Baker not found');
      if (baker.reviewStatus !== 'approved') {
        throw new NotFoundException('Baker is not approved for quoting');
      }
      if (baker.city !== demand.city) {
        throw new NotFoundException('Baker service city must match demand city');
      }

      const decision = this.normalizeQuoteDecision(input.decision);
      const existing = db.quotes.find((item) => item.demandId === demand.id && item.bakerId === baker.id);
      const quote: Quote = existing || {
        id: createId('quote'),
        demandId: demand.id,
        bakerId: baker.id,
        amount: 0,
        deliveryFee: 0,
        availableDate: '',
        productionDays: 0,
        decision,
        adjustmentNote: '',
        message: '',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      quote.decision = decision;
      quote.availableDate = requiredString(input.availableDate, this.defaultAvailableDate());
      quote.adjustmentNote = requiredString(input.adjustmentNote, '商家后台报价：根据真实材料和档期调整可制作细节。');
      quote.message = requiredString(input.message, '商家后台已确认可以沟通承接。');
      quote.status = 'active';
      quote.updatedAt = timestamp;

      if (decision === 'decline') {
        quote.amount = 0;
        quote.deliveryFee = 0;
        quote.productionDays = 0;
      } else {
        quote.amount = requiredNumber(input.amount, 328);
        quote.deliveryFee = requiredNumber(input.deliveryFee, 20);
        quote.productionDays = requiredNumber(input.productionDays, 2);
      }

      if (!existing) {
        db.quotes.push(quote);
      }
      db.auditLogs.push(this.auditLog('demand', demand.id, `merchant-quote:${decision}`, input.operator, `quote=${quote.id}`));
      return this.presentQuote(quote, db);
    });
  }

  async updateRefundMediation(id: string, input: RefundMediationInput) {
    const timestamp = now();
    return this.store.mutate((db) => {
      const refund = db.refundRequests.find((item) => item.id === id);
      if (!refund) throw new NotFoundException('Refund request not found');

      const nextStatus = this.normalizeRefundStatus(input.status, refund.status);
      refund.status = nextStatus;
      refund.platformNote = requiredString(input.platformNote, input.note || refund.platformNote || '平台客服已记录协商进展。');
      refund.updatedAt = timestamp;

      const supportTicket = db.supportTickets.find((item) => item.id === refund.supportTicketId);
      if (supportTicket) {
        supportTicket.status = this.normalizeSupportStatus(input.supportStatus, nextStatus);
        supportTicket.handlerNote = refund.platformNote;
        supportTicket.updatedAt = timestamp;
      }

      const order = db.orders.find((item) => item.id === refund.orderId);
      if (order && nextStatus === 'platform_mediating') {
        order.status = 'disputed';
        order.updatedAt = timestamp;
      }

      db.auditLogs.push(this.auditLog('support', refund.supportTicketId, `refund:mediation-${nextStatus}`, input.operator, refund.platformNote));
      return this.presentRefund(refund, db);
    });
  }

  private adjustRewardWallet(
    wallet: { rewardPending: number; rewardApproved: number; updatedAt: string },
    amount: number,
    oldStatus: RewardStatus,
    nextStatus: RewardStatus,
    timestamp: string,
  ) {
    if (oldStatus === nextStatus) return;

    if (oldStatus === 'pending') {
      wallet.rewardPending = Math.max(0, wallet.rewardPending - amount);
    }
    if (oldStatus === 'approved') {
      wallet.rewardApproved = Math.max(0, wallet.rewardApproved - amount);
    }

    if (nextStatus === 'pending') {
      wallet.rewardPending += amount;
    }
    if (nextStatus === 'approved') {
      wallet.rewardApproved += amount;
    }

    wallet.updatedAt = timestamp;
  }

  private presentQuote(quote: Quote, db: Database) {
    return {
      ...quote,
      demand: db.demands.find((demand) => demand.id === quote.demandId) || null,
      baker: db.bakers.find((baker) => baker.id === quote.bakerId) || null,
    };
  }

  private presentOrder(order: Database['orders'][number], db: Database) {
    const demand = db.demands.find((item) => item.id === order.demandId) || null;
    const quote = db.quotes.find((item) => item.id === order.quoteId) || null;
    return {
      ...order,
      totalText: `¥${order.amount}`,
      statusText: this.orderStatusText(order.status),
      work: this.presentWorkImage(db.works.find((item) => item.id === order.workId) || null),
      demand,
      quote,
      baker: db.bakers.find((item) => item.id === order.bakerId) || null,
      fulfillment: db.fulfillments.find((item) => item.orderId === order.id) || null,
    };
  }

  private presentRefund(refund: RefundRequest, db: Database) {
    const order = db.orders.find((item) => item.id === refund.orderId) || null;
    const refundPayment = refund.refundPaymentId ? db.payments.find((item) => item.id === refund.refundPaymentId) || null : null;
    return {
      ...refund,
      statusText: this.refundStatusText(refund.status),
      order: order ? this.presentOrder(order, db) : null,
      baker: db.bakers.find((item) => item.id === refund.bakerId) || null,
      refundPayment: this.presentRefundPayment(refundPayment),
      supportTicket: db.supportTickets.find((item) => item.id === refund.supportTicketId) || null,
    };
  }

  private async presentBaker(baker: Baker) {
    return {
      ...baker,
      credentialFiles: await this.presentCredentialFiles(baker),
    };
  }

  private async presentCredentialFiles(baker: Baker): Promise<BakerCredentialFile[]> {
    return Promise.all([
      this.presentCredentialFile('healthCertificate', '健康证', baker.healthCertificateUrl),
      this.presentCredentialFile('businessLicense', '营业执照', baker.businessLicenseUrl),
      this.presentCredentialFile('foodPermit', '食品资质', baker.foodPermitUrl || ''),
    ]);
  }

  private async presentCredentialFile(
    kind: BakerCredentialFile['kind'],
    label: string,
    sourceUrl: string,
  ): Promise<BakerCredentialFile> {
    const value = requiredString(sourceUrl);
    if (!value) {
      return {
        kind,
        label,
        sourceUrl: '',
        available: false,
      };
    }

    const upload = await this.uploadsService.findByUrl(value);
    if (upload) {
      return {
        kind,
        label,
        sourceUrl: value,
        available: true,
        uploadId: upload.id,
        originalName: upload.originalName,
        mimeType: upload.mimeType,
        size: upload.size,
        uploadedAt: upload.createdAt,
      };
    }

    const directUrl = /^https?:\/\//.test(value) ? value : '';
    return {
      kind,
      label,
      sourceUrl: value,
      available: Boolean(directUrl),
      directUrl,
      originalName: value.split('/').pop() || `${label}.jpg`,
    };
  }

  private presentRefundPayment(payment: Payment | null) {
    return payment || null;
  }

  private defaultAvailableDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  }

  private normalizeQuoteDecision(value?: string): QuoteDecision {
    if (value === 'as_designed' || value === 'with_adjustments' || value === 'decline') {
      return value;
    }
    return 'with_adjustments';
  }

  private normalizeRefundStatus(value: unknown, fallback: RefundStatus): RefundStatus {
    if (value === 'pending_baker' || value === 'refunded' || value === 'platform_mediating' || value === 'rejected' || value === 'cancelled') {
      return value;
    }
    return fallback === 'pending_baker' ? 'platform_mediating' : fallback;
  }

  private normalizeSupportStatus(value: unknown, refundStatus: RefundStatus): SupportTicketStatus {
    if (value === 'pending' || value === 'processing' || value === 'resolved' || value === 'rejected') {
      return value;
    }
    if (refundStatus === 'refunded' || refundStatus === 'cancelled') return 'resolved';
    if (refundStatus === 'rejected') return 'rejected';
    return 'processing';
  }

  private orderStatusText(status: Database['orders'][number]['status']) {
    const textMap: Record<Database['orders'][number]['status'], string> = {
      intent_confirmed: '已确认报价意向',
      merchant_confirmed: '蛋糕师已确认',
      producing: '制作中',
      delivering: '配送/自提中',
      completed: '已完成',
      disputed: '售后处理中',
    };
    return textMap[status];
  }

  private refundStatusText(status: RefundStatus) {
    const textMap: Record<RefundStatus, string> = {
      pending_baker: '等待商家处理',
      refund_processing: '退款处理中',
      refunded: '已退款',
      platform_mediating: '客服介入协商',
      rejected: '退款关闭',
      cancelled: '已取消',
    };
    return textMap[status];
  }

  private auditLog(targetType: AuditLog['targetType'], targetId: string, action: string, operator = 'admin', note?: string): AuditLog {
    return {
      id: createId('audit'),
      targetType,
      targetId,
      action,
      operator: requiredString(operator, 'admin'),
      note: requiredString(note),
      createdAt: now(),
    };
  }
}
