const config = require('./config/index');
const { getSupportedCities } = require('./utils/city');
const { botReviewSeats } = require('./utils/bot-reviews');

const tabPageUrls = ['/pages/home/home', '/pages/works/works', '/pages/bakers/bakers', '/pages/mine/mine'];
const visitorStorageKey = 'aicakeVisitorId';
const authSessionStorageKey = 'aicakeAuthSession';

function canUseStorage() {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function' && typeof wx.setStorageSync === 'function';
}

function normalizePageUrl(route) {
  if (!route) return '';
  return route.indexOf('/') === 0 ? route : `/${route}`;
}

function pageToUrl(page) {
  if (!page || !page.route) return '';
  const route = normalizePageUrl(page.route);
  const options = page.options || {};
  const query = Object.keys(options)
    .filter((key) => options[key] !== undefined && options[key] !== null && options[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`)
    .join('&');
  return query ? `${route}?${query}` : route;
}

function loadOrCreateVisitorId() {
  if (!canUseStorage()) {
    return `guest_${Date.now()}`;
  }

  const existing = wx.getStorageSync(visitorStorageKey);
  if (existing) return existing;

  const visitorId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  wx.setStorageSync(visitorStorageKey, visitorId);
  return visitorId;
}

function loadStoredAuthSession() {
  if (!canUseStorage()) return null;
  const stored = wx.getStorageSync(authSessionStorageKey);
  if (!stored || typeof stored !== 'object') return null;
  if (!stored.user || !stored.user.id || !stored.token) return null;
  return {
    user: stored.user,
    token: stored.token
  };
}

function bakerVerifyStatus(reviewStatus) {
  if (reviewStatus === 'approved') return '已审核';
  if (reviewStatus === 'rejected') return '审核未通过';
  if (reviewStatus === 'pending') return '待平台审核';
  return '未提交';
}

function runtimePaymentMode(health) {
  if (health && health.paymentProvider === 'wechat' && health.wechatPayConfigured === true) {
    return 'wechat';
  }
  return config.paymentMode;
}

App({
  globalData: {
    productName: config.productName,
    productShortName: config.productShortName,
    apiBase: config.apiBase,
    reviewSafeMode: config.reviewSafeMode,
    paymentMode: config.paymentMode,
    locationMode: config.locationMode,
    supportedCities: getSupportedCities(),
    city: config.pilotCity,
    district: config.pilotDistrict,
    orderCity: config.pilotCity,
    orderDistrict: config.pilotDistrict,
    location: {
      city: config.pilotCity,
      district: config.pilotDistrict,
      source: config.enableAutoLocation ? '定位待确认，可手动选择' : '平台服务城市',
      latitude: null,
      longitude: null
    },
    autoLocationAttempted: false,
    accountRole: 'player',
    userId: '',
    authToken: '',
    currentUser: null,
    focusMineAuth: false,
    pendingLoginReturn: null,
    pendingAuthDrafts: {},
    pendingChallenge: null,
    currentDemandEntry: '',
    currentDesignGame: null,
    currentDemandDraft: null,
    currentDemand: null,
    currentQuote: null,
    currentPayment: null,
    userScore: 0,
    rewardWallet: {
      pending: 0,
      approved: 0
    },
    roseBalance: 0,
    creationCreditBalance: 0,
    creationRechargeProducts: [],
    creationRefineCost: 5,
    dailyFreeGenerationRemaining: 1,
    lastCheckInDate: '',
    completedTaskCount: 0,
    workVoteState: {},
    workRoseState: {},
    reviewLikeState: {},
    currentOrder: null,
    supportTickets: [],
    onboardingApplication: null,
    deliveryProfile: null,
    playerProfile: {
      nickname: '创作用户',
      level: '创作与下单用户',
      score: 0,
      worksCount: 0,
      adoptedCount: 0,
      voteCount: 0,
      badges: []
    },
    bakerId: '',
    bakerProfile: {
      userId: '',
      name: '待入驻蛋糕店',
      roleName: '蛋糕师傅端',
      verifyStatus: '未提交',
      healthCertStatus: '待提交',
      licenseStatus: '待提交',
      serviceRange: '待设置',
      deliveryMethods: '待设置',
      quoteCount: 0,
      orderCount: 0,
      responseRate: '待统计',
      specialties: []
    },
    platformStats: {
      activeCity: '长治服务城市',
      todayTasks: 3,
      availableBakers: 2,
      openDemands: 4
    },
    aiReviewBots: botReviewSeats
  },

  freshPlayerProfile() {
    return {
      nickname: '创作用户',
      level: '创作与下单用户',
      score: 0,
      worksCount: 0,
      adoptedCount: 0,
      voteCount: 0,
      badges: []
    };
  },

  resetCommercialSessionState() {
    this.globalData.userScore = 0;
    this.globalData.rewardWallet = {
      pending: 0,
      approved: 0
    };
    this.globalData.roseBalance = 0;
    this.globalData.creationCreditBalance = 0;
    this.globalData.creationRechargeProducts = [];
    this.globalData.creationRefineCost = 5;
    this.globalData.dailyFreeGenerationRemaining = 1;
    this.globalData.lastCheckInDate = '';
    this.globalData.completedTaskCount = 0;
    this.globalData.currentDemand = null;
    this.globalData.currentDemandEntry = '';
    this.globalData.currentQuote = null;
    this.globalData.currentPayment = null;
    this.globalData.currentOrder = null;
    this.globalData.supportTickets = [];
    this.globalData.onboardingApplication = null;
    this.globalData.deliveryProfile = null;
    this.globalData.playerProfile = this.freshPlayerProfile();
    if (typeof this.clearOwnedBakerProfile === 'function') {
      this.clearOwnedBakerProfile();
    }
  },

  onLaunch() {
    this.globalData.userId = loadOrCreateVisitorId();
    this.restoreAuthSession();
    this.refreshRuntimeConfig();
  },

  refreshRuntimeConfig() {
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
      return;
    }
    wx.request({
      url: `${this.globalData.apiBase}/health`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.data || typeof res.data !== 'object') {
          return;
        }
        const health = res.data;
        this.globalData.paymentMode = runtimePaymentMode(health);
        if (typeof health.locationMode === 'string' && health.locationMode) {
          this.globalData.locationMode = health.locationMode;
        }
      },
      fail: () => {}
    });
  },

  persistAuthSession(user, token) {
    if (!canUseStorage()) return;
    wx.setStorageSync(authSessionStorageKey, {
      user,
      token
    });
  },

  restoreAuthSession() {
    const stored = loadStoredAuthSession();
    if (!stored) {
      return;
    }
    this.globalData.currentUser = stored.user;
    this.globalData.authToken = stored.token;
    this.globalData.userId = stored.user.id;
  },

  setAuthenticatedSession(session) {
    if (!session || !session.user || !session.user.id || !session.token) {
      return;
    }
    const switchingUser =
      Boolean(this.globalData.currentUser && this.globalData.currentUser.id) &&
      this.globalData.currentUser.id !== session.user.id;
    if (switchingUser) {
      this.resetCommercialSessionState();
    }
    this.globalData.currentUser = session.user;
    this.globalData.authToken = session.token;
    this.globalData.userId = session.user.id;
    this.persistAuthSession(session.user, session.token);
  },

  clearAuthSession() {
    this.globalData.currentUser = null;
    this.globalData.authToken = '';
    this.globalData.userId = loadOrCreateVisitorId();
    this.resetCommercialSessionState();
    if (typeof wx !== 'undefined' && typeof wx.removeStorageSync === 'function') {
      wx.removeStorageSync(authSessionStorageKey);
    }
  },

  storeOwnedBakerProfile(baker) {
    if (!baker) return;
    const existing = this.globalData.bakerProfile || {};
    this.globalData.bakerId = baker.id || '';
    this.globalData.bakerProfile = Object.assign({}, existing, {
      userId: baker.userId || '',
      name: baker.name || existing.name || '待入驻蛋糕店',
      roleName: '蛋糕师傅端',
      city: baker.city || existing.city || this.globalData.city,
      district: baker.district || existing.district || this.globalData.district,
      reviewStatus: baker.reviewStatus || existing.reviewStatus || '',
      verifyStatus: bakerVerifyStatus(baker.reviewStatus),
      healthCertStatus: baker.healthCertificateUrl ? '已提交' : existing.healthCertStatus || '待提交',
      licenseStatus: baker.businessLicenseUrl ? '已提交' : existing.licenseStatus || '待提交',
      foodPermitStatus: baker.foodPermitUrl ? '已提交' : existing.foodPermitStatus || '待提交',
      serviceRange:
        typeof baker.deliveryRadiusKm === 'number' && baker.deliveryRadiusKm > 0
          ? `${baker.district || existing.district || ''} ${baker.deliveryRadiusKm}km`
          : existing.serviceRange || '待设置',
      startingPrice: typeof baker.startingPrice === 'number' ? baker.startingPrice : existing.startingPrice || 0,
      deliveryMethods: existing.deliveryMethods || '待设置',
      quoteCount: existing.quoteCount || 0,
      orderCount: existing.orderCount || 0,
      responseRate: existing.responseRate || '待统计',
      specialties: Array.isArray(baker.specialties) ? baker.specialties : existing.specialties || []
    });
  },

  clearOwnedBakerProfile() {
    this.globalData.bakerId = '';
    this.globalData.bakerProfile = Object.assign({}, this.globalData.bakerProfile || {}, {
      userId: '',
      name: '待入驻蛋糕店',
      reviewStatus: '',
      verifyStatus: '未提交',
      healthCertStatus: '待提交',
      licenseStatus: '待提交',
      foodPermitStatus: '待提交',
      serviceRange: '待设置',
      startingPrice: 0,
      deliveryMethods: '待设置',
      quoteCount: 0,
      orderCount: 0,
      responseRate: '待统计',
      specialties: []
    });
  },

  setPendingLoginReturn(options = {}) {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const currentUrl = options.url || pageToUrl(pages[pages.length - 1]);
    const shouldPreserveMineAuthReturn = Boolean(options.requirePhone || options.action);
    if (!currentUrl || (currentUrl.indexOf('/pages/mine/mine') === 0 && !shouldPreserveMineAuthReturn)) {
      this.globalData.focusMineAuth = true;
      return;
    }
    this.globalData.pendingLoginReturn = {
      url: currentUrl,
      action: options.action || '',
      requirePhone: Boolean(options.requirePhone),
      createdAt: Date.now()
    };
    this.globalData.focusMineAuth = true;
  },

  peekPendingLoginReturn() {
    return this.globalData.pendingLoginReturn || null;
  },

  consumePendingLoginReturn() {
    const pending = this.globalData.pendingLoginReturn;
    this.globalData.pendingLoginReturn = null;
    return pending && pending.url ? pending : null;
  },

  setPendingAuthDraft(action, draft) {
    if (!action || !draft) return;
    const drafts = this.globalData.pendingAuthDrafts || {};
    drafts[action] = {
      draft,
      createdAt: Date.now()
    };
    this.globalData.pendingAuthDrafts = drafts;
  },

  consumePendingAuthDraft(action) {
    if (!action) return null;
    const drafts = this.globalData.pendingAuthDrafts || {};
    const pending = drafts[action] || null;
    delete drafts[action];
    this.globalData.pendingAuthDrafts = drafts;
    return pending ? pending.draft : null;
  },

  isTabPageUrl(url) {
    const path = `${url || ''}`.split('?')[0];
    return tabPageUrls.indexOf(path) >= 0;
  }
});
