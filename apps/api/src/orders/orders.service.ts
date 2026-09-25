import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Fulfillment, FulfillmentStatus, Order, OrderStatus } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';
import { presentWorkImage } from '../works/work-image.utils';

export interface CreateOrderInput {
  userId?: string;
  quoteId: string;
}

export interface UpdateFulfillmentInput {
  status: FulfillmentStatus;
  operator?: string;
  userId?: string;
  bakerId?: string;
  courierName?: string;
  courierPhone?: string;
  eta?: string;
  note?: string;
}

@Injectable()
export class OrdersService {
  constructor(private readonly store: StoreService) {}

  async list(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId);
    return db.orders
      .filter((order) => order.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => this.present(order, db));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const order = db.orders.find((item) => item.id === id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const currentUserId = requiredString(userId);
    if (!currentUserId || order.userId !== currentUserId) {
      throw new NotFoundException('Order not found');
    }
    return this.present(order, db);
  }

  async listForBaker(input: Pick<UpdateFulfillmentInput, 'userId' | 'bakerId'>) {
    const db = await this.store.read();
    const baker = this.bakerForActor(db, input);
    return db.orders
      .filter((order) => order.bakerId === baker.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => this.present(order, db));
  }

  async createFromQuote(input: CreateOrderInput) {
    const quoteId = requiredString(input.quoteId);
    const actorUserId = requiredString(input.userId, 'demo-user');
    const timestamp = now();

    return this.store.mutate((db) => {
      const quote = db.quotes.find((item) => item.id === quoteId);
      if (!quote) {
        throw new NotFoundException('Quote not found');
      }
      if (quote.status !== 'selected') {
        throw new BadRequestException('Quote must be selected before order creation');
      }

      const demand = db.demands.find((item) => item.id === quote.demandId);
      if (!demand) {
        throw new NotFoundException('Demand not found');
      }
      if (demand.userId !== actorUserId) {
        throw new ForbiddenException('Only the demand owner can create an order for this quote');
      }
      if (demand.status !== 'selected') {
        throw new BadRequestException('Demand must select this quote before order creation');
      }

      const work = db.works.find((item) => item.id === demand.workId);
      if (!work) {
        throw new NotFoundException('Work not found');
      }

      const baker = db.bakers.find((item) => item.id === quote.bakerId);
      if (!baker) {
        throw new NotFoundException('Baker not found');
      }

      const existingOrder = db.orders.find((item) => item.quoteId === quoteId && item.userId === actorUserId);
      if (existingOrder) {
        return this.present(existingOrder, db);
      }

      const order: Order = {
        id: createId('order'),
        userId: actorUserId,
        workId: work.id,
        demandId: demand.id,
        quoteId: quote.id,
        bakerId: baker.id,
        amount: quote.amount + quote.deliveryFee,
        status: 'intent_confirmed',
        city: demand.city,
        district: demand.district,
        deliveryMethod: demand.deliveryMethod,
        expectedDate: demand.expectedDate,
        contact: demand.contact,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const fulfillment: Fulfillment = {
        id: createId('fulfillment'),
        orderId: order.id,
        status: 'created',
        deliveryMethod: demand.deliveryMethod,
        eta: '等待蛋糕师确认制作排期',
        note: '用户已确认报价意向，平台等待蛋糕师确认制作。',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      db.orders.push(order);
      db.fulfillments.push(fulfillment);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'order',
        targetId: order.id,
        action: 'create:intent-confirmed',
        operator: actorUserId,
        note: `quote=${quote.id}; demand=${demand.id}`,
        createdAt: timestamp,
      });
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'fulfillment',
        targetId: fulfillment.id,
        action: 'create',
        operator: 'system',
        note: fulfillment.note,
        createdAt: timestamp,
      });

      return this.present(order, db);
    });
  }

  async updateFulfillment(id: string, input: UpdateFulfillmentInput) {
    return this.store.mutate((db) => {
      const order = db.orders.find((item) => item.id === id);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      return this.applyFulfillmentUpdate(db, order, input, requiredString(input.operator, 'admin'));
    });
  }

  async updateBakerFulfillment(id: string, input: UpdateFulfillmentInput) {
    return this.store.mutate((db) => {
      const order = db.orders.find((item) => item.id === id);
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      const baker = this.bakerForActor(db, input);
      if (order.bakerId !== baker.id) {
        throw new ForbiddenException('Only the verified baker account can manage this order');
      }
      const allowed: FulfillmentStatus[] = ['baker_confirmed', 'producing', 'ready', 'delivering_or_pickup', 'completed'];
      if (!allowed.includes(input.status)) {
        throw new BadRequestException('Baker fulfillment status is not allowed');
      }
      return this.applyFulfillmentUpdate(db, order, input, baker.userId || requiredString(input.userId));
    });
  }

  private orderStatusFromFulfillment(status: FulfillmentStatus): OrderStatus {
    if (status === 'baker_confirmed') return 'merchant_confirmed';
    if (status === 'producing' || status === 'ready') return 'producing';
    if (status === 'delivering_or_pickup') return 'delivering';
    if (status === 'completed') return 'completed';
    if (status === 'disputed') return 'disputed';
    return 'intent_confirmed';
  }

  private bakerForActor(
    db: Awaited<ReturnType<StoreService['read']>>,
    input: Pick<UpdateFulfillmentInput, 'userId' | 'bakerId'>,
  ) {
    const actorUserId = requiredString(input.userId);
    const bakerId = requiredString(input.bakerId, 'demo-baker');
    const baker = db.bakers.find((item) => item.id === bakerId);
    if (!baker || baker.userId !== actorUserId) {
      throw new ForbiddenException('Only the verified baker account can manage this order');
    }
    if (baker.reviewStatus !== 'approved') {
      throw new BadRequestException('Baker must be approved before managing fulfillment');
    }
    return baker;
  }

  private applyFulfillmentUpdate(
    db: Awaited<ReturnType<StoreService['read']>>,
    order: Order,
    input: UpdateFulfillmentInput,
    operator: string,
  ) {
    const fulfillment = db.fulfillments.find((item) => item.orderId === order.id);
    if (!fulfillment) {
      throw new NotFoundException('Fulfillment not found');
    }

    const nextStatus = input.status;
    fulfillment.status = nextStatus;
    fulfillment.courierName = requiredString(input.courierName, fulfillment.courierName);
    fulfillment.courierPhone = requiredString(input.courierPhone, fulfillment.courierPhone);
    fulfillment.eta = requiredString(input.eta, fulfillment.eta);
    fulfillment.note = requiredString(input.note, fulfillment.note);
    fulfillment.updatedAt = now();

    order.status = this.orderStatusFromFulfillment(nextStatus);
    order.updatedAt = fulfillment.updatedAt;
    db.auditLogs.push({
      id: createId('audit'),
      targetType: 'fulfillment',
      targetId: fulfillment.id,
      action: `status:${nextStatus}`,
      operator,
      note: input.note,
      createdAt: fulfillment.updatedAt,
    });

    return this.present(order, db);
  }

  private present(order: Order, db: Awaited<ReturnType<StoreService['read']>>) {
    const demand = db.demands.find((item) => item.id === order.demandId) || null;
    const quote = db.quotes.find((item) => item.id === order.quoteId) || null;
    const payment =
      db.payments
        .filter((item) => item.kind !== 'refund' && (item.orderId === order.id || item.quoteId === order.quoteId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    return {
      ...order,
      totalText: `¥${order.amount}`,
      statusText: this.statusText(order.status),
      work: presentWorkImage(db.works.find((item) => item.id === order.workId) || null),
      demand,
      quote,
      payment,
      baker: db.bakers.find((item) => item.id === order.bakerId) || null,
      fulfillment: db.fulfillments.find((item) => item.orderId === order.id) || null,
    };
  }

  private statusText(status: OrderStatus) {
    const textMap: Record<OrderStatus, string> = {
      intent_confirmed: '已确认报价意向',
      merchant_confirmed: '蛋糕师已确认',
      producing: '制作中',
      delivering: '配送/自提中',
      completed: '已完成',
      disputed: '售后处理中',
    };
    return textMap[status];
  }
}
