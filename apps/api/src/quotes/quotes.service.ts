import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Quote, QuoteDecision } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredNumber, requiredString } from '../utils';

export interface CreateQuoteInput {
  demandId: string;
  userId?: string;
  bakerId?: string;
  amount?: number;
  deliveryFee?: number;
  availableDate?: string;
  productionDays?: number;
  decision?: QuoteDecision;
  restorationLevel?: string;
  deliveryWindow?: string;
  scheduledDeliverySupported?: boolean;
  changeDeadline?: string;
  cancelPolicy?: string;
  signoffNote?: string;
  adjustmentNote?: string;
  message?: string;
}

@Injectable()
export class QuotesService {
  constructor(private readonly store: StoreService) {}

  async list(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId);
    return db.quotes
      .filter((quote) => {
        const demand = db.demands.find((item) => item.id === quote.demandId);
        const baker = db.bakers.find((item) => item.id === quote.bakerId);
        return demand?.userId === currentUserId || baker?.userId === currentUserId;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((quote) => ({
        ...quote,
        demand: db.demands.find((demand) => demand.id === quote.demandId) || null,
        baker: db.bakers.find((baker) => baker.id === quote.bakerId) || null,
      }));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const quote = db.quotes.find((item) => item.id === id);
    if (!quote) {
      throw new NotFoundException('Quote not found');
    }
    const currentUserId = requiredString(userId);
    const demand = db.demands.find((item) => item.id === quote.demandId) || null;
    const baker = db.bakers.find((item) => item.id === quote.bakerId) || null;
    if (demand?.userId !== currentUserId && baker?.userId !== currentUserId) {
      throw new NotFoundException('Quote not found');
    }
    return {
      ...quote,
      demand,
      baker,
    };
  }

  async create(input: CreateQuoteInput) {
    const timestamp = now();
    const quote: Quote = {
      id: createId('quote'),
      demandId: requiredString(input.demandId),
      bakerId: requiredString(input.bakerId, 'demo-baker'),
      amount: requiredNumber(input.amount, 328),
      deliveryFee: requiredNumber(input.deliveryFee, 20),
      availableDate: requiredString(input.availableDate, this.defaultAvailableDate()),
      productionDays: requiredNumber(input.productionDays, 2),
      decision: this.normalizeDecision(input.decision),
      restorationLevel: requiredString(input.restorationLevel, '保留主体创意，局部细节会按可食用材料调整'),
      deliveryWindow: requiredString(input.deliveryWindow, '与用户确认时间段后安排'),
      scheduledDeliverySupported: typeof input.scheduledDeliverySupported === 'boolean' ? input.scheduledDeliverySupported : true,
      changeDeadline: requiredString(input.changeDeadline, '开做前一天可再次确认细节'),
      cancelPolicy: requiredString(input.cancelPolicy, '开做前可沟通取消；备料或制作开始后会按实际损耗协商。'),
      signoffNote: requiredString(input.signoffNote, '签收时请先检查外观、祝福牌和配送完整度，如有问题当场拍照反馈。'),
      adjustmentNote: requiredString(input.adjustmentNote, '可尽量还原图片，花边和立体装饰会按可食用材料调整。'),
      message: requiredString(input.message, '这款我可以做，建议提前两天确认口味和祝福语。'),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.store.mutate((db) => {
      const demand = db.demands.find((item) => item.id === quote.demandId);
      const baker = db.bakers.find((item) => item.id === quote.bakerId);
      if (!demand) {
        throw new NotFoundException('Demand not found');
      }
      if (!baker) {
        throw new NotFoundException('Baker not found');
      }
      if (demand.reviewStatus !== 'approved' || demand.status !== 'quoting') {
        throw new BadRequestException('Demand must be approved before quote');
      }
      if (baker.reviewStatus !== 'approved') {
        throw new BadRequestException('Baker must be approved before quote');
      }
      if (baker.city !== demand.city) {
        throw new BadRequestException('蛋糕师服务城市必须与订单城市一致');
      }
      const actorUserId = requiredString(input.userId);
      if (!actorUserId || baker.userId !== actorUserId) {
        throw new ForbiddenException('Only the verified baker account can quote for this baker profile');
      }
      if (quote.decision === 'decline') {
        quote.amount = 0;
        quote.deliveryFee = 0;
        quote.productionDays = 0;
        quote.scheduledDeliverySupported = false;
        quote.message = requiredString(input.message, '暂不接单：当前工期、材料或结构条件不适合承接这款蛋糕。');
        quote.adjustmentNote = requiredString(input.adjustmentNote, '建议用户保留创意，等待其他蛋糕师报价，或接受师傅二次改稿后再发布。');
      }

      const existing = db.quotes.find((item) => item.demandId === quote.demandId && item.bakerId === quote.bakerId);
      if (existing) {
        existing.amount = quote.amount;
        existing.deliveryFee = quote.deliveryFee;
        existing.availableDate = quote.availableDate;
        existing.productionDays = quote.productionDays;
        existing.decision = quote.decision;
        existing.restorationLevel = quote.restorationLevel;
        existing.deliveryWindow = quote.deliveryWindow;
        existing.scheduledDeliverySupported = quote.scheduledDeliverySupported;
        existing.changeDeadline = quote.changeDeadline;
        existing.cancelPolicy = quote.cancelPolicy;
        existing.signoffNote = quote.signoffNote;
        existing.adjustmentNote = quote.adjustmentNote;
        existing.message = quote.message;
        existing.updatedAt = timestamp;
        return existing;
      }

      db.quotes.push(quote);
      return quote;
    });
  }

  async select(id: string, userId?: string) {
    return this.store.mutate((db) => {
      const quote = db.quotes.find((item) => item.id === id);
      if (!quote) {
        throw new NotFoundException('Quote not found');
      }
      const demand = db.demands.find((item) => item.id === quote.demandId);
      if (!demand) {
        throw new NotFoundException('Demand not found');
      }
      if (quote.decision === 'decline') {
        throw new BadRequestException('暂不接单的回复不能被选择为订单报价');
      }
      const actorUserId = requiredString(userId);
      if (!actorUserId || demand.userId !== actorUserId) {
        throw new ForbiddenException('Only the demand owner can select a quote');
      }
      quote.status = 'selected';
      quote.updatedAt = now();

      demand.status = 'selected';

      db.quotes
        .filter((item) => item.demandId === quote.demandId && item.id !== quote.id)
        .forEach((item) => {
          item.status = 'cancelled';
          item.updatedAt = quote.updatedAt;
        });

      return quote;
    });
  }

  private defaultAvailableDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  }

  private normalizeDecision(value?: string): QuoteDecision {
    if (value === 'as_designed' || value === 'with_adjustments' || value === 'decline') {
      return value;
    }
    return 'with_adjustments';
  }
}
