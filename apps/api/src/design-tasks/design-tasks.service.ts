import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignTask, DesignTaskCompletion, DesignTaskSource } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';
import { BotLlmService, BotTaskCandidate } from './bot-llm.service';
import { getMarketingCalendarContext } from './marketing-calendar';

export interface GenerateCandidatesInput {
  operator?: string;
}

export interface PublishTodayInput {
  operator?: string;
  taskIds?: string[];
}

export interface CompleteTaskInput {
  userId?: string;
  workId?: string;
}

@Injectable()
export class DesignTasksService {
  constructor(
    private readonly store: StoreService,
    private readonly botLlmService: BotLlmService,
  ) {}

  async today(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, '');
    const today = this.todayKey();
    const tasks = db.designTasks
      .filter((task) => task.status === 'active' && task.validFrom <= today && task.validTo >= today)
      .sort((a, b) => b.rewardAmount - a.rewardAmount)
      .map((task) => this.withUserState(task, currentUserId, db.designTaskJoins, db.designTaskCompletions));

    return {
      dateKey: today,
      tasks,
      completedTaskCount: db.designTaskCompletions.filter((item) => item.userId === currentUserId).length,
    };
  }

  async generateCandidates(input: GenerateCandidatesInput = {}) {
    const marketingContext = getMarketingCalendarContext();
    const result = await this.botLlmService.generateTaskCandidates(marketingContext);
    const timestamp = now();
    const tasks = result.items.map((item) => this.toTask(item, result.provider, 'candidate', timestamp));

    return this.store.mutate((db) => {
      db.designTasks.push(...tasks);
      for (const task of tasks) {
        db.auditLogs.push({
          id: createId('audit'),
          targetType: 'designTask',
          targetId: task.id,
          action: 'candidate:create',
          operator: requiredString(input.operator, 'bot'),
          note: result.fallbackReason || result.provider,
          createdAt: timestamp,
        });
      }
      return {
        provider: result.provider,
        fallbackReason: result.fallbackReason,
        marketingContext,
        tasks,
      };
    });
  }

  async publishToday(input: PublishTodayInput = {}) {
    const timestamp = now();
    const today = this.todayKey();
    const selectedIds = new Set(input.taskIds || []);
    return this.store.mutate((db) => {
      const candidates = db.designTasks.filter((task) => {
        if (task.status !== 'candidate') return false;
        if (selectedIds.size > 0 && !selectedIds.has(task.id)) return false;
        return task.validFrom <= today && task.validTo >= today;
      });

      for (const task of candidates) {
        task.status = 'active';
        task.validFrom = today;
        task.updatedAt = timestamp;
        db.auditLogs.push({
          id: createId('audit'),
          targetType: 'designTask',
          targetId: task.id,
          action: 'candidate:publish-today',
          operator: requiredString(input.operator, 'operator'),
          note: task.marketingTitle || task.source,
          createdAt: timestamp,
        });
      }

      return {
        dateKey: today,
        publishedCount: candidates.length,
        tasks: candidates,
      };
    });
  }

  async join(id: string, userId?: string) {
    const currentUserId = requiredString(userId, 'demo-user');
    return this.store.mutate((db) => {
      const task = this.findActiveTask(db.designTasks, id);
      if (!task) {
        throw new NotFoundException('Design task not found');
      }

      let join = db.designTaskJoins.find((item) => this.isSameTaskId(task, item.taskId) && item.userId === currentUserId);
      if (!join) {
        join = {
          id: createId('taskjoin'),
          taskId: task.id,
          userId: currentUserId,
          createdAt: now(),
        };
        db.designTaskJoins.push(join);
        task.participantCount += 1;
        task.updatedAt = now();
      }

      return {
        task: this.withUserState(task, currentUserId, db.designTaskJoins, db.designTaskCompletions),
        join,
      };
    });
  }

  async completeTask(id: string, input: CompleteTaskInput) {
    const currentUserId = requiredString(input.userId, 'demo-user');
    const workId = requiredString(input.workId);
    if (!workId) {
      throw new BadRequestException('workId is required');
    }

    return this.store.mutate((db) => {
      const task = this.findActiveTask(db.designTasks, id);
      if (!task) {
        throw new NotFoundException('Design task not found');
      }
      if (!db.works.some((item) => item.id === workId && item.userId === currentUserId)) {
        throw new NotFoundException('Work not found');
      }

      const existingCompletion = db.designTaskCompletions.find(
        (item) => this.isSameTaskId(task, item.taskId) && item.userId === currentUserId,
      );
      if (existingCompletion) {
        return {
          created: false,
          completion: existingCompletion,
          task: this.withUserState(task, currentUserId, db.designTaskJoins, db.designTaskCompletions),
        };
      }

      if (!db.designTaskJoins.some((item) => this.isSameTaskId(task, item.taskId) && item.userId === currentUserId)) {
        db.designTaskJoins.push({
          id: createId('taskjoin'),
          taskId: task.id,
          userId: currentUserId,
          createdAt: now(),
        });
        task.participantCount += 1;
      }

      const timestamp = now();
      const reward = {
        id: createId('reward'),
        userId: currentUserId,
        workId,
        amount: task.rewardAmount,
        reason: `AI Bot 任务：${task.title}`,
        status: 'pending' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const completion: DesignTaskCompletion = {
        id: createId('taskdone'),
        taskId: task.id,
        userId: currentUserId,
        workId,
        rewardReviewId: reward.id,
        rewardAmount: task.rewardAmount,
        status: 'pending',
        createdAt: timestamp,
      };
      db.rewardReviews.push(reward);
      db.designTaskCompletions.push(completion);
      let wallet = db.wallets.find((item) => item.userId === currentUserId);
      if (!wallet) {
        wallet = {
          userId: currentUserId,
          roseBalance: 0,
          score: 0,
          rewardPending: 0,
          rewardApproved: 0,
          creationCreditBalance: 0,
          updatedAt: timestamp,
        };
        db.wallets.push(wallet);
      }
      wallet.rewardPending += reward.amount;
      wallet.score += 3;
      wallet.updatedAt = timestamp;
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'designTask',
        targetId: task.id,
        action: 'complete:reward-pending',
        operator: currentUserId,
        note: reward.reason,
        createdAt: timestamp,
      });

      return {
        created: true,
        completion,
        reward,
        wallet,
        task: this.withUserState(task, currentUserId, db.designTaskJoins, db.designTaskCompletions),
      };
    });
  }

  private toTask(item: BotTaskCandidate, source: DesignTaskSource, status: DesignTask['status'], timestamp: string): DesignTask {
    return {
      id: createId('task'),
      templateId: item.marketingNodeId || item.theme,
      campaignId: item.marketingNodeId ? `${item.marketingNodeId}:${item.validFrom}:${item.validTo}` : undefined,
      legacyIds: [],
      title: item.title,
      theme: item.theme,
      prompt: item.prompt,
      scenario: item.scenario,
      style: item.style,
      color: item.color,
      rewardAmount: item.rewardAmount,
      validFrom: item.validFrom,
      validTo: item.validTo,
      tags: item.tags,
      botLine: item.botLine,
      marketingNodeId: item.marketingNodeId,
      marketingTitle: item.marketingTitle,
      source,
      status,
      participantCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private withUserState(
    task: DesignTask,
    userId: string,
    joins: Array<{ taskId: string; userId: string }>,
    completions: Array<{ taskId: string; userId: string; rewardAmount: number; status: string }>,
  ) {
    const completion = completions.find((item) => this.isSameTaskId(task, item.taskId) && item.userId === userId);
    return {
      ...task,
      participantCount: this.countTaskParticipants(task, joins),
      joined: joins.some((item) => this.isSameTaskId(task, item.taskId) && item.userId === userId),
      completed: Boolean(completion),
      rewardStatus: completion ? completion.status : 'available',
      rewardPending: completion && completion.status === 'pending' ? completion.rewardAmount : 0,
    };
  }

  private todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  private findActiveTask(tasks: DesignTask[], id: string) {
    return tasks.find((task) => task.status === 'active' && this.isSameTaskId(task, id));
  }

  private isSameTaskId(task: DesignTask, candidateId: string) {
    return task.id === candidateId || Boolean((task.legacyIds || []).includes(candidateId));
  }

  private countTaskParticipants(task: DesignTask, joins: Array<{ taskId: string; userId: string }>) {
    return new Set(joins.filter((item) => this.isSameTaskId(task, item.taskId)).map((item) => item.userId)).size;
  }
}
