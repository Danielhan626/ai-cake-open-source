import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Baker } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredNumber, requiredString } from '../utils';

export interface CreateBakerInput {
  userId?: string;
  name: string;
  avatarUrl?: string;
  city?: string;
  district?: string;
  deliveryRadiusKm?: number;
  specialties?: string[];
  startingPrice?: number;
  contact?: string;
  bio?: string;
  portfolio?: string[];
  healthCertificateUrl?: string;
  businessLicenseUrl?: string;
  foodPermitUrl?: string;
}

@Injectable()
export class BakersService {
  constructor(private readonly store: StoreService) {}

  async listMine(userId: string) {
    const db = await this.store.read();
    return db.bakers
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async list(city?: string) {
    const db = await this.store.read();
    const includeSeedBakers = process.env.INCLUDE_SEED_BAKERS_IN_PUBLIC === '1';
    return db.bakers
      .filter((item) => (!city || item.city === city) && item.reviewStatus === 'approved')
      .filter((item) => includeSeedBakers || item.source !== 'seed')
      .sort((a, b) => {
        if (city && a.city === city && b.city !== city) return -1;
        if (city && a.city !== city && b.city === city) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  async get(id: string) {
    const db = await this.store.read();
    const baker = db.bakers.find((item) => item.id === id);
    if (!baker) {
      throw new NotFoundException('Baker not found');
    }
    return baker;
  }

  async create(input: CreateBakerInput) {
    const healthCertificateUrl = this.requiredCredentialUrl(input.healthCertificateUrl, 'healthCertificateUrl');
    const businessLicenseUrl = this.requiredCredentialUrl(input.businessLicenseUrl, 'businessLicenseUrl');
    const foodPermitUrl = this.requiredCredentialUrl(input.foodPermitUrl, 'foodPermitUrl');

    const baker: Baker = {
      id: createId('baker'),
      userId: requiredString(input.userId),
      source: 'user',
      name: requiredString(input.name, '新的蛋糕工作室'),
      avatarUrl: input.avatarUrl || '',
      city: requiredString(input.city, '长治'),
      district: requiredString(input.district, '潞州区'),
      deliveryRadiusKm: requiredNumber(input.deliveryRadiusKm, 10),
      specialties: Array.isArray(input.specialties) && input.specialties.length ? input.specialties : ['韩系', '生日'],
      startingPrice: requiredNumber(input.startingPrice, 199),
      contact: requiredString(input.contact, 'wechat_new_baker'),
      bio: requiredString(input.bio, '支持 AI 蛋糕定制，欢迎沟通制作细节。'),
      portfolio: Array.isArray(input.portfolio) ? input.portfolio : [],
      healthCertificateUrl,
      businessLicenseUrl,
      foodPermitUrl,
      reviewStatus: 'pending',
      createdAt: now(),
    };

    return this.store.mutate((db) => {
      db.bakers.push(baker);
      db.auditLogs.push({
        id: createId('audit'),
        targetType: 'baker',
        targetId: baker.id,
        action: 'create:pending-review',
        operator: baker.userId,
        note: 'Baker onboarding materials require platform review.',
        createdAt: now(),
      });
      return baker;
    });
  }

  private requiredCredentialUrl(value: unknown, field: string) {
    const url = requiredString(value);
    if (!url) {
      throw new BadRequestException(`${field} is required`);
    }
    if (url.startsWith('mock://')) {
      throw new BadRequestException(`${field} must be an uploaded credential file`);
    }
    if (!url.startsWith('upload://') && !/^https?:\/\//.test(url)) {
      throw new BadRequestException(`${field} must be an uploaded credential file`);
    }
    return url;
  }
}
