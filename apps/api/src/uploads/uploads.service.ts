import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { UploadRecord } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';

export interface UploadInput {
  userId?: string;
  kind?: UploadRecord['kind'];
  fileName?: string;
  mimeType?: string;
  contentBase64?: string;
}

const allowedKinds: UploadRecord['kind'][] = [
  'healthCertificate',
  'businessLicense',
  'foodPermit',
  'portfolio',
  'supportEvidence',
  'other',
];

@Injectable()
export class UploadsService {
  constructor(private readonly store: StoreService) {}

  async create(input: UploadInput) {
    const contentBase64 = requiredString(input.contentBase64);
    if (!contentBase64) {
      throw new BadRequestException('contentBase64 is required');
    }

    const userId = requiredString(input.userId, 'demo-user');
    const kind = allowedKinds.includes(input.kind as UploadRecord['kind']) ? (input.kind as UploadRecord['kind']) : 'other';
    const originalName = requiredString(input.fileName, `${kind}.jpg`);
    const mimeType = requiredString(input.mimeType, 'application/octet-stream');
    const content = Buffer.from(contentBase64, 'base64');

    if (!content.length || content.length > 5 * 1024 * 1024) {
      throw new BadRequestException('File must be 1 byte to 5 MB');
    }

    const id = createId('upload');
    const extension = this.safeExtension(originalName, mimeType);
    const fileName = `${id}${extension}`;
    const uploadDir = join(process.cwd(), 'data', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, fileName), content);

    const record: UploadRecord = {
      id,
      userId,
      kind,
      originalName,
      fileName,
      mimeType,
      size: content.length,
      url: `upload://${id}`,
      createdAt: now(),
    };

    return this.store.mutate((db) => {
      db.uploads.push(record);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'upload',
        targetId: record.id,
        action: 'create',
        operator: userId,
        note: `${kind}:${originalName}`,
        createdAt: record.createdAt,
      });
      return record;
    });
  }

  async createPortfolioImageFromRemote(input: { userId?: string; sourceUrl?: string; originalName?: string }) {
    const sourceUrl = requiredString(input.sourceUrl);
    if (!/^https?:\/\//.test(sourceUrl)) {
      return null;
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new BadRequestException(`Remote image fetch failed: ${response.status}`);
    }

    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length || content.length > 15 * 1024 * 1024) {
      throw new BadRequestException('Remote image must be 1 byte to 15 MB');
    }

    const mimeType = response.headers.get('content-type') || 'image/png';
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('Remote asset must be an image');
    }

    const record = await this.createFromBuffer({
      userId: requiredString(input.userId, 'demo-user'),
      kind: 'portfolio',
      originalName: requiredString(input.originalName, 'generated-cake.png'),
      mimeType,
      content,
      note: `portfolio:remote:${sourceUrl.slice(0, 160)}`,
    });
    return record;
  }

  async findById(id: string) {
    const uploadId = requiredString(id);
    const db = await this.store.read();
    const record = db.uploads.find((item) => item.id === uploadId);
    if (!record) {
      throw new NotFoundException('Upload not found');
    }
    return record;
  }

  async findByUrl(url: string) {
    const uploadId = this.parseUploadId(url);
    if (!uploadId) {
      return null;
    }
    const db = await this.store.read();
    return db.uploads.find((item) => item.id === uploadId) || null;
  }

  async readContent(id: string) {
    const record = await this.findById(id);
    return this.readStoredContent(record);
  }

  private async readStoredContent(record: UploadRecord) {
    const uploadDir = join(process.cwd(), 'data', 'uploads');
    const content = await readFile(join(uploadDir, record.fileName));
    return {
      record,
      content,
    };
  }

  private async createFromBuffer(input: {
    userId: string;
    kind: UploadRecord['kind'];
    originalName: string;
    mimeType: string;
    content: Buffer;
    note: string;
  }) {
    const id = createId('upload');
    const extension = this.safeExtension(input.originalName, input.mimeType);
    const fileName = `${id}${extension}`;
    const uploadDir = join(process.cwd(), 'data', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, fileName), input.content);

    const record: UploadRecord = {
      id,
      userId: input.userId,
      kind: input.kind,
      originalName: input.originalName,
      fileName,
      mimeType: input.mimeType,
      size: input.content.length,
      url: `upload://${id}`,
      createdAt: now(),
    };

    return this.store.mutate((db) => {
      db.uploads.push(record);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'upload',
        targetId: record.id,
        action: 'create',
        operator: input.userId,
        note: input.note,
        createdAt: record.createdAt,
      });
      return record;
    });
  }

  parseUploadId(url: string) {
    const value = requiredString(url);
    if (!value.startsWith('upload://')) {
      return '';
    }
    return requiredString(value.slice('upload://'.length).split('/')[0]);
  }

  private safeExtension(originalName: string, mimeType: string) {
    const fromName = extname(originalName).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(fromName)) {
      return fromName;
    }
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('webp')) return '.webp';
    if (mimeType.includes('pdf')) return '.pdf';
    return '.jpg';
  }
}
