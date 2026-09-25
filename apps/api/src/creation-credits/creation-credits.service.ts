import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  CreationCreditLedger,
  CreationRechargeOrder,
  CreationRechargeProduct,
  Database,
  UserWallet,
} from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredString } from '../utils';
import {
  buildMiniProgramPaySign,
  buildWechatPayAuthorization,
  decryptWechatPayResource,
  generateWechatPayNonceStr,
  getWechatPayConfig,
  listWechatPayConfigProblems,
  verifyWechatPaySignature,
} from '../payments/wechat-pay.utils';

export const CREATION_REFINE_COST = 5;
export const CREATION_GENERATION_COST = 5;
export const CREATION_CHECK_IN_CREDIT = 10;
export const CREATION_DAILY_FREE_GENERATION = 1;

export const CREATION_RECHARGE_PRODUCTS: CreationRechargeProduct[] = [
  {
    id: 'credit_pack_60',
    title: '轻量补给',
    amount: 6,
    credits: 60,
    description: '适合偶尔微调与补图灵感。',
  },
  {
    id: 'credit_pack_200',
    title: '常用创作包',
    amount: 18,
    credits: 200,
    description: '适合持续微调与连续出图。',
  },
  {
    id: 'credit_pack_380',
    title: '高频创作包',
    amount: 30,
    credits: 380,
    description: '适合高频创作与反复打磨细节。',
  },
];

interface CreateCreationRechargeOrderInput {
  userId?: string;
  productId?: string;
}

interface WechatPayJsapiResponse {
  prepay_id?: string;
}

interface WechatPayTransactionQueryResponse {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  trade_state_desc?: string;
  success_time?: string;
}

interface WechatPayNotifyEnvelope {
  id?: string;
  event_type?: string;
  resource?: {
    algorithm?: string;
    ciphertext?: string;
    associated_data?: string;
    nonce?: string;
  };
}

interface WechatPayTransactionResource {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  trade_state_desc?: string;
  success_time?: string;
}

@Injectable()
export class CreationCreditsService {
  constructor(private readonly store: StoreService) {}

  async summary(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, 'demo-user');
    const wallet = this.walletFor(db.wallets, currentUserId);
    const quota = this.todayQuota(db, currentUserId);
    const todayCheckedIn = db.checkIns.some((item) => item.userId === currentUserId && item.dateKey === this.todayKey());
    const rechargeMode = this.rechargeMode();

