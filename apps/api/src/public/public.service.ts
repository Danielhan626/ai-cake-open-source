import { BadRequestException, Injectable } from '@nestjs/common';
import { SupportTicket } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';

export interface CreateSupportTicketInput {
  orderId?: string;
  userId?: string;
  type?: string;
  contact?: string;
  description?: string;
  evidenceNote?: string;
}

@Injectable()
export class PublicService {
  constructor(private readonly store: StoreService) {}

  async createSupportTicket(input: CreateSupportTicketInput) {
    const timestamp = now();
    const userId = requiredString(input.userId, createId('guest-user'));
    const ticket: SupportTicket = {
      id: createId('ticket'),
      orderId: requiredString(input.orderId, 'unlinked-order'),
      userId,
      type: requiredString(input.type, '订单沟通'),
      contact: this.requiredSupportField(input.contact, 'contact'),
      description: this.requiredSupportField(input.description, 'description'),
      evidenceNote: requiredString(input.evidenceNote, '暂无凭证说明'),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.store.mutate((db) => {
      db.supportTickets.push(ticket);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'support',
        targetId: ticket.id,
        action: 'create',
        operator: ticket.userId,
        note: ticket.type,
        createdAt: timestamp,
      });
      return ticket;
    });
  }

  private requiredSupportField(value: unknown, field: string) {
    const normalized = requiredString(value);
    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized;
  }
}
