import { BadGatewayException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import { AiService, GenerateCakeInput } from '../ai/ai.service';
import { CreationCreditsService } from '../creation-credits/creation-credits.service';
import { CakeWork, InteractionRecord } from '../app.types';
import { StoreService } from '../store/store.service';
import { UploadsService } from '../uploads/uploads.service';
import { createId, now, requiredString } from '../utils';
import { presentedWorkImageUrl, presentWorkImage, validateWorkImageAccessToken } from './work-image.utils';

export interface CreateWorkInput extends GenerateCakeInput {
  userId?: string;
  title?: string;
  imageUrl: string;
  visibility?: 'private' | 'public';
}

export interface GenerateWorkInput extends GenerateCakeInput {
  userId?: string;
  title?: string;
}

export interface RefineWorkInput {
  userId?: string;
  refinement?: string;
  title?: string;
}

@Injectable()
export class WorksService {
  constructor(
    private readonly store: StoreService,
    private readonly aiService: AiService,
    private readonly creationCreditsService: CreationCreditsService,
    private readonly uploadsService: UploadsService,
  ) {}

  async list(userId?: string, includePending = false) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId);
    return db.works
      .filter(
        (item) =>
          (item.visibility === 'public' && item.reviewStatus === 'approved') ||
          (includePending && currentUserId && item.userId === currentUserId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((work) => this.presentWork(this.withInteraction(work, db.interactions, currentUserId)));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const work = db.works.find((item) => item.id === id);
    if (!work) {
      throw new NotFoundException('Work not found');
    }
    const currentUserId = requiredString(userId);
    const canRead = (work.visibility === 'public' && work.reviewStatus === 'approved') || work.userId === currentUserId;
    if (!canRead) {
      throw new NotFoundException('Work not found');
    }
    return this.presentWork(this.withInteraction(work, db.interactions, currentUserId));
  }

  async readImage(id: string, userId?: string, accessToken?: string) {
    const db = await this.store.read();
    const work = db.works.find((item) => item.id === id);
    if (!work) {
      throw new NotFoundException('Work not found');
    }

    const currentUserId = requiredString(userId);
    const canReadDirectly = (work.visibility === 'public' && work.reviewStatus === 'approved') || work.userId === currentUserId;
    const canReadByToken = validateWorkImageAccessToken(work.id, accessToken);
    if (!canReadDirectly && !canReadByToken) {
      throw new NotFoundException('Work not found');
    }

    return this.resolveImageContent(work);
  }

  async create(input: CreateWorkInput) {
    const workId = createId('work');
    const imageUrl = await this.persistWorkImageUrl(workId, requiredString(input.userId, 'demo-user'), input.imageUrl);
    const work = this.toWork(input, imageUrl, workId);
    await this.store.mutate((db) => {
      db.works.push(work);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'work',
        targetId: work.id,
        action: 'create:pending-review',
        operator: work.userId,
        note: 'User-created cake work requires platform review before public listing.',
        createdAt: now(),
      });
    });
    return this.get(work.id, work.userId);
  }

  async generateAndSave(input: GenerateWorkInput) {
    const workId = createId('work');
    const actorUserId = requiredString(input.userId, 'demo-user');
    const charge = await this.creationCreditsService.reserveGenerationAllowance({
      userId: actorUserId,
      workId,
      prompt: input.prompt,
    });
    let generated;
    let persistedImageUrl;
    try {
      generated = await this.aiService.generateCake(input);
      persistedImageUrl = await this.persistWorkImageUrl(workId, actorUserId, generated.imageUrl);
    } catch (error) {
      if (charge.ledger) {
        await this.creationCreditsService.refundGenerationCredits({
          userId: actorUserId,
          sourceLedgerId: charge.ledger.id,
          reason: 'AI 生成失败，已退回积分',
        });
      }
      throw error;
    }
    const work = this.toWork(input, persistedImageUrl, workId);
    const saved = await this.store.mutate((db) => {
      db.works.push(work);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'work',
        targetId: work.id,
        action: 'generate:pending-review',
        operator: work.userId,
        note: generated.provider,
        createdAt: now(),
      });
      return work;
    });
    if (charge.mode === 'daily_free') {
      await this.creationCreditsService.markDailyFreeGenerationUsed(saved.userId, saved.id);
    }

    return {
      work: await this.get(saved.id, saved.userId),
      generation: this.presentGeneration(generated),
      wallet: charge.wallet,
      generationCost: charge.generationCost,
      generationChargeMode: charge.mode,
    };
  }

  async refineAndSave(id: string, input: RefineWorkInput) {
    const db = await this.store.read();
    const sourceWork = db.works.find((item) => item.id === id);
    if (!sourceWork) {
      throw new NotFoundException('Work not found');
    }

    const actorUserId = requiredString(input.userId);
    if (!actorUserId || sourceWork.userId !== actorUserId) {
      throw new ForbiddenException('Only the work owner can refine this work');
    }

    const refinement = requiredString(input.refinement, '保留主体构思，做一个更精致、更适合落地制作的版本');
    const nextPrompt = `${sourceWork.prompt}；微调：${refinement}`;
    const charge = await this.creationCreditsService.deductRefineCredits({
      userId: actorUserId,
      workId: sourceWork.id,
      refinement,
    });
    let generated;
    try {
      generated = await this.aiService.refineCake({
        sourceImageUrl: presentedWorkImageUrl(sourceWork),
        prompt: sourceWork.prompt,
        refinement,
        scenario: sourceWork.scenario,
        style: sourceWork.style,
        color: sourceWork.color,
        size: sourceWork.size,
        budget: sourceWork.budget,
      });
    } catch (error) {
      await this.creationCreditsService.refundRefineCredits({
        userId: actorUserId,
        sourceLedgerId: charge.ledger.id,
        reason: 'AI 微调失败，已退回积分',
      });
      throw error;
    }
    const workId = createId('work');
    const persistedImageUrl = await this.persistWorkImageUrl(workId, sourceWork.userId, generated.imageUrl);
    const work = this.toWork(
      {
        userId: sourceWork.userId,
        title: requiredString(input.title, `${sourceWork.title} · 微调`),
        prompt: nextPrompt,
        scenario: sourceWork.scenario,
        style: sourceWork.style,
        color: sourceWork.color,
        size: sourceWork.size,
        budget: sourceWork.budget,
      },
      persistedImageUrl,
      workId,
    );
    const saved = await this.store.mutate((nextDb) => {
      nextDb.works.push(work);
      nextDb.auditLogs.push({
        id: createId('audit'),
        targetType: 'work',
        targetId: work.id,
        action: 'refine:pending-review',
        operator: work.userId,
        note: `source=${sourceWork.id}; provider=${generated.provider}`,
        createdAt: now(),
      });
      return work;
    });

    return {
      work: await this.get(saved.id, saved.userId),
      sourceWorkId: sourceWork.id,
      generation: this.presentGeneration(generated),
      wallet: charge.wallet,
      refineCost: charge.refineCost,
    };
  }

  async publish(id: string, userId?: string) {
    await this.store.mutate((db) => {
      const work = db.works.find((item) => item.id === id);
      if (!work) {
        throw new NotFoundException('Work not found');
      }
      const actorUserId = requiredString(userId);
      if (!actorUserId || work.userId !== actorUserId) {
        throw new ForbiddenException('Only the work owner can publish this work');
      }
      work.visibility = 'public';
      work.reviewStatus = 'pending';
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'work',
        targetId: work.id,
        action: 'submit-public-review',
        operator: work.userId,
        note: 'Work submitted to forum; pending admin/content review.',
        createdAt: now(),
      });
    });
    return this.get(id, userId);
  }

  private toWork(input: CreateWorkInput | GenerateWorkInput, imageUrl: string, id: string): CakeWork {
    const prompt = requiredString(input.prompt, '给喜欢的人做一个生日蛋糕');
    const scenario = requiredString(input.scenario, '生日');
    const style = requiredString(input.style, '韩系奶油风');

    return {
      id,
      userId: requiredString(input.userId, 'demo-user'),
      title: requiredString(input.title, `${scenario} · ${style}蛋糕`),
      prompt,
      imageUrl,
      scenario,
      style,
      color: requiredString(input.color, '粉色'),
      size: requiredString(input.size, '6寸'),
      budget: requiredString(input.budget, '200-399元'),
      visibility: 'visibility' in input && input.visibility ? input.visibility : 'private',
      reviewStatus: 'pending',
      createdAt: now(),
    };
  }

  private withInteraction(work: CakeWork, interactions: InteractionRecord[], userId?: string) {
    const targetInteractions = interactions.filter((item) => item.targetType === 'work' && item.targetId === work.id);
    const currentUserId = requiredString(userId);
    return {
      ...work,
      voteCount: targetInteractions.filter((item) => item.action === 'vote').length,
      roseCount: targetInteractions.filter((item) => item.action === 'rose').length,
      userInteraction: {
        voted: Boolean(
          currentUserId &&
            targetInteractions.some((item) => item.userId === currentUserId && item.action === 'vote'),
        ),
        roseSent: Boolean(
          currentUserId &&
            targetInteractions.some((item) => item.userId === currentUserId && item.action === 'rose'),
        ),
      },
    };
  }

  private presentWork<T extends { id: string; userId?: string; imageUrl: string; visibility?: string; reviewStatus?: string }>(work: T): T {
    return presentWorkImage(work);
  }

  private presentGeneration(generated: Awaited<ReturnType<AiService['generateCake']>>) {
    return {
      provider: generated.provider,
      prompt: generated.prompt,
      promptVersion: generated.promptVersion,
      promptProfile: generated.promptProfile,
    };
  }

  private async persistWorkImageUrl(workId: string, userId: string, imageUrl: string) {
    const sourceUrl = requiredString(imageUrl);
    if (!sourceUrl) {
      throw new BadGatewayException('Work image URL is required');
    }

    if (this.uploadsService.parseUploadId(sourceUrl)) {
      return sourceUrl;
    }

    if (/^https?:\/\//.test(sourceUrl)) {
      const upload = await this.uploadsService.createPortfolioImageFromRemote({
        userId,
        sourceUrl,
        originalName: `${workId}.png`,
      });
      if (!upload) {
        throw new BadGatewayException('Failed to persist remote work image');
      }
      return upload.url;
    }

    if (sourceUrl.startsWith('data:image/')) {
      const match = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new BadGatewayException('Unsupported inline work image format');
      }
      const [, mimeType, contentBase64] = match;
      const upload = await this.uploadsService.create({
        userId,
        kind: 'portfolio',
        fileName: `${workId}.png`,
        mimeType,
        contentBase64,
      });
      return upload.url;
    }

    return sourceUrl;
  }

  private async resolveImageContent(work: CakeWork) {
    const uploadId = this.uploadsService.parseUploadId(work.imageUrl);
    if (uploadId) {
      const { record, content } = await this.uploadsService.readContent(uploadId);
      return {
        mimeType: record.mimeType || 'application/octet-stream',
        content,
        cacheControl: this.isPublicApproved(work) ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
      };
    }

    if (work.imageUrl.startsWith('data:image/')) {
      const match = work.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return this.placeholderImage(work);
      }
      const [, mimeType, contentBase64] = match;
      return {
        mimeType,
        content: Buffer.from(contentBase64, 'base64'),
        cacheControl: 'private, max-age=3600',
      };
    }

    if (/^https?:\/\//.test(work.imageUrl)) {
      try {
        const response = await fetch(work.imageUrl);
        if (!response.ok) {
          return this.placeholderImage(work);
        }
        const mimeType = response.headers.get('content-type') || 'image/png';
        return {
          mimeType,
          content: Buffer.from(await response.arrayBuffer()),
          cacheControl: this.isPublicApproved(work) ? 'public, max-age=86400' : 'private, max-age=3600',
        };
      } catch {
        return this.placeholderImage(work);
      }
    }

    return this.placeholderImage(work);
  }

  private placeholderImage(work: CakeWork) {
    const title = this.escapeXml(requiredString(work.title, '蛋糕作品')).slice(0, 28);
    const scenario = this.escapeXml(requiredString(work.scenario, '创作记录')).slice(0, 18);
    const style = this.escapeXml(requiredString(work.style, '待补图')).slice(0, 20);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="48" fill="#f6f1ea"/><rect x="96" y="96" width="832" height="832" rx="36" fill="#fffaf4" stroke="#e1d6c8" stroke-width="8"/><circle cx="512" cy="360" r="132" fill="#f0ded3"/><path d="M372 580c40-96 240-96 280 0" fill="none" stroke="#d9b39e" stroke-width="28" stroke-linecap="round"/><text x="512" y="720" text-anchor="middle" font-size="48" font-family="Arial, sans-serif" fill="#5a3b2f">${title}</text><text x="512" y="788" text-anchor="middle" font-size="30" font-family="Arial, sans-serif" fill="#7a6f65">${scenario} · ${style}</text><text x="512" y="854" text-anchor="middle" font-size="26" font-family="Arial, sans-serif" fill="#a18f80">原图暂不可用，请重新生成或重新提交</text></svg>`;
    return {
      mimeType: 'image/svg+xml',
      content: Buffer.from(svg, 'utf8'),
      cacheControl: 'private, max-age=300',
    };
  }

  private escapeXml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isPublicApproved(work: { visibility?: string; reviewStatus?: string }) {
    return work.visibility === 'public' && work.reviewStatus === 'approved';
  }
}
