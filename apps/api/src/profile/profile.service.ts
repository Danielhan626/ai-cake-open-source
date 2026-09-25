import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { requiredString } from '../utils';
import { presentWorkImage } from '../works/work-image.utils';

@Injectable()
export class ProfileService {
  constructor(private readonly store: StoreService) {}

  async history(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, 'demo-user');

    const works = db.works
      .filter((work) => work.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((work) => presentWorkImage(work));

    const demands = db.demands
      .filter((demand) => demand.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((demand) => ({
        ...demand,
        work: presentWorkImage(db.works.find((work) => work.id === demand.workId) || null),
        quoteCount: db.quotes.filter((quote) => quote.demandId === demand.id).length,
      }));

    const quotes = db.quotes
      .filter((quote) => {
        const demand = db.demands.find((item) => item.id === quote.demandId);
        const baker = db.bakers.find((item) => item.id === quote.bakerId);
        return demand?.userId === currentUserId || baker?.userId === currentUserId;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((quote) => {
        const demand = db.demands.find((item) => item.id === quote.demandId) || null;
        return {
          ...quote,
          demand,
          work: demand ? presentWorkImage(db.works.find((work) => work.id === demand.workId) || null) : null,
          baker: db.bakers.find((baker) => baker.id === quote.bakerId) || null,
        };
      });

    const orders = db.orders
      .filter((order) => order.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({
        ...order,
        totalText: `¥${order.amount}`,
        work: presentWorkImage(db.works.find((work) => work.id === order.workId) || null),
        demand: db.demands.find((demand) => demand.id === order.demandId) || null,
        quote: db.quotes.find((quote) => quote.id === order.quoteId) || null,
        baker: db.bakers.find((baker) => baker.id === order.bakerId) || null,
        fulfillment: db.fulfillments.find((fulfillment) => fulfillment.orderId === order.id) || null,
      }));

    return {
      userId: currentUserId,
      summary: {
        works: works.length,
        demands: demands.length,
        quotes: quotes.length,
        orders: orders.length,
      },
      works: works.slice(0, 20),
      demands: demands.slice(0, 20),
      quotes: quotes.slice(0, 20),
      orders: orders.slice(0, 20),
    };
  }
}
