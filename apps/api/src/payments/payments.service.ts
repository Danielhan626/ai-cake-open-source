import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Payment } from '../app.types';
import { StoreService } from '../store/store.service';
import { createId, now, requiredNumber, requiredString } from '../utils';
import {
  buildMiniProgramPaySign,
  buildWechatPayAuthorization,
  decryptWechatPayResource,
  generateWechatPayNonceStr,
  getWechatPayConfig,
  listWechatPayConfigProblems,
  verifyWechatPaySignature,
} from './wechat-pay.utils';

export interface CreatePaymentInput {
  quoteId: string;
  userId?: string;
  orderId?: string;
}

export interface CreateRefundPaymentInput {
  paymentId?: string;
  refundRequestId: string;
  orderId: string;
  userId: string;
  amount: number;
  reason?: string;
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

interface WechatPayRefundResource {
  out_refund_no?: string;
  refund_id?: string;
  refund_status?: string;
  success_time?: string;
}

interface WechatPayRefundResponse {
  out_refund_no?: string;
  refund_id?: string;
  status?: string;
  success_time?: string;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly store: StoreService) {}

  async list(userId?: string) {
    const db = await this.store.read();
    const currentUserId = requiredString(userId);
    return db.payments
      .filter((payment) => payment.userId === currentUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((payment) => ({
        ...payment,
        quote: db.quotes.find((quote) => quote.id === payment.quoteId) || null,
      }));
  }

  async get(id: string, userId?: string) {
    const db = await this.store.read();
    const payment = db.payments.find((item) => item.id === id);
    const currentUserId = requiredString(userId);
    if (!payment || payment.userId !== currentUserId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async create(input: CreatePaymentInput) {
    const provider = this.paymentProvider();
    const context = await this.prepareCreateContext(input);
    if (context.existing) {
      return context.existing;
    }

    if (provider === 'wechat') {
      return this.createWechatPayment(context);
    }

    return this.store.mutate((db) => {
      const payment: Payment = {
        id: context.paymentId,
        quoteId: context.quote.id,
        userId: context.userId,
        amount: context.amount,
        provider,
        status: 'pending',
        orderId: context.order?.id,
        outTradeNo: context.paymentId,
        payParams: this.createMockPayParams(context.paymentId, context.amount),
        createdAt: context.timestamp,
      };

      db.payments.push(payment);
      return payment;
    });
  }

  async sync(id: string, userId?: string) {
    const currentUserId = requiredString(userId);
    const snapshot = await this.store.read();
    const payment = snapshot.payments.find((item) => item.id === id);
    if (!payment || payment.userId !== currentUserId) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.provider !== 'wechat') {
      return payment;
    }

    const outTradeNo = requiredString(payment.outTradeNo, payment.id);
    const query = await this.queryWechatTransaction(outTradeNo);
    return this.store.mutate((db) => {
      const current = db.payments.find((item) => item.id === id);
      if (!current || current.userId !== currentUserId) {
        throw new NotFoundException('Payment not found');
      }
      return this.applyWechatTransactionSnapshot(current, query, now());
    });
  }

  async createRefund(input: CreateRefundPaymentInput) {
    const refundRequestId = requiredString(input.refundRequestId);
    const orderId = requiredString(input.orderId);
    const userId = requiredString(input.userId);
    const amount = Math.max(1, requiredNumber(input.amount, 0));
    const timestamp = now();
    const snapshot = await this.store.read();
    const existing = snapshot.payments.find((item) => item.kind === 'refund' && item.refundRequestId === refundRequestId);
    if (existing) {
      return existing;
    }

    const sourcePaymentId = requiredString(input.paymentId);
    const sourcePayment = sourcePaymentId
      ? snapshot.payments.find((item) => item.id === sourcePaymentId && item.kind !== 'refund') || null
      : null;
    if (sourcePayment && sourcePayment.userId !== userId) {
      throw new ForbiddenException('Only the order owner can refund through this payment');
    }

    if (sourcePayment?.provider === 'wechat') {
      return this.createWechatRefundPayment({
        sourcePayment,
        refundRequestId,
        orderId,
        userId,
        amount,
        reason: requiredString(input.reason, '蛋糕订单退款'),
        timestamp,
      });
    }

    return this.store.mutate((db) => {
      const currentExisting = db.payments.find((item) => item.kind === 'refund' && item.refundRequestId === refundRequestId);
      if (currentExisting) {
        return currentExisting;
      }
      const refundPayment: Payment = {
        id: createId('refund_pay'),
        quoteId: sourcePayment ? sourcePayment.quoteId : `refund:${orderId}`,
        userId,
        amount,
        provider: sourcePayment ? sourcePayment.provider : 'mock',
        status: 'refunded',
        kind: 'refund',
        orderId,
        refundRequestId,
        payParams: {},
        createdAt: timestamp,
        paidAt: sourcePayment ? sourcePayment.paidAt : undefined,
        refundedAt: timestamp,
      };
      db.payments.push(refundPayment);
      return refundPayment;
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
        const payment = db.payments.find((item) => requiredString(item.outTradeNo, item.id) === outTradeNo);
        if (!payment) {
          return null;
        }
        this.applyWechatTransactionSnapshot(payment, resource, now(), envelope.id);
        return payment;
      });
      return { code: 'SUCCESS', message: '成功' };
    }

    if (requiredString(envelope.event_type).indexOf('REFUND.') === 0) {
      const resource = JSON.parse(plainText || '{}') as WechatPayRefundResource;
      const refundPaymentId = requiredString(resource.out_refund_no);
      if (refundPaymentId) {
        await this.store.mutate((db) => {
          const payment = db.payments.find((item) => item.id === refundPaymentId || item.providerRefundId === resource.refund_id);
          if (!payment) {
            return null;
          }
          this.applyWechatRefundSnapshot(payment, resource, now(), envelope.id);
          this.syncRefundRequestFromPayment(db, payment, now(), this.normalizeWechatRefundStatus(resource.refund_status));
          return payment;
        });
      }
      return { code: 'SUCCESS', message: '成功' };
    }

    return { code: 'SUCCESS', message: 'ignored' };
  }

  async mockPaid(id: string, userId?: string) {
    const currentUserId = requiredString(userId);
    if (this.isProduction()) {
      throw new BadRequestException('Mock payment completion is disabled in production');
    }

    return this.store.mutate((db) => {
      const payment = db.payments.find((item) => item.id === id);
      if (!payment || payment.userId !== currentUserId) {
        throw new NotFoundException('Payment not found');
      }
      payment.status = 'paid';
      payment.paidAt = now();
      return payment;
    });
  }

  private paymentProvider(): Payment['provider'] {
    if (process.env.PAY_PROVIDER === 'wechat') {
      const problems = listWechatPayConfigProblems();
      if (problems.length) {
        throw new BadRequestException(`WeChat Pay config incomplete: ${problems.join(', ')}`);
      }
      return 'wechat';
    }

    if (this.isProduction()) {
      throw new BadRequestException('Mock payment creation is disabled in production');
    }

    return 'mock';
  }

  private isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  }

