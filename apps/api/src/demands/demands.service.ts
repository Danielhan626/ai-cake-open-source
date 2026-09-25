import { Injectable, NotFoundException } from '@nestjs/common';
import { Demand, ProductionCommunicationLevel } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredBoolean, requiredString } from '../utils';
import { presentWorkImage } from '../works/work-image.utils';

export interface CreateDemandInput {
  userId?: string;
  workId: string;
  title?: string;
  description?: string;
  city?: string;
  district?: string;
  expectedDate?: string;
  budget?: string;
  servings?: string;
  deliveryMethod?: string;
  allowAdjustments?: boolean;
  deliveryWindow?: string;
  cakeSize?: string;
  flavor?: string;
  recipientNote?: string;
  productionNoticeAccepted?: boolean;
  productionLevel?: ProductionCommunicationLevel;
  mustKeep?: string;
  canAdjust?: string;
  contact?: string;
}

@Injectable()
export class DemandsService {
  constructor(private readonly store: StoreService) {}

  async list(city?: string) {
    const db = await this.store.read();
    return db.demands
      .filter((item) => (!city || item.city === city) && item.reviewStatus === 'approved' && item.status !== 'closed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((demand) => ({
        ...demand,
        work: presentWorkImage(db.works.find((work) => work.id === demand.workId) || null),
        quoteCount: db.quotes.filter((quote) => quote.demandId === demand.id).length,
      }));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const demand = db.demands.find((item) => item.id === id);
    if (!demand) {
      throw new NotFoundException('Demand not found');
    }
    const currentUserId = requiredString(userId);
    const isOwner = demand.userId === currentUserId;
    if (demand.reviewStatus !== 'approved' && !isOwner) {
      throw new NotFoundException('Demand not found');
    }

    return {
      ...this.presentDemand(demand, isOwner),
      work: presentWorkImage(db.works.find((work) => work.id === demand.workId) || null),
      quotes: db.quotes
        .filter((quote) => quote.demandId === id)
        .map((quote) => ({
          ...quote,
          baker: db.bakers.find((baker) => baker.id === quote.bakerId) || null,
        })),
    };
  }

  private presentDemand(demand: Demand, isOwner: boolean) {
    if (isOwner) {
      return demand;
    }

    return {
      ...demand,
      contact: '',
    };
  }

  async create(input: CreateDemandInput) {
    const demand: Demand = {
      id: createId('demand'),
      userId: requiredString(input.userId, 'demo-user'),
      workId: requiredString(input.workId),
      title: requiredString(input.title, '想找蛋糕师制作这款 AI 蛋糕'),
      description: requiredString(input.description, '希望尽量还原图片效果，可以接受根据制作可行性调整。'),
      city: requiredString(input.city, '长治'),
      district: requiredString(input.district, '潞州区'),
      expectedDate: requiredString(input.expectedDate, this.defaultExpectedDate()),
      budget: requiredString(input.budget, '200-399元'),
      servings: requiredString(input.servings, '4-6人'),
      deliveryMethod: requiredString(input.deliveryMethod, '配送或自提均可'),
      allowAdjustments: requiredBoolean(input.allowAdjustments, true),
      deliveryWindow: requiredString(input.deliveryWindow, '时间待确认'),
      cakeSize: requiredString(input.cakeSize, input.servings || '尺寸待确认'),
      flavor: requiredString(input.flavor, '口味待沟通'),
      recipientNote: requiredString(input.recipientNote, ''),
      productionNoticeAccepted: requiredBoolean(input.productionNoticeAccepted, false),
      productionLevel: this.normalizeProductionLevel(input.productionLevel),
      mustKeep: requiredString(input.mustKeep, '保留主体创意、主色和关键装饰。'),
      canAdjust: requiredString(input.canAdjust, '尺寸、材料、支撑结构和局部装饰可由蛋糕师沟通调整。平台不裁决能否制作，最终由蛋糕师报价和接单判断。'),
      contact: requiredString(input.contact, 'wechat_demo_user'),
      status: 'reviewing',
      reviewStatus: 'pending',
      createdAt: now(),
    };

    return this.store.mutate((db) => {
      const work = db.works.find((item) => item.id === demand.workId);
      if (!work) {
        throw new NotFoundException('Work not found');
      }
      db.demands.push(demand);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'demand',
        targetId: demand.id,
        action: 'create:pending-review',
        operator: demand.userId,
        note: 'Demand requires review before quoting.',
        createdAt: now(),
      });
      return demand;
    });
  }

  private defaultExpectedDate() {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }

  private normalizeProductionLevel(value?: string): ProductionCommunicationLevel {
    if (value === 'standard' || value === 'discuss' || value === 'challenge' || value === 'concept') {
      return value;
    }
    return 'discuss';
  }
}
