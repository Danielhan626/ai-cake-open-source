import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InteractionRecord, UserWallet } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';
import { CREATION_CHECK_IN_CREDIT, CREATION_DAILY_FREE_GENERATION } from '../creation-credits/creation-credits.service';

export interface InteractionInput {
  userId?: string;
  targetType?: 'work' | 'review';
  targetId?: string;
  action?: 'vote' | 'rose' | 'like';
}

export interface CheckInInput {
  userId?: string;
}

@Injectable()
export class InteractionsService {
  constructor(private readonly store: StoreService) {}

  async summary(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, 'demo-user');
    const quota = db.dailyGenerationQuotas.find((item) => item.userId === currentUserId && item.dateKey === this.todayKey());
    return {
      wallet: this.walletFor(db.wallets, currentUserId),
      todayCheckedIn: db.checkIns.some((item) => item.userId === currentUserId && item.dateKey === this.todayKey()),
      dailyFreeGenerationRemaining: quota && quota.freeGenerationUsed ? 0 : CREATION_DAILY_FREE_GENERATION,
      interactions: db.interactions.filter((item) => item.userId === currentUserId),
    };
  }

  async checkIn(input: CheckInInput) {
    const userId = requiredString(input.userId, 'demo-user');
    const dateKey = this.todayKey();
    const timestamp = now();

    return this.store.mutate((db) => {
      const existing = db.checkIns.find((item) => item.userId === userId && item.dateKey === dateKey);
      let wallet = db.wallets.find((item) => item.userId === userId);
      if (!wallet) {
        wallet = this.walletFor(db.wallets, userId);
        db.wallets.push(wallet);
      }

      if (existing) {
        return {
          checkedIn: true,
          roseDelta: 0,
          creationCreditDelta: 0,
          wallet,
          record: existing,
        };
      }

      const record = {
        id: createId('checkin'),
        userId,
        dateKey,
        roseDelta: 1,
        creationCreditDelta: CREATION_CHECK_IN_CREDIT,
        createdAt: timestamp,
      };
      wallet.roseBalance += 1;
      wallet.creationCreditBalance += CREATION_CHECK_IN_CREDIT;
      wallet.updatedAt = timestamp;
      db.checkIns.push(record);
      db.creationCreditLedgers.push({
        id: createId('credit_ledger'),
        userId,
        delta: CREATION_CHECK_IN_CREDIT,
        balanceAfter: wallet.creationCreditBalance,
        source: 'check_in',
        refId: record.id,
        reason: '每日签到奖励',
        createdAt: timestamp,
      });

      return {
        checkedIn: true,
        roseDelta: 1,
        creationCreditDelta: CREATION_CHECK_IN_CREDIT,
        wallet,
        record,
      };
    });
  }

  async create(input: InteractionInput) {
    const userId = requiredString(input.userId, 'demo-user');
    const targetType = input.targetType || 'work';
    const targetId = requiredString(input.targetId);
    const action = input.action || 'vote';
    const timestamp = now();

    if (!targetId) {
      throw new BadRequestException('targetId is required');
    }

    return this.store.mutate((db) => {
      if (targetType === 'work' && !db.works.some((item) => item.id === targetId)) {
        throw new NotFoundException('Work not found');
      }

      const existing = db.interactions.find(
        (item) => item.userId === userId && item.targetType === targetType && item.targetId === targetId && item.action === action,
      );
      if (existing) {
        return this.interactionResult(db.interactions, db.wallets, existing, false);
      }

      let wallet = db.wallets.find((item) => item.userId === userId);
      if (!wallet) {
        wallet = this.walletFor(db.wallets, userId);
        db.wallets.push(wallet);
      }

      if (action === 'rose') {
        if (wallet.roseBalance <= 0) {
          throw new BadRequestException('Rose balance is not enough');
        }
        wallet.roseBalance -= 1;
        wallet.updatedAt = timestamp;
      }

      if (action === 'vote') {
        wallet.score += 1;
        wallet.updatedAt = timestamp;
      }

      const record: InteractionRecord = {
        id: createId('interact'),
        userId,
        targetType,
        targetId,
        action,
        createdAt: timestamp,
      };
      db.interactions.push(record);

      return this.interactionResult(db.interactions, db.wallets, record, true);
    });
  }

  private interactionResult(interactions: InteractionRecord[], wallets: UserWallet[], record: InteractionRecord, created: boolean) {
    const sameTarget = interactions.filter((item) => item.targetType === record.targetType && item.targetId === record.targetId);
    return {
      created,
      record,
      wallet: this.walletFor(wallets, record.userId),
      counts: {
        votes: sameTarget.filter((item) => item.action === 'vote').length,
        roses: sameTarget.filter((item) => item.action === 'rose').length,
        likes: sameTarget.filter((item) => item.action === 'like').length,
      },
    };
  }

  private walletFor(wallets: UserWallet[], userId: string): UserWallet {
    return (
      wallets.find((item) => item.userId === userId) || {
        userId,
        roseBalance: 0,
        score: 0,
        rewardPending: 0,
        rewardApproved: 0,
        creationCreditBalance: 0,
        updatedAt: now(),
      }
    );
  }

  private todayKey() {
    const date = new Date();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}
