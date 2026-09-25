export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type DemandStatus = 'draft' | 'reviewing' | 'quoting' | 'selected' | 'closed';
export type QuoteStatus = 'active' | 'selected' | 'cancelled';
export type ProductionCommunicationLevel = 'standard' | 'discuss' | 'challenge' | 'concept';
export type QuoteDecision = 'as_designed' | 'with_adjustments' | 'decline';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type RefundStatus = 'pending_baker' | 'refund_processing' | 'refunded' | 'platform_mediating' | 'rejected' | 'cancelled';
export type RefundDecision = 'agree' | 'reject';
export type PaymentKind = 'payment' | 'refund';
export type CreationCreditLedgerSource =
  | 'check_in'
  | 'recharge'
  | 'generate_deduct'
  | 'generate_refund'
  | 'refine_deduct'
  | 'refine_refund'
  | 'admin_adjust';
export type CreationRechargeStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type SupportTicketStatus = 'pending' | 'processing' | 'resolved' | 'rejected';
export type RewardStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type DesignTaskStatus = 'candidate' | 'active' | 'archived';
export type DesignTaskSource = 'seed' | 'mock' | 'doubao' | 'deepseek' | 'manual';
export type OrderStatus =
  | 'intent_confirmed'
  | 'merchant_confirmed'
  | 'producing'
  | 'delivering'
  | 'completed'
  | 'disputed';
export type FulfillmentStatus =
  | 'created'
  | 'baker_confirmed'
  | 'producing'
  | 'ready'
  | 'delivering_or_pickup'
  | 'completed'
  | 'disputed';

