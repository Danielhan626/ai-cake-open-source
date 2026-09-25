const app = getApp();
const { request, toUserMessage, isLoginRequiredError } = require('../../utils/api');
const { goLogin, promptLoginRequired } = require('../../utils/auth');
const { refreshCreationCreditSummary, rechargeCreationCredits } = require('../../utils/creation-credits');
const { runWithPrivacy } = require('../../utils/privacy');

const bakerFulfillmentActions = {
  confirm: { status: 'baker_confirmed', note: '蛋糕师已确认制作排期。' },
  produce: { status: 'producing', note: '蛋糕正在制作中。' },
  complete: { status: 'completed', note: '订单已完成。' }
};

const defaultRechargeProduct = {
  id: 'credit_pack_60',
  title: '轻量补给',
  amount: 6,
  credits: 60,
  description: '适合先完成一次低金额充值与作品微调。'
};

function pickPrimaryRechargeProduct(products = []) {
  return products.find((item) => item.id === 'credit_pack_60') || products[0] || defaultRechargeProduct;
}

Page({
  data: {
    city: '',
    apiBase: '',
    activeRole: 'player',
    playerWorkspaceTab: 'overview',
    isPlayer: true,
    isBaker: false,
    isAuthenticated: false,
    showBakerWorkbench: false,
    loginStatus: '未登录',
    phoneStatus: '未绑定',
    authHint: '登录后可保存作品、发布需求、确认报价、同步订单，并继续绑定手机号用于正式订单联系。',
    authFocus: false,
    accountPanelExpanded: false,
    authLoading: false,
    phoneLoading: false,
    canBindPhone: false,
    phoneBound: false,
    authStepSummary: '第 1 步：微信登录',
    playerProfile: {},
    bakerProfile: {},
    playerStats: [],
    flowStatus: [],
    bakerStats: [],
    certificates: [],
    roseBalance: 0,
    creationCreditBalance: 0,
    checkInStatus: '今日未签到',
    dailyFreeGenerationStatus: '今日可免费生成 1 次',
    creationRechargeStatus: '配置中',
    creationRechargeHint: '微信登录后可直接补充积分。',
    creationRechargeProducts: [defaultRechargeProduct],
    selectedCreationRechargeProductId: 'credit_pack_60',
    primaryRechargeProduct: defaultRechargeProduct,
    rechargeLoading: false,
    completedTaskCount: 0,
    taskWallet: {
      pending: 0,
      approved: 0,
      roses: 0
    },
    historySummary: [
      { label: '作品', value: '0' },
      { label: '需求', value: '0' },
      { label: '报价', value: '0' },
      { label: '订单', value: '0' }
    ],
    recentWorks: [],
    recentDemands: [],
    recentOrders: [],
    bakerOrders: [],
    bakerOrdersLoading: false,
    historyLoading: false,
    historyExpanded: false,
    historyStatusLabel: '登录后同步',
    bakerOrdersStatusLabel: '登录后同步'
  },

  onShow() {
    this.refreshPage();
    this.focusAuthIfNeeded();
  },

  refreshPage() {
    this.syncCurrentBakerProfile();
    this.syncInteractionSummary();
    this.syncCreationCreditSummary();
    this.syncProfileHistory();
    this.syncBakerOrders();
    this.renderPage();
  },

  resetPrivateWorkbenchState() {
    app.globalData.userScore = 0;
    app.globalData.rewardWallet = {
      pending: 0,
      approved: 0
    };
    app.globalData.roseBalance = 0;
    app.globalData.creationCreditBalance = 0;
    app.globalData.dailyFreeGenerationRemaining = 1;
    app.globalData.lastCheckInDate = '';
    app.globalData.completedTaskCount = 0;
  },

  async syncCurrentBakerProfile() {
    if (!app.globalData.currentUser) {
      if (typeof app.clearOwnedBakerProfile === 'function') {
        app.clearOwnedBakerProfile();
      }
      this.renderPage();
      return;
    }
    try {
      const bakers = await request('/bakers/mine');
      if (bakers && bakers.length) {
        if (typeof app.storeOwnedBakerProfile === 'function') {
          app.storeOwnedBakerProfile(bakers[0]);
        }
      } else if (typeof app.clearOwnedBakerProfile === 'function') {
        app.clearOwnedBakerProfile();
      }
      this.renderPage();
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.renderPage();
        return;
      }
      // 网络波动时保留当前设备上的商家资料，避免工作台瞬间清空。
    }
  },

  async syncInteractionSummary() {
    if (!app.globalData.currentUser) {
      this.resetPrivateWorkbenchState();
      this.renderPage();
      this.syncTaskSummary();
      return;
    }
    try {
      const summary = await request('/interactions/summary');
      if (summary.wallet) {
        app.globalData.roseBalance = summary.wallet.roseBalance;
        app.globalData.userScore = summary.wallet.score;
        app.globalData.creationCreditBalance = summary.wallet.creationCreditBalance || 0;
        app.globalData.rewardWallet = {
          pending: summary.wallet.rewardPending,
          approved: summary.wallet.rewardApproved
        };
      }
      if (summary.todayCheckedIn) {
        app.globalData.lastCheckInDate = this.todayKey();
      }
      if (typeof summary.dailyFreeGenerationRemaining === 'number') {
        app.globalData.dailyFreeGenerationRemaining = summary.dailyFreeGenerationRemaining;
      }
      this.renderPage();
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.resetPrivateWorkbenchState();
        this.renderPage();
        this.syncTaskSummary();
        return;
      }
      // 后端不可用时保留当前本地状态，方便离线调试。
    }
    this.syncTaskSummary();
  },

  async syncTaskSummary() {
    if (!app.globalData.currentUser) {
      app.globalData.completedTaskCount = 0;
      this.renderPage();
      return;
    }
    try {
      const result = await request('/design-tasks/today');
      app.globalData.completedTaskCount = result.completedTaskCount || 0;
      this.renderPage();
    } catch (error) {
      if (isLoginRequiredError(error)) {
        app.globalData.completedTaskCount = 0;
        this.renderPage();
        return;
      }
      // 任务服务不可用时使用本地计数。
    }
  },

  async syncCreationCreditSummary() {
    if (!app.globalData.currentUser) {
      this.setRechargeState({
        products: app.globalData.creationRechargeProducts || [defaultRechargeProduct],
        enabled: false,
        status: app.globalData.paymentMode === 'wechat' ? '登录后可充值' : '配置中',
        hint: app.globalData.paymentMode === 'wechat' ? '先微信登录，再直接发起轻量补给。' : '充值通道暂不可用，先签到领取积分。'
      });
      return;
    }

    try {
      const summary = await refreshCreationCreditSummary();
      const products = summary.products && summary.products.length ? summary.products : [defaultRechargeProduct];
      this.setRechargeState({
        products,
        enabled: Boolean(summary.rechargeEnabled),
        status: summary.rechargeEnabled ? '微信支付已开启' : '配置中',
        hint: summary.rechargeEnabled ? '点下方按钮即可发起轻量补给，不用再去结果页找入口。' : '充值通道暂不可用，先签到领取积分。'
      });
      this.renderPage();
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.setRechargeState({
          products: app.globalData.creationRechargeProducts || [defaultRechargeProduct],
          enabled: false,
          status: '登录后可充值',
          hint: '先微信登录，再直接发起轻量补给。'
        });
        return;
      }
      this.setRechargeState({
        products: app.globalData.creationRechargeProducts || [defaultRechargeProduct],
        enabled: app.globalData.paymentMode === 'wechat',
        status: app.globalData.paymentMode === 'wechat' ? '微信支付已开启' : '配置中',
        hint: app.globalData.paymentMode === 'wechat' ? '网络波动时仍可尝试轻量补给。' : '充值通道暂不可用，先签到领取积分。'
      });
    }
  },

  setRechargeState(options = {}) {
    const products = options.products && options.products.length ? options.products : [defaultRechargeProduct];
    const primaryRechargeProduct = pickPrimaryRechargeProduct(products);
    const selectedCreationRechargeProductId =
      products.some((item) => item.id === this.data.selectedCreationRechargeProductId)
        ? this.data.selectedCreationRechargeProductId
        : primaryRechargeProduct.id;
    this.setData({
      creationRechargeProducts: products,
      selectedCreationRechargeProductId,
      primaryRechargeProduct,
      creationRechargeStatus: options.status || this.data.creationRechargeStatus,
      creationRechargeHint: options.hint || this.data.creationRechargeHint
    });
    this.creationRechargeEnabled = Boolean(options.enabled);
  },

  async syncProfileHistory() {
    if (!app.globalData.currentUser) {
      this.setData({
        historyLoading: false,
        historyStatusLabel: '登录后同步',
        historySummary: [
          { label: '作品', value: '0' },
          { label: '需求', value: '0' },
          { label: '报价', value: '0' },
          { label: '订单', value: '0' }
        ],
        recentWorks: [],
        recentDemands: [],
        recentOrders: []
      });
      return;
    }
    this.setData({ historyLoading: true });
    try {
      const history = await request(`/profile/history?userId=${app.globalData.userId}`);
      const summary = history.summary || {};
      this.setData({
        historyStatusLabel: '已同步',
        historySummary: [
          { label: '作品', value: `${summary.works || 0}` },
          { label: '需求', value: `${summary.demands || 0}` },
          { label: '报价', value: `${summary.quotes || 0}` },
          { label: '订单', value: `${summary.orders || 0}` }
        ],
        recentWorks: this.presentWorks(history.works || []),
        recentDemands: this.presentDemands(history.demands || []),
        recentOrders: this.presentOrders(history.orders || [])
      });
    } catch (error) {
      const expired = isLoginRequiredError(error);
      this.setData({
        historyStatusLabel: expired ? '登录后同步' : '同步失败',
        historySummary: [
          { label: '作品', value: '0' },
          { label: '需求', value: '0' },
          { label: '报价', value: '0' },
          { label: '订单', value: '0' }
        ],
        recentWorks: [],
        recentDemands: [],
        recentOrders: []
      });
      if (expired) {
        this.renderPage();
      }
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  presentWorks(works) {
    return works.slice(0, 2).map((work) => ({
      id: work.id,
      title: work.title,
      meta: `${work.scenario || '场景待定'} · ${work.style || '风格待定'} · ${work.reviewStatus || 'pending'}`,
      imageUrl: work.imageUrl
    }));
  },

  presentDemands(demands) {
    return demands.slice(0, 2).map((demand) => ({
      id: demand.id,
      title: demand.title,
      meta: `${demand.city || ''}${demand.district || ''} · ${demand.status || 'reviewing'} · 报价 ${demand.quoteCount || 0}`
    }));
  },

  presentOrders(orders) {
    return orders.slice(0, 2).map((order) => ({
      id: order.id,
      title: order.work ? order.work.title : order.demand ? order.demand.title : order.title || 'AI 蛋糕订单',
      meta: `${order.statusText || order.status || '已确认'} · ${order.totalText || (order.amount ? `¥${order.amount}` : '待报价')}`
    }));
  },

  async syncBakerOrders() {
    this.setData({ bakerOrdersLoading: true });
    if (!app.globalData.currentUser) {
      this.setData({
        bakerOrders: [],
        bakerOrdersLoading: false,
        bakerOrdersStatusLabel: '登录后同步'
      });
      return;
    }
    if (!app.globalData.bakerId || !app.globalData.bakerProfile.userId) {
      this.setData({
        bakerOrders: [],
        bakerOrdersLoading: false,
        bakerOrdersStatusLabel: '暂无履约订单'
      });
      return;
    }
    try {
      const bakerUserId = app.globalData.bakerProfile.userId;
      const orders = await request(`/orders/baker?userId=${bakerUserId}&bakerId=${app.globalData.bakerId}`);
      const bakerOrders = this.presentBakerOrders(orders || []);
      this.setData({
        bakerOrders,
        bakerOrdersStatusLabel: bakerOrders.length ? '已同步' : '暂无履约订单'
      });
    } catch (error) {
      const expired = isLoginRequiredError(error);
      this.setData({
        bakerOrders: [],
        bakerOrdersStatusLabel: expired ? '登录后同步' : '同步失败'
      });
      if (expired) {
        this.renderPage();
      }
    } finally {
      this.setData({ bakerOrdersLoading: false });
    }
  },

  presentBakerOrders(orders) {
    return orders.slice(0, 6).map((order) => {
      const work = order.work || null;
      const demand = order.demand || null;
      const fulfillment = order.fulfillment || {};
      return {
        id: order.id,
        title: work ? work.title : demand ? demand.title : 'AI 蛋糕订单',
        meta: `${order.city || ''}${order.district || ''} · ${order.expectedDate || '日期待定'} · ${order.totalText || (order.amount ? `¥${order.amount}` : '待报价')}`,
        buyerNote: demand ? demand.description : '等待用户补充制作要求。',
        status: order.statusText || order.status || '已确认报价意向',
        fulfillmentStatus: this.fulfillmentText(fulfillment.status || 'created'),
        fulfillmentRawStatus: fulfillment.status || 'created',
        note: fulfillment.note || '等待蛋糕师确认制作排期。',
        imageUrl: work ? work.imageUrl : '',
        raw: order
      };
    });
  },

  fulfillmentText(status) {
    const textMap = {
      created: '等待确认',
      baker_confirmed: '已确认制作',
      producing: '制作中',
      ready: '待配送/自提',
      delivering_or_pickup: '配送/自提中',
      completed: '已完成',
      disputed: '售后处理中'
    };
    return textMap[status] || '等待更新';
  },

  buildPlayerBadges(options = {}) {
    const badges = [];
    if (options.loggedIn) badges.push('微信已登录');
    if (options.phoneBound) badges.push('手机号已绑定');
    if ((options.workCount || 0) > 0) badges.push(`已创作 ${options.workCount} 个作品`);
    if ((options.completedTaskCount || 0) > 0) badges.push(`已完成 ${options.completedTaskCount} 个任务`);
    if ((options.pendingRewards || 0) > 0) badges.push(`待审灵感券 ${options.pendingRewards} 点`);
    if ((options.approvedRewards || 0) > 0) badges.push(`可用灵感券 ${options.approvedRewards} 点`);
    if ((options.adoptedCount || 0) > 0) badges.push(`做同款 ${options.adoptedCount} 次`);
    return badges.slice(0, 4);
  },

  renderPage() {
    const rewardWallet = app.globalData.rewardWallet || { pending: 0, approved: 0 };
    const playerProfile = app.globalData.playerProfile || {};
    const bakerProfile = app.globalData.bakerProfile || {};
    const work = app.globalData.currentWork;
    const demand = app.globalData.currentDemand;
    const quote = app.globalData.currentQuote;
    const payment = app.globalData.currentPayment;
    const order = app.globalData.currentOrder;
    const activeRole = app.globalData.accountRole || 'player';
    const isAuthenticated = Boolean(app.globalData.currentUser);
    const hasBakerProfile = Boolean(bakerProfile.userId);
    const workCount = Math.max(playerProfile.worksCount || 0, work ? 1 : 0);
    const playerScore = app.globalData.userScore || playerProfile.score || 0;
    const quoteTotal = quote ? quote.amount + quote.deliveryFee : 0;
    const today = this.todayKey();
    const checkedIn = app.globalData.lastCheckInDate === today;
    const completedTaskCount = app.globalData.completedTaskCount || 0;
    const creationCreditBalance = app.globalData.creationCreditBalance || 0;
    const creationRechargeProducts =
      this.data.creationRechargeProducts && this.data.creationRechargeProducts.length
        ? this.data.creationRechargeProducts
        : app.globalData.creationRechargeProducts && app.globalData.creationRechargeProducts.length
          ? app.globalData.creationRechargeProducts
          : [defaultRechargeProduct];
    const primaryRechargeProduct = pickPrimaryRechargeProduct(creationRechargeProducts);
    const dailyFreeGenerationRemaining =
      typeof app.globalData.dailyFreeGenerationRemaining === 'number' ? app.globalData.dailyFreeGenerationRemaining : 1;
    const playerLevel = app.globalData.currentUser
      ? app.globalData.currentUser.phoneNumber
        ? '已登录，可发布需求'
        : '已登录，待绑定手机号'
      : '创作与下单用户';

    const nextPlayerProfile = {
      nickname: playerProfile.nickname || '创作用户',
      level: playerLevel,
      score: playerScore,
      worksCount: workCount,
      adoptedCount: playerProfile.adoptedCount || 0,
      voteCount: playerProfile.voteCount || 0,
      badges: this.buildPlayerBadges({
        loggedIn: Boolean(app.globalData.currentUser),
        phoneBound: Boolean(app.globalData.currentUser && app.globalData.currentUser.phoneNumber),
        workCount,
        completedTaskCount,
        pendingRewards: rewardWallet.pending || 0,
        approvedRewards: rewardWallet.approved || 0,
        adoptedCount: playerProfile.adoptedCount || 0
      })
    };
    app.globalData.playerProfile = nextPlayerProfile;

    this.setData({
      city: app.globalData.city,
      apiBase: app.globalData.apiBase,
      activeRole,
      isPlayer: activeRole === 'player',
      isBaker: activeRole === 'baker',
      isAuthenticated,
      showBakerWorkbench: isAuthenticated && hasBakerProfile,
      loginStatus: app.globalData.currentUser ? app.globalData.currentUser.nickname : '未登录',
      phoneStatus: app.globalData.currentUser && app.globalData.currentUser.phoneNumber ? app.globalData.currentUser.phoneNumber : '未绑定',
      canBindPhone: Boolean(app.globalData.currentUser),
      phoneBound: Boolean(app.globalData.currentUser && app.globalData.currentUser.phoneNumber),
      authHint: app.globalData.currentUser
        ? app.globalData.currentUser.phoneNumber
          ? '账号和手机号已就绪，可发布需求、确认报价、跟进订单并申请售后。'
          : '账号已登录，绑定手机号后可发布需求、确认报价并申请售后。'
        : '登录后可保存作品、发布需求、确认报价、同步订单，并继续绑定手机号用于正式订单联系。',
      authStepSummary: app.globalData.currentUser
        ? app.globalData.currentUser.phoneNumber
          ? '账号已就绪：微信登录和手机号都已完成'
          : '下一步：点击绑定手机号，完成正式订单联系能力'
        : '第 1 步：微信登录；第 2 步：绑定手机号',
      playerProfile: nextPlayerProfile,
      bakerProfile,
      roseBalance: app.globalData.roseBalance || 0,
      creationCreditBalance,
      creationRechargeProducts,
      primaryRechargeProduct,
      selectedCreationRechargeProductId: this.data.selectedCreationRechargeProductId || primaryRechargeProduct.id,
      checkInStatus: checkedIn ? '今日已签到' : '今日未签到',
      dailyFreeGenerationStatus:
        dailyFreeGenerationRemaining > 0
          ? '今日还可免费生成 1 次'
          : `免费已用完，继续生成消耗 ${app.globalData.creationGenerationCost || 5} 积分/次`,
      creationRechargeStatus:
        this.data.creationRechargeStatus || (app.globalData.paymentMode === 'wechat' ? '已开启' : '配置中'),
      completedTaskCount,
      taskWallet: {
        pending: rewardWallet.pending || 0,
        approved: rewardWallet.approved || 0,
        roses: app.globalData.roseBalance || 0
      },
      playerStats: [
        { label: '创作值', value: playerScore },
        { label: '创作积分', value: `${creationCreditBalance} 点` },
        { label: '玫瑰余额', value: `${app.globalData.roseBalance || 0} 束` },
        { label: '待审灵感券', value: `${rewardWallet.pending || 0} 点` },
        { label: '可用灵感券', value: `${rewardWallet.approved || 0} 点` },
        { label: '论坛作品', value: `${workCount} 个` }
      ],
      flowStatus: [
        { label: '当前作品', value: work ? work.title : '未生成' },
        { label: '我的订单', value: order ? order.status : '未创建' },
        { label: '制作需求', value: demand ? demand.status : '未发布' },
        { label: '蛋糕师报价', value: quote ? `¥${quoteTotal}` : '未报价' },
        { label: '确认状态', value: payment ? payment.status : '未确认' }
      ],
      bakerStats: [
        { label: '服务范围', value: bakerProfile.serviceRange || '待设置' },
        { label: '报价记录', value: quote ? '已报价' : `${bakerProfile.quoteCount || 0} 次` },
        { label: '完成订单', value: `${bakerProfile.orderCount || 0} 单` },
        { label: '响应率', value: bakerProfile.responseRate || '待统计' }
      ],
      certificates: [
        { label: '健康证', value: bakerProfile.healthCertStatus || '待提交' },
        { label: '营业执照', value: bakerProfile.licenseStatus || '待提交' },
        { label: '入驻状态', value: bakerProfile.verifyStatus || '待审核' },
        { label: '交付方式', value: bakerProfile.deliveryMethods || '待设置' }
      ]
    });
  },

  focusAuthIfNeeded() {
    if (!app.globalData.focusMineAuth) return;
    app.globalData.focusMineAuth = false;
    this.setData({
      authFocus: true,
      accountPanelExpanded: true
    });
    wx.pageScrollTo({
      selector: '#login-anchor',
      duration: 260,
      fail: () => {}
    });
    setTimeout(() => {
      this.setData({ authFocus: false });
    }, 1800);
  },

  switchRole(event) {
    const role = event.currentTarget.dataset.role || 'player';
    app.globalData.accountRole = role;
    if (role === 'player' && this.data.playerWorkspaceTab !== 'overview') {
      this.setData({ playerWorkspaceTab: 'overview' });
    }
    this.refreshPage();
  },

  switchPlayerWorkspaceTab(event) {
    const tab = event.currentTarget.dataset.tab || 'overview';
    if (tab === this.data.playerWorkspaceTab) return;
    this.setData({ playerWorkspaceTab: tab });
  },

  toggleAccountPanel() {
    this.setData({
      accountPanelExpanded: !this.data.accountPanelExpanded
    });
  },

  toggleHistoryPanel() {
    this.setData({
      historyExpanded: !this.data.historyExpanded
    });
  },

  todayKey() {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  },

  async checkInRose() {
    const today = this.todayKey();
    if (app.globalData.lastCheckInDate === today) {
      wx.showToast({ title: '今天已经签到', icon: 'none' });
      return;
    }
    if (!app.globalData.currentUser) {
      wx.showModal({
        title: '登录后签到',
        content: '先完成微信登录后再领取每日玫瑰；登录成功后会回到当前页面继续操作。',
        cancelText: '先看看',
        confirmText: '去登录',
        success: (result) => {
          if (result.confirm) {
            goLogin({
              url: '/pages/mine/mine',
              action: 'check-in'
            });
          }
        }
      });
      return;
    }
    try {
      const result = await request('/interactions/check-in', {
        method: 'POST',
        data: {}
      });
      if (result.wallet) {
        app.globalData.roseBalance = result.wallet.roseBalance;
        app.globalData.creationCreditBalance = result.wallet.creationCreditBalance || app.globalData.creationCreditBalance || 0;
      }
      app.globalData.lastCheckInDate = today;
      this.renderPage();
      wx.showToast({ title: result.roseDelta ? '已获得玫瑰和积分' : '今天已经签到', icon: 'none' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'check-in',
        title: '登录后签到领玫瑰'
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '签到失败，请稍后重试'), icon: 'none' });
    }
  },

  async submitMineRecharge() {
    if (this.data.rechargeLoading) return;
    if (!app.globalData.currentUser) {
      if (typeof app.setPendingLoginReturn === 'function') {
        app.setPendingLoginReturn({
          url: '/pages/mine/mine',
          action: 'creation-credit-recharge',
          requirePhone: false
        });
      }
      wx.showModal({
        title: '登录后充值积分',
        content: '先完成微信登录，回来后会直接继续轻量补给充值。',
        cancelText: '稍后',
        confirmText: '微信登录',
        success: (result) => {
          if (result.confirm) {
            this.loginWithWechat();
          }
        }
      });
      return;
    }

    if (app.globalData.paymentMode !== 'wechat' && app.globalData.paymentMode !== 'mock') {
      wx.showModal({
        title: '充值通道暂不可用',
        content: '当前支付通道还没有开启，请先签到领取积分。',
        showCancel: false
      });
      return;
    }

    this.setData({ rechargeLoading: true });
    try {
      const order = await rechargeCreationCredits(this.data.selectedCreationRechargeProductId || 'credit_pack_60');
      await this.syncCreationCreditSummary();
      wx.showToast({
        title: order && order.credits ? `已到账 ${order.credits} 积分` : '充值成功',
        icon: 'none'
      });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'creation-credit-recharge',
        title: '登录后充值积分',
        beforeLogin: () => {
          if (typeof app.setPendingLoginReturn === 'function') {
            app.setPendingLoginReturn({
              url: '/pages/mine/mine',
              action: 'creation-credit-recharge',
              requirePhone: false
            });
          }
        }
      })) {
        return;
      }
      wx.showModal({
        title: '充值未完成',
        content: toUserMessage(error, '充值没有完成，请稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ rechargeLoading: false });
    }
  },

  loginWithWechat() {
    this.setData({ authLoading: true });
    wx.login({
      success: async (result) => {
        if (!result.code) {
          this.setData({ authLoading: false });
          wx.showModal({
            title: '微信登录未完成',
            content: '微信没有返回登录凭证，请确认开发者工具或手机微信登录状态正常后重试。',
            showCancel: false
          });
          return;
        }

        try {
          const session = await request('/auth/wechat-login', {
            method: 'POST',
            data: {
              code: result.code,
              nickname: '微信用户',
              city: app.globalData.city
            }
          });
          if (typeof app.setAuthenticatedSession === 'function') {
            app.setAuthenticatedSession(session);
          } else {
            app.globalData.currentUser = session.user;
            app.globalData.userId = session.user.id;
            app.globalData.authToken = session.token || '';
          }
          this.refreshPage();
          const pending =
            typeof app.peekPendingLoginReturn === 'function' ? app.peekPendingLoginReturn() : app.globalData.pendingLoginReturn;
          if (pending && pending.requirePhone && !(session.user && session.user.phoneNumber)) {
            this.promptPhoneAfterWechatLogin();
            return;
          }
          wx.showToast({ title: '微信登录成功' });
          this.resumePendingLoginReturn();
        } catch (error) {
          wx.showModal({
            title: '微信登录暂不可用',
            content: toUserMessage(error, '微信登录失败，请稍后重试或联系平台处理。'),
            showCancel: false
          });
        } finally {
          this.setData({ authLoading: false });
        }
      },
      fail: () => {
        this.setData({ authLoading: false });
        wx.showModal({
          title: '微信登录失败',
          content: '请确认当前微信账号可用，或重新打开小程序后再试。',
          showCancel: false
        });
      }
    });
  },

  showPhoneLoginPrerequisite() {
    wx.showModal({
      title: '先完成微信登录',
      content: '手机号绑定需要先确认微信账号。登录成功后，再绑定手机号才能继续正式订单相关操作。',
      cancelText: '稍后',
      confirmText: '微信登录',
      success: (result) => {
        if (result.confirm) {
          if (typeof app.setPendingLoginReturn === 'function') {
            app.setPendingLoginReturn({
              url: '/pages/mine/mine',
              action: 'bind-phone',
              requirePhone: true
            });
          }
          this.loginWithWechat();
        }
      }
    });
  },

  promptPhoneAfterWechatLogin() {
    this.setData({
      authFocus: true,
      accountPanelExpanded: true
    });
    wx.pageScrollTo({
      selector: '#login-anchor',
      duration: 260,
      fail: () => {}
    });
    setTimeout(() => {
      this.setData({ authFocus: false });
    }, 1800);
    wx.showModal({
      title: '微信已登录',
      content: '还差一步手机号授权。请点击账号区的“绑定手机号”，完成后会继续刚才的订单、报价或入驻操作。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  async loginWithPhone(event) {
    if (!app.globalData.currentUser) {
      wx.showModal({
        title: '请先微信登录',
        content: '手机号绑定需要先确认微信账号。登录成功后，再绑定手机号才能继续正式订单相关操作。',
        showCancel: false
      });
      return;
    }

    const phoneCode = event.detail && event.detail.code;
    if (!phoneCode) {
      const errMsg = event.detail && event.detail.errMsg ? event.detail.errMsg : '';
      const denied = errMsg.includes('deny');
      wx.showModal({
        title: denied ? '你已取消手机号授权' : '手机号授权暂不可用',
        content: denied
          ? '未获取到手机号，正式下单、配送沟通和售后处理都需要先绑定手机号。'
          : '当前入口没有返回手机号授权 code。请在手机微信里打开最新小程序版本重试，并先完成微信登录。',
        showCancel: false
      });
      return;
    }

    runWithPrivacy(async () => {
      this.setData({ phoneLoading: true });
      try {
        const session = await request('/auth/phone-login', {
          method: 'POST',
          data: {
            userId: app.globalData.currentUser.id,
            phoneCode
          }
        });
        if (typeof app.setAuthenticatedSession === 'function') {
          app.setAuthenticatedSession(session);
        } else {
          app.globalData.currentUser = session.user;
          app.globalData.userId = session.user.id;
          app.globalData.authToken = session.token || app.globalData.authToken || '';
        }
        this.refreshPage();
        wx.showToast({ title: '手机号已绑定' });
        this.resumePendingLoginReturn();
      } catch (error) {
        wx.showModal({
          title: '手机号绑定失败',
          content: toUserMessage(error, '手机号绑定失败，请稍后重试；完成绑定后才能继续正式订单相关操作。'),
          showCancel: false
        });
      } finally {
        this.setData({ phoneLoading: false });
      }
    }, '请先同意隐私保护指引再绑定手机号');
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    this.openMiniPage('/pages/design/design');
  },

  goWorks() {
    this.openMiniTab('/pages/works/works');
  },

  goBakers() {
    app.globalData.accountRole = 'baker';
    this.openMiniTab('/pages/bakers/bakers');
  },

  goQuotes() {
    this.openMiniPage('/pages/quotes/quotes');
  },

  goOrders() {
    this.openMiniPage('/pages/orders/orders');
  },

  goRules() {
    this.openMiniPage('/pages/rules/rules');
  },

  goSupport() {
    this.openMiniPage('/pages/support/support');
  },

  goOnboarding() {
    app.globalData.accountRole = 'baker';
    this.openMiniPage('/pages/onboarding/onboarding');
  },

  openMiniTab(url) {
    wx.switchTab({
      url,
      fail: () => {
        wx.showToast({
          title: '页面打开失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  openMiniPage(url) {
    wx.navigateTo({
      url,
      fail: () => {
        wx.reLaunch({
          url,
          fail: () => {
            wx.showToast({
              title: '页面打开失败，请重试',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  async updateBakerFulfillment(event) {
    const orderId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    this.updateBakerFulfillmentById(orderId, status);
  },

  preserveBakerFulfillmentForAuth(orderId, status) {
    if (typeof app.setPendingAuthDraft !== 'function' || !orderId || !status) return;
    app.setPendingAuthDraft('baker-fulfillment', {
      orderId,
      status
    });
  },

  resumePendingBakerFulfillment() {
    if (typeof app.consumePendingAuthDraft !== 'function') return false;
    const pending = app.consumePendingAuthDraft('baker-fulfillment');
    if (!pending || !pending.orderId || !pending.status) return false;
    setTimeout(() => {
      this.updateBakerFulfillmentById(pending.orderId, pending.status);
    }, 260);
    return true;
  },

  async updateBakerFulfillmentById(orderId, status) {
    if (!orderId || !status) return;
    const action = Object.keys(bakerFulfillmentActions)
      .map((key) => bakerFulfillmentActions[key])
      .find((item) => item.status === status);
    const note = action ? action.note : '蛋糕师已更新履约状态。';
    if (app.globalData.currentUser && (!app.globalData.bakerId || !app.globalData.bakerProfile.userId)) {
      await this.syncCurrentBakerProfile();
    }
    if (!app.globalData.bakerId || !app.globalData.bakerProfile.userId) {
      wx.showModal({
        title: '还不能更新履约',
        content: '请先完成师傅入驻并通过平台审核，再更新订单履约状态。',
        showCancel: false
      });
      return;
    }
    try {
      const updated = await request(`/orders/${orderId}/baker-fulfillment`, {
        method: 'PATCH',
        data: {
          userId: app.globalData.bakerProfile.userId,
          bakerId: app.globalData.bakerId,
          status,
          note
        }
      });
      app.globalData.currentOrder = this.presentBakerOrders([updated])[0];
      await this.syncBakerOrders();
      this.renderPage();
      wx.showToast({ title: this.fulfillmentText(status) });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'baker-fulfillment',
        title: '登录后更新履约',
        beforeLogin: () => this.preserveBakerFulfillmentForAuth(orderId, status)
      })) {
        return;
      }
      wx.showModal({
        title: '履约更新失败',
        content: toUserMessage(error, '订单履约状态更新失败，请检查登录和网络后重试。'),
        showCancel: false
      });
    }
  },

  showRewardRule() {
    wx.showModal({
      title: '灵感券规则',
      content: '完成每日任务、发布作品或真实需求后可获得灵感券待审核记录。灵感券用于站内互动和运营活动，不等同现金，不自动提现。',
      showCancel: false
    });
  },

  showInspirationRule() {
    wx.showModal({
      title: '灵感券用途',
      content: '第一版灵感券用于游戏化验证：可兑换更多生成/微调次数、作品广场曝光位、创作点评优先权和活动资格。后续接商家后，可扩展为蛋糕优惠券或线下活动权益，但不直接等同现金。',
      showCancel: false
    });
  },

  showBakerOnboarding() {
    this.goOnboarding();
  },

  resumeMineActionAfterLogin(pending) {
    if (!pending || !pending.action) return false;
    if (pending.action === 'check-in') {
      setTimeout(() => {
        this.checkInRose();
      }, 200);
      return true;
    }
    if (pending.action === 'creation-credit-recharge') {
      setTimeout(() => {
        this.submitMineRecharge();
      }, 260);
      return true;
    }
    if (pending.action === 'baker-fulfillment') {
      return this.resumePendingBakerFulfillment();
    }
    return false;
  },

  resumePendingLoginReturn() {
    if (typeof app.consumePendingLoginReturn !== 'function') return;
    const pending = app.consumePendingLoginReturn();
    if (!pending || !pending.url) return;
    if (pending.url.indexOf('/pages/mine/mine') === 0) {
      this.resumeMineActionAfterLogin(pending);
      return;
    }
    const jump = () => {
      if (typeof app.isTabPageUrl === 'function' && app.isTabPageUrl(pending.url)) {
        this.openMiniTab(pending.url.split('?')[0]);
        return;
      }
      this.openMiniPage(pending.url);
    };
    setTimeout(jump, 450);
  }
});