  private createMockPayParams(paymentId: string, amount: number) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = randomBytes(12).toString('hex');
    const appId = process.env.WECHAT_APP_ID || 'wx_mock_app_id';
    const mchId = process.env.WECHAT_MCH_ID || 'mock_mch_id';
    const pkg = `prepay_id=mock_${paymentId}`;
    const signSeed = [appId, mchId, paymentId, amount, timeStamp, nonceStr].join('|');

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

  private async createWechatPayment(context: Awaited<ReturnType<PaymentsService['prepareCreateContext']>>) {
    if (!context.order) {
      throw new BadRequestException('Order must exist before WeChat Pay can be created');
    }
    if (!context.user.openId) {
      throw new BadRequestException('当前账号还没有微信 openId，请先重新完成微信登录后再发起支付');
    }

    const config = getWechatPayConfig();
    if (!config) {
      throw new BadRequestException('WeChat Pay config incomplete');
    }

    const description = this.describePayment(context);
    const transaction = await this.createWechatJsapiTransaction({
      config,
      outTradeNo: context.paymentId,
      amountFen: this.amountToFen(context.amount),
      description,
      openId: context.user.openId,
    });

    return this.store.mutate((db) => {
      const existing = db.payments.find((item) => item.quoteId === context.quote.id && item.status === 'pending');
      if (existing) {
        return existing;
      }
      const payment: Payment = {
        id: context.paymentId,
        quoteId: context.quote.id,
        userId: context.userId,
        amount: context.amount,
        provider: 'wechat',
        status: 'pending',
        orderId: context.order?.id,
        outTradeNo: context.paymentId,
        prepayId: transaction.prepayId,
        tradeState: 'NOTPAY',
        tradeStateDesc: '等待用户完成微信支付',
        lastSyncedAt: context.timestamp,
        payParams: transaction.payParams,
        createdAt: context.timestamp,
      };
      db.payments.push(payment);
      return payment;
    });
  }