    return {
      wallet,
      generationCost: CREATION_GENERATION_COST,
      refineCost: CREATION_REFINE_COST,
      checkInCredit: CREATION_CHECK_IN_CREDIT,
      dailyFreeGenerationTotal: CREATION_DAILY_FREE_GENERATION,
      dailyFreeGenerationRemaining: quota && quota.freeGenerationUsed ? 0 : CREATION_DAILY_FREE_GENERATION,
      todayCheckedIn,
      rechargeMode,
      rechargeEnabled: rechargeMode !== 'disabled',
      products: CREATION_RECHARGE_PRODUCTS,
      recentLedger: db.creationCreditLedgers
        .filter((item) => item.userId === currentUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20),
    };
  }

  async listRechargeOrders(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, 'demo-user');
    return db.creationRechargeOrders
      .filter((item) => item.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        ...item,
        product: this.productFor(item.productId),
      }));
  }

  async markDailyFreeGenerationUsed(userId?: string, workId?: string) {
    const currentUserId = requiredString(userId, 'demo-user');
    const timestamp = now();
    const dateKey = this.todayKey();

    return this.store.mutate((db) => {
      const existing = db.dailyGenerationQuotas.find((item) => item.userId === currentUserId && item.dateKey === dateKey);
      if (existing) {
        if (!existing.freeGenerationUsed) {
          existing.freeGenerationUsed = true;
          existing.usedAt = timestamp;
          existing.updatedAt = timestamp;
        }
        return existing;
      }

      const record = {
        id: createId('daily_gen'),
        userId: currentUserId,
        dateKey,
        freeGenerationUsed: true,
        usedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.dailyGenerationQuotas.push(record);
      if (workId) {
        db.auditLogs.push({
          id: createId('audit'),
          targetType: 'work',
          targetId: workId,
          action: 'daily-free-generation-used',
          operator: currentUserId,
          note: dateKey,
          createdAt: timestamp,
        });
      }
      return record;
    });
  }

  async assertDailyFreeGenerationAvailable(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId, 'demo-user');
    const quota = this.todayQuota(db, currentUserId);
    if (quota && quota.freeGenerationUsed) {
      throw new BadRequestException('Daily free generation quota is used');
    }
    return {
      available: true,
      remaining: CREATION_DAILY_FREE_GENERATION,
    };
  }

  async reserveGenerationAllowance(input: { userId?: string; workId?: string; prompt?: string }) {
    const currentUserId = requiredString(input.userId, 'demo-user');
    const timestamp = now();
    const dateKey = this.todayKey();
    const workId = requiredString(input.workId);

    return this.store.mutate((db) => {
      const quota = db.dailyGenerationQuotas.find((item) => item.userId === currentUserId && item.dateKey === dateKey);
      if (!quota || !quota.freeGenerationUsed) {
        return {
          mode: 'daily_free' as const,
          ledger: null,
          wallet: this.walletFor(db.wallets, currentUserId),
          generationCost: 0,
        };
      }

      const wallet = this.ensureWallet(db, currentUserId, timestamp);
      if (wallet.creationCreditBalance < CREATION_GENERATION_COST) {
        throw new BadRequestException('Creation credit balance is not enough');
      }

      wallet.creationCreditBalance -= CREATION_GENERATION_COST;
      wallet.updatedAt = timestamp;
      const ledger = this.pushLedger(db, {
        userId: currentUserId,
        delta: -CREATION_GENERATION_COST,
        balanceAfter: wallet.creationCreditBalance,
        source: 'generate_deduct',
        refId: workId,
        reason: requiredString(input.prompt, '基础生成'),
        createdAt: timestamp,
      });

      return {
        mode: 'credits' as const,
        ledger,
        wallet,
        generationCost: CREATION_GENERATION_COST,
      };
    });
  }

  async refundGenerationCredits(input: { userId?: string; sourceLedgerId?: string; reason?: string }) {
    const currentUserId = requiredString(input.userId, 'demo-user');
    const sourceLedgerId = requiredString(input.sourceLedgerId);
    const timestamp = now();

    if (!sourceLedgerId) {
      return null;
    }

    return this.store.mutate((db) => {
      const sourceLedger = db.creationCreditLedgers.find((item) => item.id === sourceLedgerId && item.userId === currentUserId);
      if (!sourceLedger || sourceLedger.source !== 'generate_deduct') {
        return null;
      }

      const existingRefund = db.creationCreditLedgers.find(
        (item) => item.userId === currentUserId && item.source === 'generate_refund' && item.refId === sourceLedgerId,
      );
      if (existingRefund) {
        return existingRefund;
      }

      const wallet = this.ensureWallet(db, currentUserId, timestamp);
      wallet.creationCreditBalance += Math.abs(sourceLedger.delta || CREATION_GENERATION_COST);
      wallet.updatedAt = timestamp;

      return this.pushLedger(db, {
        userId: currentUserId,
        delta: Math.abs(sourceLedger.delta || CREATION_GENERATION_COST),
        balanceAfter: wallet.creationCreditBalance,
        source: 'generate_refund',
        refId: sourceLedgerId,
        reason: requiredString(input.reason, 'AI 生成失败，积分已退回'),
        createdAt: timestamp,
      });
    });
  }

  async deductRefineCredits(input: { userId?: string; workId?: string; refinement?: string }) {
    const currentUserId = requiredString(input.userId, 'demo-user');
    const timestamp = now();
    const workId = requiredString(input.workId);

    return this.store.mutate((db) => {
      const wallet = this.ensureWallet(db, currentUserId, timestamp);
      if (wallet.creationCreditBalance < CREATION_REFINE_COST) {
        throw new BadRequestException('Creation credit balance is not enough');
      }

      wallet.creationCreditBalance -= CREATION_REFINE_COST;
      wallet.updatedAt = timestamp;
      const ledger = this.pushLedger(db, {
        userId: currentUserId,
        delta: -CREATION_REFINE_COST,
        balanceAfter: wallet.creationCreditBalance,
        source: 'refine_deduct',
        refId: workId,
        reason: requiredString(input.refinement, '继续微调设计'),
        createdAt: timestamp,
      });

      return {
        wallet,
        ledger,
        refineCost: CREATION_REFINE_COST,
      };
    });
  }

  async refundRefineCredits(input: { userId?: string; sourceLedgerId?: string; reason?: string }) {
    const currentUserId = requiredString(input.userId, 'demo-user');
    const sourceLedgerId = requiredString(input.sourceLedgerId);
    const timestamp = now();

    if (!sourceLedgerId) {
      return null;
    }

    return this.store.mutate((db) => {
      const sourceLedger = db.creationCreditLedgers.find((item) => item.id === sourceLedgerId && item.userId === currentUserId);
      if (!sourceLedger) {
        return null;
      }

      const existingRefund = db.creationCreditLedgers.find(
        (item) => item.userId === currentUserId && item.source === 'refine_refund' && item.refId === sourceLedgerId,
      );
      if (existingRefund) {
        return existingRefund;
      }

      const wallet = this.ensureWallet(db, currentUserId, timestamp);
      wallet.creationCreditBalance += Math.abs(sourceLedger.delta || CREATION_REFINE_COST);
      wallet.updatedAt = timestamp;

      return this.pushLedger(db, {
        userId: currentUserId,
        delta: Math.abs(sourceLedger.delta || CREATION_REFINE_COST),
        balanceAfter: wallet.creationCreditBalance,
        source: 'refine_refund',
        refId: sourceLedgerId,
        reason: requiredString(input.reason, 'AI 微调失败，积分已退回'),
        createdAt: timestamp,
      });
    });
  }

  async createRechargeOrder(input: CreateCreationRechargeOrderInput) {
    const productId = requiredString(input.productId);
    const currentUserId = requiredString(input.userId, 'demo-user');
    const product = this.productFor(productId);
    if (!product) {
      throw new NotFoundException('Creation recharge product not found');
    }

    const provider = this.resolveRechargeProvider();
    const timestamp = now();
    const snapshot = await this.store.read();
    const user = snapshot.users.find((item) => item.id === currentUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (provider === 'wechat') {
      return this.createWechatRechargeOrder({
        orderId: createId('credit_order'),
        userId: currentUserId,
        userOpenId: requiredString(user.openId),
        product,
        timestamp,
      });
    }

    return this.store.mutate((db) => {
      const order: CreationRechargeOrder = {
        id: createId('credit_order'),
        userId: currentUserId,
        productId: product.id,
        credits: product.credits,
        amount: product.amount,
        provider,
        status: 'pending',
        outTradeNo: createId('credit_trade'),
        payParams: this.createMockPayParams(product.id, product.amount),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.creationRechargeOrders.push(order);
      return order;
    });
  }

  async syncRechargeOrder(id: string, userId?: string) {
    const currentUserId = requiredString(userId, 'demo-user');
    const snapshot = await this.store.read();
    const order = snapshot.creationRechargeOrders.find((item) => item.id === id);
    if (!order || order.userId !== currentUserId) {
      throw new NotFoundException('Creation recharge order not found');
    }
    if (order.provider !== 'wechat') {
      return order;
    }

    const outTradeNo = requiredString(order.outTradeNo, order.id);
    const query = await this.queryWechatTransaction(outTradeNo);
    return this.store.mutate((db) => {
      const current = db.creationRechargeOrders.find((item) => item.id === id);
      if (!current || current.userId !== currentUserId) {
        throw new NotFoundException('Creation recharge order not found');
      }
      return this.applyWechatTransactionSnapshot(db, current, query, now());
    });
  }

  async mockPaidRechargeOrder(id: string, userId?: string) {
    const currentUserId = requiredString(userId, 'demo-user');
    if (this.isProduction()) {
      throw new BadRequestException('Mock creation credit recharge is disabled in production');
    }

    return this.store.mutate((db) => {
      const order = db.creationRechargeOrders.find((item) => item.id === id);
      if (!order || order.userId !== currentUserId) {
        throw new NotFoundException('Creation recharge order not found');
      }
      return this.applyRechargePaid(db, order, now());
    });
  }

  async handleWechatNotify(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
  }) {
    const config = getWechatPayConfig();
    if (!config) {
      throw new BadRequestException('WeChat Pay config incomplete');
    }

    const signature = this.getHeader(input.headers, 'wechatpay-signature');
    const timestamp = this.getHeader(input.headers, 'wechatpay-timestamp');
    const nonce = this.getHeader(input.headers, 'wechatpay-nonce');
    const serialNo = this.getHeader(input.headers, 'wechatpay-serial');

    if (!signature || !timestamp || !nonce || !serialNo) {
      throw new UnauthorizedException('WeChat Pay callback signature headers are missing');
    }
    if (serialNo !== config.verifierSerialNo) {
      throw new UnauthorizedException('WeChat Pay callback signature serial mismatch');
    }
    if (
      !verifyWechatPaySignature({
        body: input.rawBody,
        timestamp,
        nonceStr: nonce,
        signature,
        publicKeyPem: config.verifierPublicKeyPem,
      })
    ) {
      throw new UnauthorizedException('WeChat Pay callback signature verification failed');
    }

    const envelope = JSON.parse(input.rawBody || '{}') as WechatPayNotifyEnvelope;
    if (!envelope.resource?.ciphertext || !envelope.resource?.nonce) {
      return { code: 'SUCCESS', message: 'ignored' };
    }

    const plainText = decryptWechatPayResource({
      apiV3Key: config.apiV3Key,
      nonce: envelope.resource.nonce,
      associatedData: envelope.resource.associated_data,
      ciphertext: envelope.resource.ciphertext,
    });

    if (envelope.event_type === 'TRANSACTION.SUCCESS') {
      const resource = JSON.parse(plainText || '{}') as WechatPayTransactionResource;
      const outTradeNo = requiredString(resource.out_trade_no);
      if (!outTradeNo) {
        throw new BadRequestException('WeChat Pay transaction callback missing out_trade_no');
      }

      await this.store.mutate((db) => {
        const order = db.creationRechargeOrders.find((item) => requiredString(item.outTradeNo, item.id) === outTradeNo);
        if (!order) {
          return null;
        }
        return this.applyWechatTransactionSnapshot(db, order, resource, now(), envelope.id);
      });
      return { code: 'SUCCESS', message: '成功' };
    }

    return { code: 'SUCCESS', message: 'ignored' };
  }

  private productFor(productId: string) {
    return CREATION_RECHARGE_PRODUCTS.find((item) => item.id === productId) || null;
  }

  private rechargeMode() {
    if (process.env.PAY_PROVIDER === 'wechat') {
      return listWechatPayConfigProblems().length === 0 ? 'wechat' : 'disabled';
    }
    return this.isProduction() ? 'disabled' : 'mock';
  }

  private resolveRechargeProvider(): CreationRechargeOrder['provider'] {
    const mode = this.rechargeMode();
    if (mode === 'disabled') {
      throw new BadRequestException('Creation credit recharge is not available yet');
    }
    return mode;
  }

  private async createWechatRechargeOrder(input: {
    orderId: string;
    userId: string;
    userOpenId: string;
    product: CreationRechargeProduct;
    timestamp: string;
  }) {
    if (!input.userOpenId) {
      throw new BadRequestException('当前账号还没有微信 openId，请先重新完成微信登录后再发起支付');
    }

    const config = getWechatPayConfig();
    if (!config) {
      throw new BadRequestException('WeChat Pay config incomplete');
    }

    const transaction = await this.createWechatJsapiTransaction({
      config,
      outTradeNo: input.orderId,
      amountFen: this.amountToFen(input.product.amount),
      description: `如意鲜果蛋糕 ${input.product.title}`.slice(0, 64),
      openId: input.userOpenId,
    });

    return this.store.mutate((db) => {
      const order: CreationRechargeOrder = {
        id: input.orderId,
        userId: input.userId,
        productId: input.product.id,
        credits: input.product.credits,
        amount: input.product.amount,
        provider: 'wechat',
        status: 'pending',
        outTradeNo: input.orderId,
        prepayId: transaction.prepayId,
        tradeState: 'NOTPAY',
        tradeStateDesc: '等待用户完成微信支付',
        payParams: transaction.payParams,
        createdAt: input.timestamp,
        updatedAt: input.timestamp,
        lastSyncedAt: input.timestamp,
      };
      db.creationRechargeOrders.push(order);
      return order;
    });
  }

  private async createWechatJsapiTransaction(input: {
    config: NonNullable<ReturnType<typeof getWechatPayConfig>>;
    outTradeNo: string;
    amountFen: number;
    description: string;
    openId: string;
  }) {
    const response = await this.requestWechatPay<WechatPayJsapiResponse>({
      method: 'POST',
      path: '/v3/pay/transactions/jsapi',
      body: {
        appid: input.config.appId,
        mchid: input.config.mchId,
        description: input.description,
        out_trade_no: input.outTradeNo,
        notify_url: `${input.config.notifyUrl.replace(/\/payments\/wechat\/notify$/, '')}/creation-credits/wechat/notify`,
        amount: {
          total: input.amountFen,
          currency: 'CNY',
        },
        payer: {
          openid: input.openId,
        },
      },
      config: input.config,
    });

    const prepayId = requiredString(response.prepay_id);
    if (!prepayId) {
      throw new BadGatewayException('WeChat Pay JSAPI response missing prepay_id');
    }

    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = generateWechatPayNonceStr();
    const packageValue = `prepay_id=${prepayId}`;

    return {
      prepayId,
      payParams: {
        appId: input.config.appId,
        timeStamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign: buildMiniProgramPaySign({
          appId: input.config.appId,
          timeStamp,
          nonceStr,
          packageValue,
          merchantPrivateKeyPem: input.config.merchantPrivateKeyPem,
        }),
      },
    };
  }

  private async queryWechatTransaction(outTradeNo: string) {
    const config = getWechatPayConfig();
    if (!config) {
      throw new BadRequestException('WeChat Pay config incomplete');
    }

    return this.requestWechatPay<WechatPayTransactionQueryResponse>({
      method: 'GET',
      path: `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}`,
      query: {
        mchid: config.mchId,
      },
      config,
    });
  }

  private async requestWechatPay<T>(input: {
    method: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    config: NonNullable<ReturnType<typeof getWechatPayConfig>>;
  }): Promise<T> {
    const queryString = input.query ? new URLSearchParams(input.query).toString() : '';
    const canonicalUrl = queryString ? `${input.path}?${queryString}` : input.path;
    const bodyText = input.body ? JSON.stringify(input.body) : '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = generateWechatPayNonceStr();
    const authorization = buildWechatPayAuthorization({
      method: input.method,
      canonicalUrl,
      body: bodyText,
      timestamp,
      nonceStr,
      config: input.config,
    });

    const response = await fetch(`${input.config.baseUrl}${canonicalUrl}`, {
      method: input.method,
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
        'Wechatpay-Serial': input.config.verifierSerialNo,
      },
      body: bodyText || undefined,
    });

    const rawText = await response.text();
    let data: Record<string, unknown> | string = rawText;
    try {
      data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      data = rawText;
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data && typeof data.message === 'string'
          ? data.message
          : rawText || `WeChat Pay request failed: ${response.status}`;
      throw new BadGatewayException(message);
    }

    return (data || {}) as T;
  }

  private createMockPayParams(productId: string, amount: number) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(12).toString('hex');
    const appId = process.env.WECHAT_APP_ID || 'wx_mock_app_id';
    const mchId = process.env.WECHAT_MCH_ID || 'mock_mch_id';
    const pkg = `prepay_id=mock_${productId}_${timeStamp}`;
    const signSeed = [appId, mchId, productId, amount, timeStamp, nonceStr].join('|');

    return {
      appId,
      mchId,
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign: createHash('sha256').update(signSeed).digest('hex'),
    };
  }

  private applyWechatTransactionSnapshot(
    db: Database,
    order: CreationRechargeOrder,
    snapshot: WechatPayTransactionQueryResponse,
    timestamp: string,
    notifyId?: string,
  ) {
    order.transactionId = requiredString(snapshot.transaction_id, order.transactionId);
    order.tradeState = requiredString(snapshot.trade_state, order.tradeState);
    order.tradeStateDesc = requiredString(snapshot.trade_state_desc, order.tradeStateDesc);
    order.lastSyncedAt = timestamp;
    order.updatedAt = timestamp;
    order.notifyId = requiredString(notifyId, order.notifyId);
    const tradeState = requiredString(snapshot.trade_state);
    if (tradeState === 'SUCCESS') {
      order.paidAt = requiredString(snapshot.success_time, order.paidAt || timestamp);
      return this.applyRechargePaid(db, order, timestamp);
    }
    if (['CLOSED', 'PAYERROR', 'REVOKED'].includes(tradeState)) {
      order.status = 'failed';
      return order;
    }
    order.status = 'pending';
    return order;
  }

  private applyRechargePaid(db: Database, order: CreationRechargeOrder, timestamp: string) {
    order.status = 'paid';
    order.paidAt = order.paidAt || timestamp;
    order.updatedAt = timestamp;

    const wallet = this.ensureWallet(db, order.userId, timestamp);
    const existingLedger = db.creationCreditLedgers.find((item) => item.userId === order.userId && item.source === 'recharge' && item.refId === order.id);
    if (!existingLedger) {
      wallet.creationCreditBalance += order.credits;
      wallet.updatedAt = timestamp;
      this.pushLedger(db, {
        userId: order.userId,
        delta: order.credits,
        balanceAfter: wallet.creationCreditBalance,
        source: 'recharge',
        refId: order.id,
        reason: `充值 ${order.credits} 创作积分`,
        createdAt: timestamp,
      });
    }
    return order;
  }

  private pushLedger(db: Database, input: Omit<CreationCreditLedger, 'id'>) {
    const ledger: CreationCreditLedger = {
      id: createId('credit_ledger'),
      ...input,
    };
    db.creationCreditLedgers.push(ledger);
    return ledger;
  }

  private ensureWallet(db: Database, userId: string, timestamp: string) {
    let wallet = db.wallets.find((item) => item.userId === userId);
    if (!wallet) {
      wallet = {
        userId,
        roseBalance: 0,
        score: 0,
        rewardPending: 0,
        rewardApproved: 0,
        creationCreditBalance: 0,
        updatedAt: timestamp,
      };
      db.wallets.push(wallet);
    } else if (typeof wallet.creationCreditBalance !== 'number') {
      wallet.creationCreditBalance = 0;
    }
    return wallet;
  }

  private walletFor(wallets: UserWallet[], userId: string) {
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

  private todayQuota(db: Database, userId: string) {
    const dateKey = this.todayKey();
    return db.dailyGenerationQuotas.find((item) => item.userId === userId && item.dateKey === dateKey) || null;
  }

  private todayKey() {
    const date = new Date();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private amountToFen(amount: number) {
    return Math.max(1, Math.round(Number(amount || 0) * 100));
  }

  private isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const matchKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    const value = matchKey ? headers[matchKey] : undefined;
    if (Array.isArray(value)) {
      return requiredString(value[0]);
    }
    return requiredString(value);
  }
}