export interface User {
  id: string;
  openId?: string;
  unionId?: string;
  nickname: string;
  avatarUrl?: string;
  city?: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserSession {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export type AdminRole = 'owner' | 'operator' | 'support' | 'finance';

export interface AdminAccount {
  id: string;
  username: string;
  displayName: string;
  roles: AdminRole[];
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt?: string;
}

export interface AdminSession {
  token: string;
  adminId: string;
  createdAt: string;
  expiresAt: string;
}

export interface CakeWork {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  imageUrl: string;
  scenario: string;
  style: string;
  color: string;
  size: string;
  budget: string;
  visibility: 'private' | 'public';
  reviewStatus: ReviewStatus;
  createdAt: string;
  voteCount?: number;
  roseCount?: number;
  userInteraction?: {
    voted: boolean;
    roseSent: boolean;
  };
}

export interface Demand {
  id: string;
  userId: string;
  workId: string;
  title: string;
  description: string;
  city: string;
  district: string;
  expectedDate: string;
  budget: string;
  servings: string;
  deliveryMethod: string;
  allowAdjustments: boolean;
  deliveryWindow?: string;
  cakeSize?: string;
  flavor?: string;
  recipientNote?: string;
  productionNoticeAccepted?: boolean;
  productionLevel?: ProductionCommunicationLevel;
  mustKeep?: string;
  canAdjust?: string;
  contact: string;
  status: DemandStatus;
  reviewStatus: ReviewStatus;
  createdAt: string;
}

export interface Baker {
  id: string;
  userId: string;
  source?: 'seed' | 'user';
  name: string;
  avatarUrl?: string;
  city: string;
  district: string;
  deliveryRadiusKm: number;
  specialties: string[];
  startingPrice: number;
  contact: string;
  bio: string;
  portfolio: string[];
  healthCertificateUrl: string;
  businessLicenseUrl: string;
  foodPermitUrl?: string;
  auditNote?: string;
  reviewStatus: ReviewStatus;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  orderId?: string;
  userId: string;
  type: string;
  contact: string;
  description: string;
  evidenceNote: string;
  status: SupportTicketStatus;
  handlerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RewardReview {
  id: string;
  userId: string;
  workId?: string;
  amount: number;
  reason: string;
  status: RewardStatus;
  auditNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignTask {
  id: string;
  templateId?: string;
  campaignId?: string;
  legacyIds?: string[];
  title: string;
  theme: string;
  prompt: string;
  scenario: string;
  style: string;
  color: string;
  rewardAmount: number;
  validFrom: string;
  validTo: string;
  tags: string[];
  botLine: string;
  marketingNodeId?: string;
  marketingTitle?: string;
  source: DesignTaskSource;
  status: DesignTaskStatus;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignTaskCompletion {
  id: string;
  taskId: string;
  userId: string;
  workId: string;
  rewardReviewId: string;
  rewardAmount: number;
  status: RewardStatus;
  createdAt: string;
}

export interface DesignTaskJoin {
  id: string;
  taskId: string;
  userId: string;
  createdAt: string;
}

export interface InteractionRecord {
  id: string;
  userId: string;
  targetType: 'work' | 'review';
  targetId: string;
  action: 'vote' | 'rose' | 'like';
  createdAt: string;
}

export interface UserWallet {
  userId: string;
  roseBalance: number;
  score: number;
  rewardPending: number;
  rewardApproved: number;
  creationCreditBalance: number;
  updatedAt: string;
}

export interface CheckInRecord {
  id: string;
  userId: string;
  dateKey: string;
  roseDelta: number;
  creationCreditDelta: number;
  createdAt: string;
}

export interface CreationCreditLedger {
  id: string;
  userId: string;
  delta: number;
  balanceAfter: number;
  source: CreationCreditLedgerSource;
  refId?: string;
  reason?: string;
  createdAt: string;
}

export interface CreationRechargeProduct {
  id: string;
  title: string;
  amount: number;
  credits: number;
  description: string;
}

export interface CreationRechargeOrder {
  id: string;
  userId: string;
  productId: string;
  credits: number;
  amount: number;
  provider: 'mock' | 'wechat';
  status: CreationRechargeStatus;
  outTradeNo?: string;
  prepayId?: string;
  transactionId?: string;
  tradeState?: string;
  tradeStateDesc?: string;
  notifyId?: string;
  payParams: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  refundedAt?: string;
  lastSyncedAt?: string;
}

export interface DailyGenerationQuota {
  id: string;
  userId: string;
  dateKey: string;
  freeGenerationUsed: boolean;
  usedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRecord {
  id: string;
  userId: string;
  kind: 'healthCertificate' | 'businessLicense' | 'foodPermit' | 'portfolio' | 'supportEvidence' | 'other';
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  targetType: 'work' | 'demand' | 'baker' | 'support' | 'reward' | 'upload' | 'designTask' | 'order' | 'fulfillment';
  targetId: string;
  action: string;
  operator: string;
  note?: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  demandId: string;
  bakerId: string;
  amount: number;
  deliveryFee: number;
  availableDate: string;
  productionDays: number;
  decision?: QuoteDecision;
  restorationLevel?: string;
  deliveryWindow?: string;
  scheduledDeliverySupported?: boolean;
  changeDeadline?: string;
  cancelPolicy?: string;
  signoffNote?: string;
  adjustmentNote: string;
  message: string;
  status: QuoteStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  quoteId: string;
  userId: string;
  amount: number;
  provider: 'mock' | 'wechat';
  status: PaymentStatus;
  kind?: PaymentKind;
  orderId?: string;
  refundRequestId?: string;
  outTradeNo?: string;
  prepayId?: string;
  transactionId?: string;
  tradeState?: string;
  tradeStateDesc?: string;
  notifyId?: string;
  providerRefundId?: string;
  lastSyncedAt?: string;
  payParams: Record<string, string>;
  createdAt: string;
  paidAt?: string;
  refundedAt?: string;
}

export interface Order {
  id: string;
  userId: string;
  workId: string;
  demandId: string;
  quoteId: string;
  bakerId: string;
  amount: number;
  status: OrderStatus;
  city: string;
  district: string;
  deliveryMethod: string;
  expectedDate: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
}

export interface Fulfillment {
  id: string;
  orderId: string;
  status: FulfillmentStatus;
  deliveryMethod: string;
  courierName?: string;
  courierPhone?: string;
  eta?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  userId: string;
  bakerId: string;
  paymentId?: string;
  refundPaymentId?: string;
  supportTicketId: string;
  reason: string;
  description: string;
  evidenceImages: string[];
  evidenceNote: string;
  requestedAmount: number;
  approvedAmount?: number;
  contact: string;
  status: RefundStatus;
  bakerDecision?: RefundDecision;
  bakerNote?: string;
  platformNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  users: User[];
  sessions: UserSession[];
  adminAccounts: AdminAccount[];
  adminSessions: AdminSession[];
  works: CakeWork[];
  demands: Demand[];
  bakers: Baker[];
  quotes: Quote[];
  payments: Payment[];
  orders: Order[];
  fulfillments: Fulfillment[];
  refundRequests: RefundRequest[];
  supportTickets: SupportTicket[];
  rewardReviews: RewardReview[];
  designTasks: DesignTask[];
  designTaskJoins: DesignTaskJoin[];
  designTaskCompletions: DesignTaskCompletion[];
  interactions: InteractionRecord[];
  wallets: UserWallet[];
  checkIns: CheckInRecord[];
  creationCreditLedgers: CreationCreditLedger[];
  creationRechargeOrders: CreationRechargeOrder[];
  dailyGenerationQuotas: DailyGenerationQuota[];
  uploads: UploadRecord[];
  auditLogs: AuditLog[];
}
