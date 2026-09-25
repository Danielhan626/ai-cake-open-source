import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AdminAccount, Baker, Database, DesignTask, UserWallet } from '../app.types';

const now = () => new Date().toISOString();

const seedDesignTaskIdentities: Record<string, Pick<DesignTask, 'id' | 'templateId' | 'campaignId' | 'legacyIds'>> = {
  task_world_cup_watch_party: {
    id: 'task_world_cup_watch_party_2026_06_11_2026_07_19',
    templateId: 'world_cup_watch_party',
    campaignId: 'world_cup_2026',
    legacyIds: ['task_world_cup_watch_party'],
  },
  task_graduation_highlight: {
    id: 'task_graduation_highlight_2026_05_20_2026_07_10',
    templateId: 'graduation_highlight',
    campaignId: 'graduation_2026',
    legacyIds: ['task_graduation_highlight'],
  },
  task_fruit_healing: {
    id: 'task_fruit_healing_2026_year_round',
    templateId: 'fruit_healing',
    campaignId: 'evergreen_2026',
    legacyIds: ['task_fruit_healing'],
  },
};

@Injectable()
export class StoreService {
  private readonly dbPath = join(process.cwd(), 'data', 'db.json');
  private cache: Database | null = null;

  async read(): Promise<Database> {
    if (this.cache) {
      return structuredClone(this.cache);
    }

    try {
      const raw = await readFile(this.dbPath, 'utf8');
      this.cache = this.migrate(JSON.parse(raw) as Partial<Database>);
    } catch {
      this.cache = this.seed();
      await this.persist(this.cache);
    }

    return structuredClone(this.cache);
  }

  async write(next: Database): Promise<Database> {
    this.cache = structuredClone(next);
    await this.persist(this.cache);
    return structuredClone(this.cache);
  }

  async mutate<T>(mutator: (db: Database) => T): Promise<T> {
    const db = await this.read();
    const result = mutator(db);
    await this.write(db);
    return result;
  }

  private async persist(db: Database) {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await writeFile(this.dbPath, JSON.stringify(db, null, 2), 'utf8');
  }

  private migrate(db: Partial<Database>): Database {
    return {
      users: db.users || [],
      sessions: db.sessions || [],
      adminAccounts: db.adminAccounts || this.seedAdminAccounts(),
      adminSessions: db.adminSessions || [],
      works: db.works || [],
      demands: db.demands || [],
      bakers: this.migrateBakers(db.bakers || []),
      quotes: db.quotes || [],
      payments: db.payments || [],
      orders: db.orders || [],
      fulfillments: db.fulfillments || [],
      refundRequests: db.refundRequests || [],
      supportTickets: db.supportTickets || [],
      rewardReviews: db.rewardReviews || [],
      designTasks: this.migrateDesignTasks(db.designTasks || this.seedDesignTasks()),
      designTaskJoins: db.designTaskJoins || [],
      designTaskCompletions: db.designTaskCompletions || [],
      interactions: db.interactions || [],
      wallets: this.migrateWallets(db.wallets || []),
      checkIns: (db.checkIns || []).map((item) => ({
        ...item,
        creationCreditDelta: typeof item.creationCreditDelta === 'number' ? item.creationCreditDelta : 0,
      })),
      creationCreditLedgers: db.creationCreditLedgers || [],
      creationRechargeOrders: db.creationRechargeOrders || [],
      dailyGenerationQuotas: db.dailyGenerationQuotas || [],
      uploads: db.uploads || [],
      auditLogs: db.auditLogs || [],
    };
  }

  private seed(): Database {
    return {
      users: [
        {
          id: 'demo-user',
          nickname: 'Mia',
          avatarUrl: '',
          city: '长治',
          createdAt: now(),
        },
        {
          id: 'demo-baker-user',
          nickname: '甜野蛋糕工作室',
          avatarUrl: '',
          city: '长治',
          createdAt: now(),
        },
      ],
      sessions: [],
      adminAccounts: this.seedAdminAccounts(),
      adminSessions: [],
      works: [],
      demands: [],
      bakers: [
        {
          id: 'demo-baker',
          userId: 'demo-baker-user',
          source: 'seed',
          name: '甜野蛋糕工作室',
          avatarUrl: '',
          city: '长治',
          district: '潞州区',
          deliveryRadiusKm: 12,
          specialties: ['韩系', '花艺', '情侣', '宠物主题'],
          startingPrice: 268,
          contact: 'wechat_demo_baker',
          bio: '擅长奶油花艺、复古韩系和宠物主题定制，支持长治同城配送。',
          portfolio: [
            'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=900&q=80',
          ],
          healthCertificateUrl: 'mock://health-certificate/demo-baker',
          businessLicenseUrl: 'mock://business-license/demo-baker',
          reviewStatus: 'approved',
          createdAt: now(),
        },
        {
          id: 'demo-baker-taiyuan',
          userId: 'demo-baker-taiyuan-user',
          source: 'seed',
          name: '并州鲜果蛋糕屋',
          avatarUrl: '',
          city: '太原',
          district: '小店区',
          deliveryRadiusKm: 10,
          specialties: ['鲜果', '生日', '低糖'],
          startingPrice: 238,
          contact: 'wechat_demo_taiyuan_baker',
          bio: '太原本地体验蛋糕师，支持鲜果奶油和生日主题定制。',
          portfolio: [
            'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=900&q=80',
          ],
          healthCertificateUrl: 'mock://health-certificate/demo-baker-taiyuan',
          businessLicenseUrl: 'mock://business-license/demo-baker-taiyuan',
          reviewStatus: 'approved',
          createdAt: now(),
        },
      ],
      quotes: [],
      payments: [],
      orders: [],
      fulfillments: [],
      refundRequests: [],
      supportTickets: [],
      rewardReviews: [],
      designTasks: this.seedDesignTasks(),
      designTaskJoins: [],
      designTaskCompletions: [],
      interactions: [],
      wallets: [
        {
          userId: 'demo-user',
          roseBalance: 0,
          score: 0,
          rewardPending: 0,
          rewardApproved: 0,
          creationCreditBalance: 0,
          updatedAt: now(),
        },
      ],
      checkIns: [],
      creationCreditLedgers: [],
      creationRechargeOrders: [],
      dailyGenerationQuotas: [],
      uploads: [],
      auditLogs: [],
    };
  }

