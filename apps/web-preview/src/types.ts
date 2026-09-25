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
  reviewStatus: string;
  createdAt: string;
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
  productionLevel?: string;
  mustKeep?: string;
  canAdjust?: string;
  contact: string;
  status: string;
  reviewStatus: string;
  createdAt: string;
  work?: CakeWork | null;
  quoteCount?: number;
}

export interface Baker {
  id: string;
  userId?: string;
  name: string;
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
  reviewStatus?: string;
  createdAt?: string;
  credentialFiles?: CredentialFile[];
}

export interface CredentialFile {
  kind: 'healthCertificate' | 'businessLicense' | 'foodPermit';
  label: string;
  sourceUrl: string;
  available: boolean;
  uploadId?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  directUrl?: string;
  uploadedAt?: string;
}

export interface Quote {
  id: string;
  demandId: string;
  bakerId: string;
  amount: number;
  deliveryFee: number;
  availableDate: string;
  productionDays: number;
  adjustmentNote: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  baker?: Baker | null;
  demand?: Demand | null;
}

export interface Payment {
  id: string;
  quoteId: string;
  userId: string;
  amount: number;
  provider: 'mock' | 'wechat' | 'intent';
  status: string;
  payParams: Record<string, string>;
  createdAt: string;
  paidAt?: string;
}

export interface Fulfillment {
  id: string;
  orderId: string;
  status: string;
  deliveryMethod: string;
  courierName?: string;
  courierPhone?: string;
  eta?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  workId: string;
  demandId: string;
  quoteId: string;
  bakerId: string;
  amount: number;
  totalText?: string;
  status: string;
  statusText?: string;
  city: string;
  district: string;
  deliveryMethod: string;
  expectedDate: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  work?: CakeWork | null;
  demand?: Demand | null;
  quote?: Quote | null;
  baker?: Baker | null;
  fulfillment?: Fulfillment | null;
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
  status: string;
  statusText?: string;
  bakerDecision?: string;
  bakerNote?: string;
  platformNote?: string;
  createdAt: string;
  updatedAt: string;
  order?: Order | null;
  baker?: Baker | null;
  refundPayment?: Payment | null;
  supportTicket?: SupportTicket | null;
}

export interface MerchantWorkbench {
  bakerId: string | null;
  pendingQuoteDemands: Array<Demand & {
    quotes?: Quote[];
    quoteCount?: number;
  }>;
  fulfillmentOrders: Order[];
  refundNegotiations: RefundRequest[];
}

export interface SupportTicket {
  id: string;
  orderId?: string;
  userId: string;
  type: string;
  contact: string;
  description: string;
  evidenceNote: string;
  status: string;
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
  status: string;
  auditNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  operator: string;
  note?: string;
  createdAt: string;
}

export interface AdminOverview {
  counts: Record<string, number>;
  pending: Record<string, number>;
  latestAuditLogs: AuditLog[];
}

export interface AdminProfile {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  status: string;
}

export interface AdminLoginSession {
  admin: AdminProfile;
  token: string;
}

export interface ReviewQueue {
  works: CakeWork[];
  demands: Demand[];
  bakers: Baker[];
  supportTickets: SupportTicket[];
  rewardReviews: RewardReview[];
}
