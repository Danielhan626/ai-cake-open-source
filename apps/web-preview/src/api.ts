import { AdminLoginSession, AdminOverview, AdminProfile, Baker, CakeWork, Demand, MerchantWorkbench, Order, Payment, Quote, RefundRequest, ReviewQueue, RewardReview, SupportTicket } from './types';

const API_BASE = resolveApiBase();
let adminToken = '';
let authToken = '';
let userToken = '';
let bakerToken = '';

export function clearAdminSession() {
  adminToken = '';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isAdmin = path.startsWith('/admin/');
  const token = isAdmin ? adminToken : authToken;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface GenerateInput {
  prompt: string;
  scenario: string;
  style: string;
  color: string;
  size: string;
  budget: string;
}

export const api = {
  async devLogin(userId = 'demo-user') {
    const session = await request<{ user: { id: string }; token: string }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        nickname: userId === 'demo-baker-user' ? '甜野蛋糕工作室' : '体验玩家',
        city: '长治',
      }),
    });
    authToken = session.token;
    if (userId === 'demo-baker-user') {
      bakerToken = session.token;
    } else {
      userToken = session.token;
    }
    return session;
  },

  usePlayerSession() {
    authToken = userToken;
  },

  useBakerSession() {
    authToken = bakerToken || userToken;
  },

  generateWork(input: GenerateInput) {
    return request<{ work: CakeWork }>('/works/generate', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'demo-user',
        title: `${input.scenario} · ${input.style}`,
        ...input,
      }),
    });
  },

  refineWork(workId: string, refinement: string) {
    return request<{ work: CakeWork; sourceWorkId: string }>(`/works/${workId}/refine`, {
      method: 'POST',
      body: JSON.stringify({
        userId: 'demo-user',
        refinement,
      }),
    });
  },

  listWorks() {
    return request<CakeWork[]>('/works');
  },

  publishDemand(work: CakeWork) {
    return request<Demand>('/demands', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'demo-user',
        workId: work.id,
        title: `制作：${work.title}`,
        description: `希望尽量还原「${work.prompt}」，可以接受蛋糕师根据真实制作调整。`,
        city: '长治',
        district: '潞州区',
        expectedDate: nextWeek(),
        budget: work.budget,
        servings: work.size === '8寸' ? '8-10人' : '4-6人',
        deliveryMethod: '配送或自提均可',
        allowAdjustments: true,
        contact: 'wechat_demo_user',
      }),
    });
  },

  listDemands() {
    return request<Demand[]>('/demands?city=长治');
  },

  listBakers() {
    return request<Baker[]>('/bakers?city=长治');
  },

  createQuote(demandId: string, bakerId = 'demo-baker') {
    return request<Quote>('/quotes', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'demo-baker-user',
        demandId,
        bakerId,
        amount: 328,
        deliveryFee: 20,
        productionDays: 2,
        adjustmentNote: '可尽量还原图片，蝴蝶结和奶油花边会用可食用材料调整。',
        message: '这款可以做，建议提前两天确认口味、祝福语和配送时间。',
      }),
    });
  },

  selectQuote(quoteId: string) {
    return request<Quote>(`/quotes/${quoteId}/select`, {
      method: 'PATCH',
      body: JSON.stringify({
        userId: 'demo-user',
      }),
    });
  },

  createPayment(quoteId: string) {
    return request<Payment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'demo-user',
        quoteId,
      }),
    });
  },

  mockPaid(paymentId: string) {
    return request<Payment>(`/payments/${paymentId}/mock-paid`, {
      method: 'PATCH',
    });
  },

  listOrders(userId = 'demo-user') {
    return request<Order[]>(`/orders?userId=${encodeURIComponent(userId)}`);
  },

  updateFulfillment(orderId: string, status: string, note = '') {
    return request<Order>(`/orders/${orderId}/fulfillment`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        note,
        operator: 'local-admin',
      }),
    });
  },

  merchantWorkbench(bakerId = 'demo-baker') {
    return request<MerchantWorkbench>(`/admin/merchant-workbench?bakerId=${encodeURIComponent(bakerId)}`);
  },

  async openAdminUpload(uploadId: string) {
    const response = await fetch(`${API_BASE}/admin/uploads/${encodeURIComponent(uploadId)}/content`, {
      headers: {
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || '打开资质失败');
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const popup = typeof window !== 'undefined' ? window.open(objectUrl, '_blank', 'noopener,noreferrer') : null;
    if (!popup && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },

  createMerchantQuote(demandId: string, bakerId = 'demo-baker') {
    return request<Quote>('/admin/merchant-quotes', {
      method: 'POST',
      body: JSON.stringify({
        demandId,
        bakerId,
        amount: 328,
        deliveryFee: 20,
        availableDate: nextQuoteDate(),
        productionDays: 2,
        decision: 'with_adjustments',
        adjustmentNote: '商家后台报价：可尽量还原主体创意，鲜果和装饰按当天材料调整。',
        message: '可以承接，建议提前确认口味、祝福牌和配送时间。',
        operator: 'local-admin',
      }),
    });
  },

  updateRefundMediation(refundId: string, platformNote = '平台已记录双方协商进展，继续跟进凭证和处理方案。') {
    return request<RefundRequest>(`/admin/refunds/${refundId}/mediation`, {
      method: 'PATCH',
      body: JSON.stringify({
        platformNote,
        supportStatus: 'processing',
        operator: 'local-admin',
      }),
    });
  },

  async adminLogin(username: string, password: string) {
    const session = await request<AdminLoginSession>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
      }),
    });
    adminToken = session.token;
    return session;
  },

  adminMe() {
    return request<AdminProfile>('/admin/me');
  },

  adminOverview() {
    return request<AdminOverview>('/admin/overview');
  },

  reviewQueue() {
    return request<ReviewQueue>('/admin/review-queue');
  },

  reviewWork(id: string, status: 'approved' | 'rejected', note = '') {
    return request<CakeWork>(`/admin/works/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, operator: 'local-admin' }),
    });
  },

  reviewDemand(id: string, status: 'approved' | 'rejected', note = '') {
    return request<Demand>(`/admin/demands/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, operator: 'local-admin' }),
    });
  },

  reviewBaker(id: string, status: 'approved' | 'rejected', note = '') {
    return request<Baker>(`/admin/bakers/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, operator: 'local-admin' }),
    });
  },

  updateSupport(id: string, status: 'processing' | 'resolved' | 'rejected', note = '') {
    return request<SupportTicket>(`/admin/support-tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, operator: 'local-admin' }),
    });
  },

  updateReward(id: string, status: 'approved' | 'rejected' | 'paid', note = '') {
    return request<RewardReview>(`/admin/reward-reviews/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, operator: 'local-admin' }),
    });
  },
};

function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function nextQuoteDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function resolveApiBase() {
  const envBase = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}`.trim() : '';
  if (envBase) {
    return envBase.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:4000';
  }

  const { hostname, origin, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:4000`;
  }

  return origin;
}
