const { request, nextWeek, toUserMessage, isCreationCreditInsufficientError } = require('../../utils/api');
const { ensureCommercialContact, promptLoginRequired } = require('../../utils/auth');
const { buildBotReviewPreview } = require('../../utils/bot-reviews');
const { refreshCreationCreditSummary, rechargeCreationCredits } = require('../../utils/creation-credits');
const { getCityProfile, getSupportedCities } = require('../../utils/city');
const app = getApp();

Page({
  data: {
    work: null,
    game: null,
    aiReviews: [],
    interaction: {
      votes: 0,
      roses: 0,
      voted: false,
      roseSent: false,
      roseBalance: 0,
      roseBalanceText: '当前可用玫瑰：0 束',
      emptyText: '暂无真实互动，成为第一个投票的人'
    },
    activeResultTab: 'actions',
    reviewPanelExpanded: false,
    refineNote: '',
    loading: false,
    sameStyleConfirmOpen: false,
    demandDetailsOpen: false,
    deliveryOptions: ['同城配送', '到店自提', '配送或自提均可'],
    deliveryWindowOptions: ['尽快送达', '上午', '下午', '晚上', '定时需确认'],
    cityOptions: getSupportedCities(),
    servingOptions: ['2-4人', '4-6人', '8-10人', '10人以上'],
    flavorOptions: ['动物奶油', '水果夹心', '巧克力', '低糖', '口味待沟通'],
    budgetOptions: ['100-199元', '200-399元', '400-699元', '700元以上'],
    productionNoticeItems: [
      'AI 图是设计参考，真实成品以师傅确认的材料和结构为准。',
      '颜色、摆件、支撑结构可能会调整，装饰可能不可食用。',
      '复杂造型建议提前沟通，冷藏保存并尽量当天食用。'
    ],
    productionLevelOptions: [
      { label: '常规制作', value: 'standard' },
      { label: '需要沟通', value: 'discuss' },
      { label: '挑战制作', value: 'challenge' },
      { label: '仅创意展示', value: 'concept' }
    ],
    demandForm: {
      expectedDate: '',
      orderCityIndex: 0,
      orderCity: '长治',
      orderDistrict: '潞州区',
      deliveryIndex: 0,
      deliveryText: '同城配送',
      deliveryWindowIndex: 4,
      deliveryWindowText: '定时需确认',
      servingsIndex: 1,
      servingsText: '4-6人',
      flavorIndex: 4,
      flavorText: '口味待沟通',
      budgetIndex: 1,
      budgetText: '200-399元',
      address: '',
      contact: '',
      description: '',
      productionLevelIndex: 1,
      productionLevelText: '需要沟通',
      productionLevel: 'discuss',
      mustKeep: '',
      canAdjust: '',
      recipientNote: '',
      productionNoticeAccepted: false,
      allowAdjustments: true
    },
    publishWorkLoading: false,
    creditSummary: {
      balance: 0,
      generationCost: 5,
      refineCost: 5,
      checkInCredit: 10,
      todayCheckedIn: false,
      dailyFreeGenerationText: '登录后可享今日免费基础生成',
      rechargeMode: 'disabled',
      rechargeEnabled: false,
      rechargeStatusText: '登录后可充值创作积分',
      rechargeActionText: '登录后充值',
      products: []
    },
    showRechargePanel: false,
    selectedRechargeProductId: '',
    rechargeLoading: false,
    pendingAfterRecharge: ''
  },

  toggleReviewPanel() {
    this.setData({ reviewPanelExpanded: !this.data.reviewPanelExpanded });
  },

  onLoad() {
    this.syncResult();
  },

  onShow() {
    this.syncResult();
  },

  syncResult() {
    const work = app.globalData.currentWork || null;
    const game = app.globalData.currentDesignGame || null;
    this.ensureDemandForm(work);
    const nextData = {
      work,
      game,
      aiReviews: this.buildAiReviews(work, game),
      interaction: this.buildInteraction(work)
    };
    const pendingAuthDraft =
      typeof app.consumePendingAuthDraft === 'function' ? app.consumePendingAuthDraft('publish-demand') : null;
    if (pendingAuthDraft && pendingAuthDraft.demandForm) {
      nextData.demandForm = Object.assign({}, this.data.demandForm, pendingAuthDraft.demandForm);
    }
    const pendingRefineDraft =
      typeof app.consumePendingAuthDraft === 'function' ? app.consumePendingAuthDraft('work-refine') : null;
    if (
      pendingRefineDraft &&
      typeof pendingRefineDraft.refineNote === 'string' &&
      (!pendingRefineDraft.workId || !work || pendingRefineDraft.workId === work.id)
    ) {
      nextData.refineNote = pendingRefineDraft.refineNote;
    }
    this.setData(nextData);
    if (work) {
      const pendingRechargeDraft =
        typeof app.consumePendingAuthDraft === 'function' ? app.consumePendingAuthDraft('creation-credit-recharge') : null;
      if (
        pendingRechargeDraft &&
        (!pendingRechargeDraft.workId || pendingRechargeDraft.workId === work.id)
      ) {
        this.setData({
          showRechargePanel: pendingRechargeDraft.showRechargePanel !== false,
          pendingAfterRecharge:
            typeof pendingRechargeDraft.pendingAfterRecharge === 'string'
              ? pendingRechargeDraft.pendingAfterRecharge
              : this.data.pendingAfterRecharge,
          selectedRechargeProductId:
            pendingRechargeDraft.selectedRechargeProductId || this.data.selectedRechargeProductId
        });
      }
      this.resumePendingResultInteraction(work);
      this.loadBotReviews(work);
      this.syncCreationCredits();
    }
  },

  async syncCreationCredits() {
    if (!app.globalData.currentUser) {
      this.setData({
        creditSummary: {
          balance: app.globalData.creationCreditBalance || 0,
          generationCost: app.globalData.creationGenerationCost || 5,
          refineCost: app.globalData.creationRefineCost || 5,
          checkInCredit: 10,
          todayCheckedIn: false,
          dailyFreeGenerationText: '登录后可享今日免费基础生成',
          rechargeMode: app.globalData.paymentMode === 'wechat' ? 'login-required' : 'disabled',
          rechargeEnabled: false,
          rechargeStatusText: app.globalData.paymentMode === 'wechat' ? '登录后可用微信支付充值。' : '充值通道暂不可用，请先签到领取积分。',
          rechargeActionText: app.globalData.paymentMode === 'wechat' ? '登录后充值' : '充值通道配置中',
          products: app.globalData.creationRechargeProducts || []
        },
        selectedRechargeProductId: (app.globalData.creationRechargeProducts || [])[0]
          ? app.globalData.creationRechargeProducts[0].id
          : ''
      });
      return;
    }
    try {
      const summary = await refreshCreationCreditSummary();
      const products = summary.products || [];
      const selectedRechargeProductId =
        this.data.selectedRechargeProductId || (products[0] ? products[0].id : '');
      if (summary.todayCheckedIn) {
        app.globalData.lastCheckInDate = this.todayKey();
      }
      this.setData({
        creditSummary: {
          balance: summary.wallet ? summary.wallet.creationCreditBalance || 0 : 0,
          generationCost: summary.generationCost || 5,
          refineCost: summary.refineCost || 5,
          checkInCredit: summary.checkInCredit || 10,
          todayCheckedIn: Boolean(summary.todayCheckedIn),
          dailyFreeGenerationText:
            summary.dailyFreeGenerationRemaining > 0
              ? '今日还可免费基础生成 1 次'
              : `免费已用完，继续生成消耗 ${summary.generationCost || 5} 积分/次`,
          rechargeMode: summary.rechargeMode || 'disabled',
          rechargeEnabled: Boolean(summary.rechargeEnabled),
          rechargeStatusText: summary.rechargeEnabled ? '支付成功后会回到当前作品继续微调。' : '充值通道暂不可用，请先签到领取积分。',
          rechargeActionText: summary.rechargeEnabled ? '立即充值' : '充值通道配置中',
          products
        },
        selectedRechargeProductId
      });
    } catch (error) {
      this.setData({
        creditSummary: {
          balance: app.globalData.creationCreditBalance || 0,
          generationCost: app.globalData.creationGenerationCost || 5,
          refineCost: app.globalData.creationRefineCost || 5,
          checkInCredit: 10,
          todayCheckedIn: app.globalData.lastCheckInDate === this.todayKey(),
          dailyFreeGenerationText:
            (app.globalData.dailyFreeGenerationRemaining || 0) > 0
              ? '今日还可免费基础生成 1 次'
              : `免费已用完，继续生成消耗 ${app.globalData.creationGenerationCost || 5} 积分/次`,
          rechargeMode: app.globalData.currentUser && app.globalData.paymentMode === 'wechat' ? 'wechat' : 'disabled',
          rechargeEnabled: Boolean(app.globalData.currentUser && app.globalData.paymentMode === 'wechat'),
          rechargeStatusText:
            app.globalData.currentUser && app.globalData.paymentMode === 'wechat'
              ? '支付成功后会回到当前作品继续微调。'
              : '登录后可用微信支付充值。',
          rechargeActionText:
            app.globalData.currentUser && app.globalData.paymentMode === 'wechat' ? '立即充值' : '登录后充值',
          products: app.globalData.creationRechargeProducts || []
        }
      });
    }
  },

  openRechargePanel() {
    this.setData({ showRechargePanel: true });
  },

  closeRechargePanel() {
    this.setData({ showRechargePanel: false, pendingAfterRecharge: '' });
  },

  selectRechargeProduct(event) {
    const productId = event.currentTarget.dataset.productid;
    if (!productId) return;
    this.setData({ selectedRechargeProductId: productId });
  },

  goMineForCheckIn() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  async submitRecharge() {
    if (this.data.rechargeLoading) return;
    if (!app.globalData.currentUser) {
      this.preserveRechargeForAuth('creation-credit-recharge');
      promptLoginRequired(new Error('Authorization bearer token'), {
        action: 'creation-credit-recharge',
        title: '登录后充值积分',
        content: '创作积分充值需要先确认微信账号，登录成功后会回到当前作品。',
        beforeLogin: () => this.preserveRechargeForAuth('creation-credit-recharge')
      });
      return;
    }
    if (!this.data.selectedRechargeProductId) {
      wx.showToast({ title: '请选择充值档位', icon: 'none' });
      return;
    }
    if (!this.data.creditSummary.rechargeEnabled) {
      wx.showToast({ title: '充值通道配置中', icon: 'none' });
      return;
    }

    this.setData({ rechargeLoading: true });
    try {
      const order = await rechargeCreationCredits(this.data.selectedRechargeProductId);
      await this.syncCreationCredits();
      this.setData({ showRechargePanel: false });
      wx.showToast({
        title: order && order.credits ? `已到账 ${order.credits} 积分` : '充值成功',
        icon: 'none'
      });
      if (this.data.pendingAfterRecharge === 'refine') {
        this.setData({ pendingAfterRecharge: '' });
        setTimeout(() => this.refineWork(), 180);
      }
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'creation-credit-recharge',
        title: '登录后充值积分',
        beforeLogin: () => this.preserveRechargeForAuth('creation-credit-recharge')
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '充值失败，请稍后重试'), icon: 'none' });
    } finally {
      this.setData({ rechargeLoading: false });
    }
  },

  preserveDemandForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      demandForm: Object.assign({}, this.data.demandForm),
      workId: this.data.work && this.data.work.id
    });
  },

  preserveRefineForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      refineNote: this.data.refineNote,
      workId: this.data.work && this.data.work.id
    });
  },

  preserveRechargeForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function' || !action) return;
    app.setPendingAuthDraft(action, {
      showRechargePanel: true,
      selectedRechargeProductId: this.data.selectedRechargeProductId,
      pendingAfterRecharge: this.data.pendingAfterRecharge,
      workId: this.data.work && this.data.work.id
    });
  },

  preserveResultInteractionForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function' || !action) return;
    app.setPendingAuthDraft('result-interaction', {
      action,
      workId: this.data.work && this.data.work.id
    });
  },

  preserveReviewLikeForAuth(botId) {
    if (typeof app.setPendingAuthDraft !== 'function' || !botId) return;
    app.setPendingAuthDraft('result-interaction', {
      action: 'review-like',
      workId: this.data.work && this.data.work.id,
      botId
    });
  },

  resumePendingResultInteraction(work) {
    if (!work || typeof app.consumePendingAuthDraft !== 'function') return;
    const pending = app.consumePendingAuthDraft('result-interaction');
    if (!pending || !pending.action) return;
    if (pending.workId && pending.workId !== work.id) return;
    setTimeout(() => {
      if (pending.action === 'review-like') {
        this.likeReviewByBotId(pending.botId);
        return;
      }
      if (pending.action === 'vote') {
        this.voteWork();
        return;
      }
      if (pending.action === 'rose') {
        this.sendRose();
        return;
      }
      if (pending.action === 'publish-work') {
        this.publishWorkToForum();
      }
    }, 180);
  },

  async loadBotReviews(work) {
    try {
      const result = await request('/bot-reviews/work', {
        method: 'POST',
        data: {
          workId: work.id,
          title: work.title,
          prompt: work.prompt,
          imageUrl: work.imageUrl,
          scenario: work.scenario,
          style: work.style,
          color: work.color,
          size: work.size,
          budget: work.budget
        }
      });
      this.setData({
        aiReviews: this.mergeReviewInteractionState(work, result.items || [])
      });
    } catch (error) {
      // 保留本地模板点评。
    }
  },

  mergeReviewInteractionState(work, reviews) {
    if (!work) return reviews || [];
    const likeState = app.globalData.reviewLikeState || {};
    const reviewLikes = app.globalData.reviewLikeCounts || {};
    return (reviews || []).map((item) => {
      const reviewId = item.id || `${work.id}-${item.botId}`;
      const key = `${work.id}:${item.botId}`;
      const hasRealLikes = typeof reviewLikes[reviewId] === 'number';
      const likes = hasRealLikes ? reviewLikes[reviewId] : item.likes || 0;
      return Object.assign({}, item, {
        id: reviewId,
        likes: hasRealLikes ? likes : likes + (likeState[key] ? 1 : 0),
        liked: Boolean(item.liked || likeState[key])
      });
    });
  },

  ensureDemandForm(work) {
    if (!work) return;
    const form = this.data.demandForm;
    if (form.expectedDate) return;
    const budgetIndex = Math.max(this.data.budgetOptions.indexOf(work.budget), 1);
    const servingsIndex = work.size === '8寸' ? 2 : 1;
    const orderCity = app.globalData.orderCity || app.globalData.city || form.orderCity;
    const cityIndex = Math.max(this.data.cityOptions.indexOf(orderCity), 0);
    const cityProfile = getCityProfile(this.data.cityOptions[cityIndex]);
    this.setData({
      'demandForm.expectedDate': form.expectedDate || nextWeek(),
      'demandForm.orderCityIndex': cityIndex,
      'demandForm.orderCity': cityProfile.city,
      'demandForm.orderDistrict': cityProfile.district,
      'demandForm.servingsIndex': servingsIndex,
      'demandForm.servingsText': this.data.servingOptions[servingsIndex],
      'demandForm.budgetIndex': budgetIndex,
      'demandForm.budgetText': this.data.budgetOptions[budgetIndex],
      'demandForm.contact': form.contact || (app.globalData.currentUser && app.globalData.currentUser.phoneNumber) || '',
      'demandForm.deliveryWindowIndex': form.deliveryWindowIndex || 4,
      'demandForm.deliveryWindowText': form.deliveryWindowText || this.data.deliveryWindowOptions[4]
    });
  },

  buildSameStyleSummary(work) {
    const form = this.data.demandForm;
    return [
      { label: '城市时间', value: `${form.orderCity}${form.orderDistrict} · ${form.expectedDate || nextWeek()}` },
      { label: '尺寸人数', value: `${work && work.size ? work.size : '尺寸待确认'} · ${form.servingsText}` },
      { label: '口味配送', value: `${form.flavorText} · ${form.deliveryWindowText}` },
      { label: '贺卡祝福', value: form.recipientNote || '到店后再确认' }
    ];
  },

  buildAiReviews(work, game) {
    if (!work) return [];
    const baseReviews = buildBotReviewPreview(work);
    const likeState = app.globalData.reviewLikeState || {};

    return baseReviews.map((review) => {
      const reviewId = `${work.id}-${review.botId}`;
      const key = `${work.id}:${review.botId}`;
      const reviewLikes = app.globalData.reviewLikeCounts || {};
      const hasRealLikes = typeof reviewLikes[reviewId] === 'number';
      const realLikes = hasRealLikes ? reviewLikes[reviewId] : 0;
      const liked = Boolean(likeState[key]);
      return Object.assign({}, review, {
        id: reviewId,
        likes: hasRealLikes ? realLikes : realLikes + (liked ? 1 : 0),
        liked
      });
    });
  },

  buildInteraction(work) {
    if (!work) {
      const roseBalance = app.globalData.roseBalance || 0;
      return {
        votes: 0,
        roses: 0,
        voted: false,
        roseSent: false,
        roseBalance,
        roseBalanceText: `当前可用玫瑰：${roseBalance} 束`,
        emptyText: '暂无真实互动，成为第一个投票的人'
      };
    }
    const voteState = app.globalData.workVoteState || {};
    const roseState = app.globalData.workRoseState || {};
    const userInteraction = work && work.userInteraction ? work.userInteraction : {};
    const voted = Boolean(userInteraction.voted || voteState[work.id]);
    const roseSent = Boolean(userInteraction.roseSent || roseState[work.id]);
    const hasVoteCount = typeof work.voteCount === 'number';
    const hasRoseCount = typeof work.roseCount === 'number';
    const votes = hasVoteCount ? work.voteCount : (voted ? 1 : 0);
    const roses = hasRoseCount ? work.roseCount : (roseSent ? 1 : 0);
    return {
      votes,
      roses,
      voted,
      roseSent,
      roseBalance: app.globalData.roseBalance || 0,
      roseBalanceText: `当前可用玫瑰：${app.globalData.roseBalance || 0} 束`,
      emptyText: votes || roses ? '' : '暂无真实互动，成为第一个投票的人'
    };
  },

  async likeReview(event) {
    const botId = event.currentTarget.dataset.botid;
    return this.likeReviewByBotId(botId);
  },

  async likeReviewByBotId(botId) {
    const work = this.data.work;
    if (!work || !botId) return;
    const key = `${work.id}:${botId}`;
    app.globalData.reviewLikeState = app.globalData.reviewLikeState || {};
    if (app.globalData.reviewLikeState[key]) {
      wx.showToast({ title: '你已认同过', icon: 'none' });
      return;
    }
    try {
      const result = await request('/interactions', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          targetType: 'review',
          targetId: `${work.id}-${botId}`,
          action: 'like'
        }
      });
      app.globalData.reviewLikeState[key] = true;
      app.globalData.reviewLikeCounts = app.globalData.reviewLikeCounts || {};
      app.globalData.reviewLikeCounts[`${work.id}-${botId}`] = result.counts ? result.counts.likes : undefined;
      const currentReviews = this.data.aiReviews && this.data.aiReviews.length
        ? this.data.aiReviews
        : this.buildAiReviews(work, this.data.game);
      this.setData({ aiReviews: this.mergeReviewInteractionState(work, currentReviews) });
      wx.showToast({ title: '已认同点评' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'review-like',
        title: '登录后认同点评',
        beforeLogin: () => this.preserveReviewLikeForAuth(botId)
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '认同点评失败，请稍后重试'), icon: 'none' });
    }
  },

  async voteWork() {
    const work = this.data.work;
    if (!work) return;
    app.globalData.workVoteState = app.globalData.workVoteState || {};
    if (app.globalData.workVoteState[work.id] || this.data.interaction.voted) {
      wx.showToast({ title: '你已投过票', icon: 'none' });
      return;
    }
    try {
      const result = await request('/interactions', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          targetType: 'work',
          targetId: work.id,
          action: 'vote'
        }
      });
      app.globalData.workVoteState[work.id] = true;
      work.voteCount = result.counts ? result.counts.votes : work.voteCount;
      work.userInteraction = Object.assign({}, work.userInteraction || {}, { voted: true });
      app.globalData.currentWork = work;
      this.setData({ work, interaction: this.buildInteraction(work) });
      wx.showToast({ title: '投票成功' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'result-vote',
        title: '登录后投票',
        beforeLogin: () => this.preserveResultInteractionForAuth('vote')
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '投票失败，请稍后重试'), icon: 'none' });
    }
  },

  async sendRose() {
    const work = this.data.work;
    if (!work) return;
    app.globalData.workRoseState = app.globalData.workRoseState || {};
    if (app.globalData.workRoseState[work.id] || this.data.interaction.roseSent) {
      wx.showToast({ title: '你已送过玫瑰', icon: 'none' });
      return;
    }
    if ((app.globalData.roseBalance || 0) <= 0) {
      this.promptRoseCheckIn();
      return;
    }
    try {
      const result = await request('/interactions', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          targetType: 'work',
          targetId: work.id,
          action: 'rose'
        }
      });
      app.globalData.workRoseState[work.id] = true;
      app.globalData.roseBalance = result.wallet ? result.wallet.roseBalance : app.globalData.roseBalance - 1;
      work.roseCount = result.counts ? result.counts.roses : work.roseCount;
      work.userInteraction = Object.assign({}, work.userInteraction || {}, { roseSent: true });
      app.globalData.currentWork = work;
      this.setData({ work, interaction: this.buildInteraction(work) });
      wx.showToast({ title: '已送出玫瑰' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'result-rose',
        title: '登录后送玫瑰',
        beforeLogin: () => this.preserveResultInteractionForAuth('rose')
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '送玫瑰失败，请稍后重试'), icon: 'none' });
    }
  },

  promptRoseCheckIn() {
    wx.showModal({
      title: '玫瑰不足',
      content: '每天签到可领取玫瑰和积分，领取后再回来支持这款作品。',
      confirmText: '去签到',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/mine/mine' });
        }
      }
    });
  },

  onRefineInput(event) {
    this.setData({ refineNote: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ 'demandForm.description': event.detail.value });
  },

  onAddressInput(event) {
    this.setData({ 'demandForm.address': event.detail.value });
  },

  onContactInput(event) {
    this.setData({ 'demandForm.contact': event.detail.value });
  },

  onMustKeepInput(event) {
    this.setData({ 'demandForm.mustKeep': event.detail.value });
  },

  onCanAdjustInput(event) {
    this.setData({ 'demandForm.canAdjust': event.detail.value });
  },

  onRecipientNoteInput(event) {
    this.setData({ 'demandForm.recipientNote': event.detail.value });
  },

  onProductionLevelChange(event) {
    const index = Number(event.detail.value);
    const option = this.data.productionLevelOptions[index];
    this.setData({
      'demandForm.productionLevelIndex': index,
      'demandForm.productionLevelText': option.label,
      'demandForm.productionLevel': option.value
    });
  },

  switchResultTab(event) {
    const tab = event.currentTarget.dataset.tab || 'actions';
    this.setData({ activeResultTab: tab });
  },

  onExpectedDateChange(event) {
    this.setData({ 'demandForm.expectedDate': event.detail.value });
  },

  onOrderCityChange(event) {
    const index = Number(event.detail.value);
    const cityProfile = getCityProfile(this.data.cityOptions[index]);
    app.globalData.orderCity = cityProfile.city;
    app.globalData.orderDistrict = cityProfile.district;
    this.setData({
      'demandForm.orderCityIndex': index,
      'demandForm.orderCity': cityProfile.city,
      'demandForm.orderDistrict': cityProfile.district
    });
  },

  onDeliveryChange(event) {
    const index = Number(event.detail.value);
    this.setData({ 'demandForm.deliveryIndex': index, 'demandForm.deliveryText': this.data.deliveryOptions[index] });
  },

  onDeliveryWindowChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'demandForm.deliveryWindowIndex': index,
      'demandForm.deliveryWindowText': this.data.deliveryWindowOptions[index]
    });
  },

  onServingsChange(event) {
    const index = Number(event.detail.value);
    this.setData({ 'demandForm.servingsIndex': index, 'demandForm.servingsText': this.data.servingOptions[index] });
  },

  onFlavorChange(event) {
    const index = Number(event.detail.value);
    this.setData({ 'demandForm.flavorIndex': index, 'demandForm.flavorText': this.data.flavorOptions[index] });
  },

  onBudgetChange(event) {
    const index = Number(event.detail.value);
    this.setData({ 'demandForm.budgetIndex': index, 'demandForm.budgetText': this.data.budgetOptions[index] });
  },

  toggleAdjustments() {
    this.setData({ 'demandForm.allowAdjustments': !this.data.demandForm.allowAdjustments });
  },

  toggleDemandDetails() {
    this.setData({ demandDetailsOpen: !this.data.demandDetailsOpen });
  },

  toggleProductionNoticeAccepted() {
    this.setData({ 'demandForm.productionNoticeAccepted': !this.data.demandForm.productionNoticeAccepted });
  },

  async refineWork() {
    if (this.data.loading) return;
    const work = this.data.work;
    if (!work) return;

    const note = this.data.refineNote.trim() || '保留主体构思，做一个更精致、更适合落地制作的版本';

    this.setData({ loading: true });
    try {
      const result = await request(`/works/${work.id}/refine`, {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          refinement: note
        }
      });

      app.globalData.currentWork = result.work;
      app.globalData.currentDesignGame = Object.assign({}, app.globalData.currentDesignGame || {}, {
        score: Math.min(((app.globalData.currentDesignGame && app.globalData.currentDesignGame.score) || 68) + 6, 100),
        badge: '微调升级',
        challenge: (app.globalData.currentDesignGame && app.globalData.currentDesignGame.challenge) || '自由创作',
        props: (app.globalData.currentDesignGame && app.globalData.currentDesignGame.props) || [],
        rewardAmount: (app.globalData.currentDesignGame && app.globalData.currentDesignGame.rewardAmount) || 0,
        challengeId: (app.globalData.currentDesignGame && app.globalData.currentDesignGame.challengeId) || '',
        rewardStatus: (app.globalData.currentDesignGame && app.globalData.currentDesignGame.rewardStatus) || '待发布'
      });
      app.globalData.currentDemand = null;
      app.globalData.currentQuote = null;
      app.globalData.currentPayment = null;
      app.globalData.currentOrder = null;
      this.setData({
        work: result.work,
        game: app.globalData.currentDesignGame,
        aiReviews: this.buildAiReviews(result.work, app.globalData.currentDesignGame),
        interaction: this.buildInteraction(result.work),
        refineNote: ''
      });
      if (result.wallet) {
        app.globalData.creationCreditBalance = result.wallet.creationCreditBalance || app.globalData.creationCreditBalance || 0;
      }
      this.syncCreationCredits();
      wx.showToast({ title: '已生成新版本' });
    } catch (error) {
      if (isCreationCreditInsufficientError(error)) {
        await this.syncCreationCredits();
        this.setData({
          showRechargePanel: true,
          pendingAfterRecharge: 'refine'
        });
        return;
      }
      if (promptLoginRequired(error, {
        action: 'work-refine',
        title: '登录后微调作品'
      })) {
        this.preserveRefineForAuth('work-refine');
        return;
      }
      wx.showModal({
        title: 'AI 微调失败',
        content: toUserMessage(error, 'AI 微调失败，请保留当前作品或稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  todayKey() {
    const current = new Date();
    const month = `${current.getMonth() + 1}`.padStart(2, '0');
    const day = `${current.getDate()}`.padStart(2, '0');
    return `${current.getFullYear()}-${month}-${day}`;
  },

  async publishDemand() {
    if (this.data.loading) return;
    const work = this.data.work;
    if (!work) return;
    const form = this.data.demandForm;
    const deliveryMethod = form.deliveryText;
    const description = form.description.trim();
    const contact = form.contact.trim();
    const address = form.address.trim();

    if (!description || !contact || !address) {
      wx.showToast({ title: '请补全需求、地址和联系方式', icon: 'none' });
      return;
    }
    if (!form.productionNoticeAccepted) {
      wx.showToast({ title: '请先确认真实制作说明', icon: 'none' });
      return;
    }
    if (!ensureCommercialContact({
      action: 'publish-demand',
      phoneTitle: '先绑定手机号再发布需求',
      phoneContent: '发布正式制作需求前，需要已绑定手机号，方便蛋糕师联系、确认配送和售后处理。绑定完成后会自动回到当前页面。'
    })) {
      this.preserveDemandForAuth('publish-demand');
      return;
    }

    this.setData({ loading: true });
    try {
      const demand = await request('/demands', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          workId: work.id,
          title: `制作：${work.title}`,
          description: `${description}；口味偏好：${form.flavorText}；配送时间段：${form.deliveryWindowText}；收货地址：${address}`,
          city: form.orderCity,
          district: form.orderDistrict,
          expectedDate: form.expectedDate,
          budget: form.budgetText,
          servings: form.servingsText,
          deliveryMethod,
          deliveryWindow: form.deliveryWindowText,
          cakeSize: `${work.size || '尺寸待确认'} · ${form.servingsText}`,
          flavor: form.flavorText,
          recipientNote: form.recipientNote,
          productionNoticeAccepted: form.productionNoticeAccepted,
          allowAdjustments: form.allowAdjustments,
          productionLevel: form.productionLevel,
          mustKeep: form.mustKeep,
          canAdjust: form.canAdjust,
          contact
        }
      });
      app.globalData.currentDemand = demand;
      const currentGame = app.globalData.currentDesignGame || { score: 70, badge: '发布作品', challenge: '自由创作', props: [] };
      const nextScore = Math.min((currentGame.score || 70) + 20, 100);
      const rewardAmount = currentGame.rewardAmount || 0;
      app.globalData.currentDesignGame = Object.assign({}, currentGame, {
        score: nextScore,
        badge: '已发布接单',
        rewardStatus: rewardAmount ? (currentGame.rewardStatus || '任务待完成') : '无奖励任务'
      });
      app.globalData.currentOrder = {
        id: demand.id,
        title: work.title,
        city: demand.city,
        district: demand.district,
        total: 0,
        totalText: '等待报价',
        status: '已发布需求，等待报价',
        deliveryMethod: demand.deliveryMethod,
        expectedDate: demand.expectedDate
      };
      app.globalData.userScore = (app.globalData.userScore || 0) + 20;
      let completion = null;
      if (rewardAmount) {
        completion = await this.completeDesignTask(work);
      }
      this.setData({ game: app.globalData.currentDesignGame });
      let successTitle = '已发布 +20';
      let successIcon = 'success';
      if (rewardAmount) {
        if (completion && completion.status === 'pending') {
          successTitle = `灵感券待审 ${rewardAmount} 点`;
        } else if (completion && completion.status === 'login-required') {
          successTitle = '需求已发布，请重新登录同步任务';
          successIcon = 'none';
        } else if (completion && completion.status === 'sync-pending') {
          successTitle = '需求已发布，奖励待同步';
          successIcon = 'none';
        } else {
          successTitle = '需求已发布，任务待同步';
          successIcon = 'none';
        }
      }
      wx.showToast({ title: successTitle, icon: successIcon });
      wx.navigateTo({ url: '/pages/demand/demand' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'publish-demand',
        title: '登录后发布需求'
      })) {
        this.preserveDemandForAuth('publish-demand');
        return;
      }
      wx.showModal({
        title: '发布失败',
        content: toUserMessage(error, '制作需求发布失败，请稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async publishWorkToForum() {
    if (this.data.publishWorkLoading) return;
    const work = this.data.work;
    if (!work) return;
    this.setData({ publishWorkLoading: true });
    try {
      const nextWork = await request(`/works/${work.id}/publish`, {
        method: 'PATCH',
        data: {
          userId: app.globalData.userId
        }
      });
      app.globalData.currentWork = nextWork;
      this.setData({ work: nextWork });
      const completion = await this.completeDesignTask(nextWork);
      const rewardSyncPending = completion && completion.status === 'sync-pending';
      wx.showModal({
        title: '已提交审核',
        content: rewardSyncPending
          ? '作品已提交平台审核。审核通过后会进入作品广场，其他用户才能投票、送玫瑰和做同款。任务奖励会在稍后同步到我的页。'
          : '作品已提交平台审核。审核通过后会进入作品广场，其他用户才能投票、送玫瑰和做同款。',
        showCancel: false
      });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'publish-work',
        title: '登录后发布作品',
        beforeLogin: () => this.preserveResultInteractionForAuth('publish-work')
      })) {
        return;
      }
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ publishWorkLoading: false });
    }
  },

  async completeDesignTask(work) {
    const game = app.globalData.currentDesignGame || {};
    const taskId = game.challengeId || '';
    const rewardAmount = game.rewardAmount || 0;
    if (!taskId || !rewardAmount || game.rewardStatus === '灵感券待审核') {
      return { status: 'skipped' };
    }
    app.globalData.rewardWallet = app.globalData.rewardWallet || { pending: 0, approved: 0 };
    try {
      const result = await request(`/design-tasks/${taskId}/complete`, {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          workId: work.id
        }
      });
      if (result.wallet) {
        app.globalData.rewardWallet.pending = result.wallet.rewardPending;
        app.globalData.rewardWallet.approved = result.wallet.rewardApproved;
      } else if (result.created) {
        app.globalData.rewardWallet.pending = (app.globalData.rewardWallet.pending || 0) + rewardAmount;
      }
      app.globalData.completedTaskCount = (app.globalData.completedTaskCount || 0) + (result.created ? 1 : 0);
      app.globalData.currentDesignGame = Object.assign({}, game, {
        rewardStatus: '灵感券待审核',
        badge: game.badge || '任务完成'
      });
      this.setData({ game: app.globalData.currentDesignGame });
      return {
        status: 'pending',
        created: Boolean(result.created)
      };
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'task-complete',
        title: '登录后完成任务'
      })) {
        return { status: 'login-required' };
      }
      app.globalData.currentDesignGame = Object.assign({}, game, {
        rewardStatus: '任务奖励待同步',
        badge: game.badge || '任务待同步'
      });
      this.setData({ game: app.globalData.currentDesignGame });
      return { status: 'sync-pending' };
    }
  },

  goDesign() {
    wx.navigateTo({ url: '/pages/design/design' });
  },

  onShareAppMessage() {
    return {
      title: this.data.work ? `我用如意鲜果蛋糕设计了 ${this.data.work.title}` : '如意鲜果蛋糕 AI 设计',
      path: '/pages/home/home'
    };
  }
});
