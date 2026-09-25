import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Payment, RefundDecision, RefundRequest, SupportTicket } from '../app.types';
import { PaymentsService } from '../payments/payments.service';
import { StoreService } from '../store/store.service';
import { createId, now, requiredNumber, requiredString } from '../utils';
import { presentWorkImage } from '../works/work-image.utils';

export interface CreateRefundRequestInput {
  userId?: string;
  orderId: string;
  reason?: string;
  description?: string;
  evidenceImages?: string[];
  evidenceNote?: string;
  requestedAmount?: number;
  contact?: string;
}

export interface BakerRefundResponseInput {
  userId?: string;
  bakerId?: string;
  decision: RefundDecision;
  note?: string;
  approvedAmount?: number;
}

type Database = Awaited<ReturnType<StoreService['read']>>;

@Injectable()
export class RefundsService {
  constructor(
    private readonly store: StoreService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async list(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId);
    return db.refundRequests
      .filter((item) => item.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((refund) => this.present(refund, db));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const refund = db.refundRequests.find((item) => item.id === id);
    if (!refund || refund.userId !== requiredString(userId)) {
      throw new NotFoundException('Refund request not found');
    }
    return this.present(refund, db);
  }

  async createRefundRequest(input: CreateRefundRequestInput) {
    const actorUserId = requiredString(input.userId, 'demo-user');
    const orderId = requiredString(input.orderId);
    const timestamp = now();

    return this.store.mutate((db) => {
      const order = db.orders.find((item) => item.id === orderId);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.userId !== actorUserId) {
        throw new ForbiddenException('Only the order owner can request a refund');
      }
      if (!['completed', 'disputed'].includes(order.status)) {
        throw new BadRequestException('Refund can only be requested after the order enters after-sale period');
      }

      const existing = db.refundRequests.find((item) => item.orderId === order.id && item.status === 'pending_baker');
      if (existing) {
        return this.present(existing, db);
      }

      const evidenceImages = Array.isArray(input.evidenceImages)
        ? input.evidenceImages.map((item) => requiredString(item)).filter(Boolean).slice(0, 6)
        : [];
      const evidenceNote = requiredString(input.evidenceNote, '');
      if (!evidenceImages.length && !evidenceNote) {
        throw new BadRequestException('Refund evidence image or evidence note is required');
      }

      const payment = this.findPaymentForOrder(db, order.quoteId);
      const amount = Math.min(Math.max(requiredNumber(input.requestedAmount, order.amount), 1), order.amount);
      const supportTicket: SupportTicket = {
        id: createId('ticket'),
        orderId: order.id,
        userId: actorUserId,
        type: '退款申请',
        contact: requiredString(input.contact, order.contact),
        description: requiredString(input.description, '消费者提交退款申请'),
        evidenceNote: evidenceNote || evidenceImages.join('；'),
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const refund: RefundRequest = {
        id: createId('refund'),
        orderId: order.id,
        userId: actorUserId,
        bakerId: order.bakerId,
        paymentId: payment ? payment.id : undefined,
        supportTicketId: supportTicket.id,
        reason: requiredString(input.reason, '用户不满意'),
        description: supportTicket.description,
        evidenceImages,
        evidenceNote: supportTicket.evidenceNote,
        requestedAmount: amount,
        contact: supportTicket.contact,
        status: 'pending_baker',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      order.status = 'disputed';
      order.updatedAt = timestamp;
      const fulfillment = db.fulfillments.find((item) => item.orderId === order.id);
      if (fulfillment) {
        fulfillment.status = 'disputed';
        fulfillment.note = '消费者已提交退款申请，等待商家响应。';
        fulfillment.updatedAt = timestamp;
      }

      db.supportTickets.push(supportTicket);
      db.refundRequests.push(refund);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'support',
        targetId: supportTicket.id,
        action: 'refund:create',
        operator: actorUserId,
        note: refund.reason,
        createdAt: timestamp,
      });
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'order',
        targetId: order.id,
        action: 'refund:pending-baker',
        operator: actorUserId,
        note: refund.description,
        createdAt: timestamp,
      });

      return this.present(refund, db);
    });
  }

  async respondAsBaker(id: string, input: BakerRefundResponseInput) {
    const actorUserId = requiredString(input.userId);
    const bakerId = requiredString(input.bakerId, 'demo-baker');
    const decision = requiredString(input.decision) as RefundDecision;
    const timestamp = now();
    let approvedAmount = 0;
    let refundPayment: Payment | null = null;

    if (decision === 'agree') {
      const snapshot = await this.store.read();
      const refund = snapshot.refundRequests.find((item) => item.id === id);
      if (!refund) {
        throw new NotFoundException('Refund request not found');
      }
      const baker = snapshot.bakers.find((item) => item.id === bakerId);
      if (!baker || baker.userId !== actorUserId || refund.bakerId !== baker.id) {
        throw new ForbiddenException('Only the order baker can respond to this refund request');
      }
      if (refund.status !== 'pending_baker') {
        throw new BadRequestException('Refund request is not waiting for baker response');
      }

      approvedAmount = Math.min(Math.max(requiredNumber(input.approvedAmount, refund.requestedAmount), 1), refund.requestedAmount);
      refundPayment = await this.paymentsService.createRefund({
        paymentId: refund.paymentId,
        refundRequestId: refund.id,
        orderId: refund.orderId,
        userId: refund.userId,
        amount: approvedAmount,
        reason: refund.reason,
      });
    }

    return this.store.mutate((db) => {
      const refund = db.refundRequests.find((item) => item.id === id);
      if (!refund) {
        throw new NotFoundException('Refund request not found');
      }
      const baker = db.bakers.find((item) => item.id === bakerId);
      if (!baker || baker.userId !== actorUserId || refund.bakerId !== baker.id) {
        throw new ForbiddenException('Only the order baker can respond to this refund request');
      }
      if (refund.status !== 'pending_baker') {
        throw new BadRequestException('Refund request is not waiting for baker response');
      }
      if (decision !== 'agree' && decision !== 'reject') {
        throw new BadRequestException('Refund decision must be agree or reject');
      }

      refund.bakerDecision = decision;
      refund.bakerNote = requiredString(input.note, '');
      refund.updatedAt = timestamp;

      const supportTicket = db.supportTickets.find((item) => item.id === refund.supportTicketId);
      if (decision === 'agree') {
        const amount = approvedAmount || Math.min(Math.max(requiredNumber(input.approvedAmount, refund.requestedAmount), 1), refund.requestedAmount);
        const storedRefundPayment =
          (refundPayment && db.payments.find((item) => item.id === refundPayment.id)) || refundPayment;
        if (!storedRefundPayment) {
          throw new NotFoundException('Refund payment not found');
        }
        refund.approvedAmount = amount;
        refund.refundPaymentId = storedRefundPayment.id;
        refund.status = storedRefundPayment.status === 'refunded' ? 'refunded' : 'refund_processing';
        if (supportTicket) {
          supportTicket.status = refund.status === 'refunded' ? 'resolved' : 'processing';
          supportTicket.handlerNote =
            refund.status === 'refunded'
              ? '商家同意退款，系统已记录退款回原支付渠道。'
              : '商家已同意退款，支付渠道处理中，平台会继续跟进结果。';
          supportTicket.updatedAt = timestamp;
        }
      } else {
        refund.status = 'platform_mediating';
        refund.platformNote = '商家不同意退款，平台客服介入两方协商。';
        if (supportTicket) {
          supportTicket.status = 'processing';
          supportTicket.handlerNote = refund.platformNote;
          supportTicket.updatedAt = timestamp;
        }
      }

      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'support',
        targetId: refund.supportTicketId,
        action: `refund:baker-${decision}`,
        operator: actorUserId,
        note: refund.bakerNote,
        createdAt: timestamp,
      });

      return this.present(refund, db);
    });
  }

  private findPaymentForOrder(db: Database, quoteId: string) {
    return db.payments.find((item) => item.quoteId === quoteId && item.status === 'paid') || null;
  }

  private present(refund: RefundRequest, db: Database) {
    const order = db.orders.find((item) => item.id === refund.orderId) || null;
    const refundPayment = refund.refundPaymentId ? db.payments.find((item) => item.id === refund.refundPaymentId) || null : null;
    const supportTicket = db.supportTickets.find((item) => item.id === refund.supportTicketId) || null;
    return {
      ...refund,
      statusText: this.statusText(refund.status),
      order: order
        ? {
            ...order,
            statusText: order.status === 'disputed' ? '售后处理中' : order.status,
            work: presentWorkImage(db.works.find((item) => item.id === order.workId) || null),
          }
        : null,
      baker: db.bakers.find((item) => item.id === refund.bakerId) || null,
      refundPayment,
      supportTicket,
    };
  }

  private statusText(status: RefundRequest['status']) {
    const textMap: Record<RefundRequest['status'], string> = {
      pending_baker: '等待商家处理',
      refund_processing: '退款处理中',
      refunded: '已退款',
      platform_mediating: '客服介入协商',
      rejected: '退款关闭',
      cancelled: '已取消',
    };
    return textMap[status];
  }
}