  private async createWechatRefundPayment(input: {
    sourcePayment: Payment;
    refundRequestId: string;
    orderId: string;
    userId: string;
    amount: number;
    reason: string;
    timestamp: string;
  }) {
    if (input.sourcePayment.status !== 'paid') {
      throw new BadRequestException('Only paid WeChat payments can be refunded');
    }

    const config = getWechatPayConfig();
    if (!config) {
      throw new BadRequestException('WeChat Pay config incomplete');
    }

    const refundPaymentId = createId('refund_pay');
    const refundAmountFen = this.amountToFen(input.amount);
    const totalAmountFen = this.amountToFen(input.sourcePayment.amount);
    if (refundAmountFen > totalAmountFen) {
      throw new BadRequestException('Refund amount cannot exceed the original paid amount');
    }

    const transactionId = requiredString(input.sourcePayment.transactionId);
    const response = await this.requestWechatPay<WechatPayRefundResponse>({
      method: 'POST',
      path: '/v3/refund/domestic/refunds',
      body: {
        out_refund_no: refundPaymentId,
        transaction_id: transactionId || undefined,
        out_trade_no: transactionId ? undefined : requiredString(input.sourcePayment.outTradeNo, input.sourcePayment.id),
        notify_url: config.notifyUrl,
        reason: input.reason.slice(0, 80),
        amount: {
          refund: refundAmountFen,
          total: totalAmountFen,
          currency: 'CNY',
        },
      },
      config,
    });

    const refundStatus = this.normalizeWechatRefundStatus(response.status);
    return this.store.mutate((db) => {
      const currentExisting = db.payments.find((item) => item.kind === 'refund' && item.refundRequestId === input.refundRequestId);
      if (currentExisting) {
        return currentExisting;
      }
      const refundPayment: Payment = {
        id: refundPaymentId,
        quoteId: input.sourcePayment.quoteId,
        userId: input.userId,
        amount: input.amount,
        provider: 'wechat',
        status: this.paymentStatusFromWechatRefundStatus(refundStatus),
        kind: 'refund',
        orderId: input.orderId,
        refundRequestId: input.refundRequestId,
        providerRefundId: requiredString(response.refund_id),
        payParams: {},
        createdAt: input.timestamp,
        paidAt: input.sourcePayment.paidAt,
        refundedAt: refundStatus === 'SUCCESS' ? requiredString(response.success_time, input.timestamp) : undefined,
        lastSyncedAt: input.timestamp,
      };
      db.payments.push(refundPayment);
      return refundPayment;
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
        notify_url: input.config.notifyUrl,
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

  private async prepareCreateContext(input: CreatePaymentInput) {
    const quoteId = requiredString(input.quoteId);
    const userId = requiredString(input.userId, 'demo-user');
    const timestamp = now();
    const db = await this.store.read();
    const quote = db.quotes.find((item) => item.id === quoteId);
    if (!quote) {
      throw new NotFoundException('Quote not found');
    }
    const demand = db.demands.find((item) => item.id === quote.demandId);
    if (!demand) {
      throw new NotFoundException('Demand not found');
    }
    if (quote.status !== 'selected') {
      throw new BadRequestException('Quote must be selected before payment');
    }
    if (demand.userId !== userId) {
      throw new ForbiddenException('Only the demand owner can create payment for the selected quote');
    }
    const user = db.users.find((item) => item.id === userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const order = input.orderId
      ? db.orders.find((item) => item.id === input.orderId && item.userId === userId)
      : db.orders.find((item) => item.quoteId === quote.id && item.userId === userId);
    const existing = db.payments
      .filter((item) => item.quoteId === quoteId && item.kind !== 'refund' && item.userId === userId && item.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      paymentId: createId('pay'),
      user,
      userId,
      quote,
      demand,
      order: order || null,
      existing: existing || null,
      amount: quote.amount + quote.deliveryFee,
      timestamp,
    };
  }

  private applyWechatTransactionSnapshot(
    payment: Payment,
    snapshot: WechatPayTransactionQueryResponse,
    timestamp: string,
    notifyId?: string,
  ) {
    payment.transactionId = requiredString(snapshot.transaction_id, payment.transactionId);
    payment.tradeState = requiredString(snapshot.trade_state, payment.tradeState);
    payment.tradeStateDesc = requiredString(snapshot.trade_state_desc, payment.tradeStateDesc);
    payment.lastSyncedAt = timestamp;
    payment.notifyId = requiredString(notifyId, payment.notifyId);
    const tradeState = requiredString(snapshot.trade_state);
    if (tradeState === 'SUCCESS') {
      payment.status = 'paid';
      payment.paidAt = requiredString(snapshot.success_time, payment.paidAt || timestamp);
      return payment;
    }
    if (tradeState === 'REFUND') {
      payment.status = 'refunded';
      payment.refundedAt = requiredString(snapshot.success_time, payment.refundedAt || timestamp);
      return payment;
    }
    if (['CLOSED', 'PAYERROR', 'REVOKED'].includes(tradeState)) {
      payment.status = 'failed';
      return payment;
    }
    payment.status = 'pending';
    return payment;
  }

  private applyWechatRefundSnapshot(
    payment: Payment,
    snapshot: WechatPayRefundResource,
    timestamp: string,
    notifyId?: string,
  ) {
    const refundStatus = this.normalizeWechatRefundStatus(snapshot.refund_status);
    payment.providerRefundId = requiredString(snapshot.refund_id, payment.providerRefundId);
    payment.lastSyncedAt = timestamp;
    payment.notifyId = requiredString(notifyId, payment.notifyId);
    payment.status = this.paymentStatusFromWechatRefundStatus(refundStatus);
    if (refundStatus === 'SUCCESS') {
      payment.refundedAt = requiredString(snapshot.success_time, payment.refundedAt || timestamp);
    }
    return payment;
  }

  private paymentStatusFromWechatRefundStatus(status: string): Payment['status'] {
    if (status === 'SUCCESS') return 'refunded';
    if (status === 'CLOSED' || status === 'ABNORMAL') return 'failed';
    return 'pending';
  }

  private normalizeWechatRefundStatus(status?: string) {
    if (status === 'SUCCESS' || status === 'CLOSED' || status === 'ABNORMAL' || status === 'PROCESSING') {
      return status;
    }
    return 'PROCESSING';
  }

  private syncRefundRequestFromPayment(
    db: Awaited<ReturnType<StoreService['read']>>,
    payment: Payment,
    timestamp: string,
    refundStatus = 'PROCESSING',
  ) {
    if (payment.kind !== 'refund' || !payment.refundRequestId) {
      return;
    }
    const refund = db.refundRequests.find((item) => item.id === payment.refundRequestId);
    if (!refund) {
      return;
    }
    refund.refundPaymentId = payment.id;
    refund.updatedAt = timestamp;

    const supportTicket = db.supportTickets.find((item) => item.id === refund.supportTicketId);
    if (payment.status === 'refunded') {
      refund.status = 'refunded';
      refund.approvedAmount = refund.approvedAmount || payment.amount;
      refund.platformNote = '';
      if (supportTicket) {
        supportTicket.status = 'resolved';
        supportTicket.handlerNote = '商家已同意退款，微信支付已确认退款。';
        supportTicket.updatedAt = timestamp;
      }
      return;
    }

    refund.status = 'refund_processing';
    refund.platformNote =
      refundStatus === 'PROCESSING'
        ? '商家已同意退款，微信支付处理中。'
        : `商家已同意退款，但微信退款状态为 ${refundStatus}，需要平台继续跟进。`;
    if (supportTicket) {
      supportTicket.status = 'processing';
      supportTicket.handlerNote = refund.platformNote;
      supportTicket.updatedAt = timestamp;
    }
  }

  private amountToFen(amount: number) {
    return Math.max(1, Math.round(Number(amount || 0) * 100));
  }

  private describePayment(context: {
    demand: { title: string; city: string };
  }) {
    const title = requiredString(context.demand.title, '蛋糕订单').slice(0, 32);
    const city = requiredString(context.demand.city, '长治');
    return `如意鲜果蛋糕 ${city} ${title}`.slice(0, 64);
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