  private migrateWallets(wallets: UserWallet[]) {
    return wallets.map((wallet) => ({
      ...wallet,
      creationCreditBalance: typeof wallet.creationCreditBalance === 'number' ? wallet.creationCreditBalance : 0,
    }));
  }

  private seedDesignTasks() {
    const timestamp = now();
    return [
      {
        id: 'task_world_cup_watch_party_2026_06_11_2026_07_19',
        templateId: 'world_cup_watch_party',
        campaignId: 'world_cup_2026',
        legacyIds: ['task_world_cup_watch_party'],
        title: '世界杯观赛蛋糕',
        theme: '世界杯朋友聚会',
        prompt: '世界杯观赛派对蛋糕，足球元素，适合朋友聚会拍照分享',
        scenario: '聚会',
        style: '运动派对',
        color: '绿色',
        rewardAmount: 96,
        validFrom: '2026-06-11',
        validTo: '2026-07-19',
        tags: ['世界杯', '观赛', '派对'],
        botLine: '深度求索：用球队配色、进球庆祝和可制作足球装饰做出传播感。',
        source: 'seed' as const,
        status: 'active' as const,
        participantCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task_graduation_highlight_2026_05_20_2026_07_10',
        templateId: 'graduation_highlight',
        campaignId: 'graduation_2026',
        legacyIds: ['task_graduation_highlight'],
        title: '毕业高光款',
        theme: '毕业季祝福',
        prompt: '送给毕业朋友，清爽高级，有祝福感，适合拍毕业照',
        scenario: '毕业',
        style: '高级简约',
        color: '蓝色',
        rewardAmount: 88,
        validFrom: '2026-05-20',
        validTo: '2026-07-10',
        tags: ['毕业季', '祝福', '青春'],
        botLine: '通义千问：把祝福语缩短到 8 个字以内，更适合蛋糕牌。',
        source: 'seed' as const,
        status: 'active' as const,
        participantCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task_fruit_healing_2026_year_round',
        templateId: 'fruit_healing',
        campaignId: 'evergreen_2026',
        legacyIds: ['task_fruit_healing'],
        title: '鲜果治愈款',
        theme: '鲜果生日与朋友聚会',
        prompt: '鲜果奶油蛋糕，水果饱满，干净治愈，适合生日和朋友聚会',
        scenario: '生日',
        style: '清新水果',
        color: '白绿',
        rewardAmount: 42,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        tags: ['鲜果', '生日', '可制作'],
        botLine: 'Qwen：鲜果蛋糕更容易被本地师傅还原，适合作为长治试运营任务。',
        source: 'seed' as const,
        status: 'active' as const,
        participantCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
  }

  private migrateDesignTasks(tasks: DesignTask[]): DesignTask[] {
    return tasks.map((task) => {
      const identity = seedDesignTaskIdentities[task.id];
      if (!identity) {
        return {
          ...task,
          templateId: task.templateId || task.marketingNodeId || task.id,
          campaignId: task.campaignId || task.marketingTitle || task.marketingNodeId,
          legacyIds: task.legacyIds || [],
          participantCount: typeof task.participantCount === 'number' ? task.participantCount : 0,
        };
      }
      return {
        ...task,
        ...identity,
        legacyIds: Array.from(new Set([...(identity.legacyIds || []), ...(task.legacyIds || []), task.id])),
        participantCount: typeof task.participantCount === 'number' ? task.participantCount : 0,
      };
    });
  }

  private migrateBakers(bakers: Baker[]): Baker[] {
    return bakers.map((baker) => {
      const looksLikeSeed =
        baker.id.startsWith('demo-baker') ||
        baker.userId.startsWith('demo-baker') ||
        (baker.contact || '').includes('wechat_demo') ||
        (baker.healthCertificateUrl || '').startsWith('mock://') ||
        (baker.businessLicenseUrl || '').startsWith('mock://') ||
        Boolean(baker.foodPermitUrl && baker.foodPermitUrl.startsWith('mock://'));
      return {
        ...baker,
        source: baker.source || (looksLikeSeed ? 'seed' : 'user'),
      };
    });
  }

  private seedAdminAccounts(): AdminAccount[] {
    const timestamp = now();
    return [
      {
        id: 'admin_owner',
        username: process.env.ADMIN_USERNAME || 'admin',
        displayName: '平台管理员',
        roles: ['owner', 'operator', 'support', 'finance'],
        status: 'active' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
  }
}
