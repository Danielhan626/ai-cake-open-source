const { request, nextWeek, toUserMessage, isLoginRequiredError } = require('../../utils/api');
const { ensureCommercialContact, promptLoginRequired } = require('../../utils/auth');
const { getCityProfile, getSupportedCities } = require('../../utils/city');
const app = getApp();

Page({
  data: {
    demand: null,
    demandDraft: null,
    work: null,
    workCopy: '',
    productionLevelDisplay: '需要沟通',
    demandSummary: [],
    demandNextStep: null,
    quoteDemandSummary: [],
    quoteGuidance: [],
    buyerReviewing: false,
    buyerQuoting: false,
    buyerSelected: false,
    buyerClosed: false,
    baker: null,
    isBakerMode: false,
    publishing: false,
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
    quoteDecisionOptions: [
      { label: '按图接近制作', value: 'as_designed' },
      { label: '建议调整后制作', value: 'with_adjustments' },
      { label: '暂不接单', value: 'decline' }
    ],
    restorationOptions: ['高度接近', '主体接近', '需要二次改稿'],
    productionDayOptions: ['1天', '2天', '3天', '5天'],
    quoteForm: {
      decisionIndex: 1,
      decisionText: '建议调整后制作',
      decision: 'with_adjustments',
      amount: '',
      deliveryFee: '',
      restorationIndex: 1,
      restorationText: '主体接近',
      deliveryWindowIndex: 4,
      deliveryWindowText: '定时需确认',
      scheduledDeliverySupported: true,
      productionDaysIndex: 1,
      productionDaysText: '2天',
      availableDate: '',
      message: '',
      adjustmentNote: '',
      changeDeadline: '',
      cancelPolicy: '',
      signoffNote: ''
    },
    loading: false,
    pendingQuoteAction: '',
    pendingQuoteDemandId: '',
    pendingQuoteBakerId: '',
    quoteEntryMode: ''
  },

  onLoad(options = {}) {
    if (options.entry === 'quote') {
      app.globalData.currentDemandEntry = 'quote';
    }
  },

  async onShow() {
    const demand = app.globalData.currentDemand || null;
    const demandDraft = app.globalData.currentDemandDraft || null;
    const work = app.globalData.currentWork || null;
    const isBakerMode = app.globalData.accountRole === 'baker';
    const nextData = {
      demand,
      demandDraft,
      work,
      workCopy: this.buildWorkCopy(work, demand, demandDraft),
      productionLevelDisplay: this.productionLevelText(demand ? demand.productionLevel : ''),
      demandSummary: this.buildDemandSummary(demand, demandDraft),
      demandNextStep: this.buildDemandNextStep(demand, isBakerMode),
      quoteDemandSummary: this.buildQuoteDemandSummary(demand),
      quoteGuidance: this.buildQuoteGuidance(demand),
      buyerReviewing: !isBakerMode && Boolean(demand) && (demand.status === 'reviewing' || demand.reviewStatus !== 'approved'),
      buyerQuoting: !isBakerMode && Boolean(demand) && demand.reviewStatus === 'approved' && demand.status === 'quoting',
      buyerSelected: !isBakerMode && Boolean(demand) && demand.status === 'selected',
      buyerClosed: !isBakerMode && Boolean(demand) && demand.status === 'closed',
      isBakerMode,
      'quoteForm.availableDate': this.defaultAvailableDate(),
      'quoteForm.deliveryWindowText': (demand && demand.deliveryWindow) || this.data.quoteForm.deliveryWindowText,
      'quoteForm.deliveryWindowIndex': Math.max(
        this.data.deliveryWindowOptions.indexOf((demand && demand.deliveryWindow) || this.data.quoteForm.deliveryWindowText),
        0
      ),
      pendingQuoteDemandId: '',
      pendingQuoteBakerId: '',
      quoteEntryMode: app.globalData.currentDemandEntry === 'quote' ? 'quote' : ''
    };
    if (!demand && demandDraft && work) {
      nextData.demandForm = this.buildDemandForm(work, demandDraft);
    }
    const pendingDemandDraft =
      typeof app.consumePendingAuthDraft === 'function' ? app.consumePendingAuthDraft('publish-draft-demand') : null;
    if (pendingDemandDraft && pendingDemandDraft.demandForm) {
      nextData.demandForm = Object.assign({}, nextData.demandForm || this.data.demandForm, pendingDemandDraft.demandForm);
    }
    const pendingQuoteDraft =
      typeof app.consumePendingAuthDraft === 'function' ? app.consumePendingAuthDraft('create-quote') : null;
    if (pendingQuoteDraft && pendingQuoteDraft.quoteForm) {
      nextData.quoteForm = Object.assign({}, this.data.quoteForm, pendingQuoteDraft.quoteForm);
      nextData.pendingQuoteAction = pendingQuoteDraft.action === 'create-quote' ? 'create-quote' : '';
      nextData.pendingQuoteDemandId = pendingQuoteDraft.demandId || '';
      nextData.pendingQuoteBakerId = pendingQuoteDraft.bakerId || '';
    }
    this.setData(nextData);
    await this.syncCurrentBakerProfile();
    await this.loadBaker();
    this.resumePendingQuoteSubmission();
    if (this.data.quoteEntryMode === 'quote') {
      app.globalData.currentDemandEntry = '';
      this.scrollToQuoteForm();
    }
  },

  scrollToQuoteForm() {
    if (typeof wx.pageScrollTo !== 'function') return;
    setTimeout(() => {
      wx.pageScrollTo({
        selector: '.quote-form',
        duration: 240
      });
    }, 240);
  },

  preserveDraftDemandForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      demandForm: Object.assign({}, this.data.demandForm),
      workId: this.data.work && this.data.work.id,
      demandDraftTitle: this.data.demandDraft && this.data.demandDraft.title
    });
  },

  preserveQuoteForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      quoteForm: Object.assign({}, this.data.quoteForm),
      demandId: this.data.demand && this.data.demand.id,
      bakerId: this.data.baker && this.data.baker.id,
      action
    });
  },

  resumePendingQuoteSubmission() {
    if (this.data.pendingQuoteAction !== 'create-quote') return;
    if (!this.data.demand || !this.data.baker) return;
    if (this.data.pendingQuoteDemandId && this.data.pendingQuoteDemandId !== this.data.demand.id) return;
    if (this.data.pendingQuoteBakerId && this.data.pendingQuoteBakerId !== this.data.baker.id) return;
    this.setData({ pendingQuoteAction: '' });
    setTimeout(() => {
      this.createQuote();
    }, 180);
  },

  currentBakerProfile() {
    const profile = app.globalData.bakerProfile || {};
    if (!app.globalData.bakerId || !profile.userId) return null;
    return {
      id: app.globalData.bakerId,
      userId: profile.userId,
      name: profile.name || '当前蛋糕店',
      city: profile.city || app.globalData.orderCity || app.globalData.city || '长治',
      district: profile.district || app.globalData.orderDistrict || app.globalData.district || '潞州区',
      deliveryRadiusKm: Number((`${profile.serviceRange || ''}`.match(/\d+/) || ['0'])[0]),
      startingPrice: profile.startingPrice || 0,
      specialties: profile.specialties || [],
      reviewStatus: this.normalizeCurrentBakerReviewStatus(profile)
    };
  },

  normalizeCurrentBakerReviewStatus(profile) {
    if (!profile) return '';
    if (profile.reviewStatus) return profile.reviewStatus;
    if (profile.verifyStatus === '待平台审核') return 'pending';
    if (profile.verifyStatus === '审核未通过' || profile.verifyStatus === '待重新提交') return 'rejected';
    return '';
  },

  defaultAvailableDate() {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  },

  async loadBaker() {
    const currentBaker = this.currentBakerProfile();
    if (this.data.isBakerMode) {
      this.setData({ baker: currentBaker });
      return;
    }
    this.setData({ baker: null });
  },

  async syncCurrentBakerProfile() {
    if (!this.data.isBakerMode || !app.globalData.currentUser) {
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
    } catch (error) {
      if (isLoginRequiredError(error)) {
        return;
      }
      // 网络波动时保留当前设备上的商家资料，避免报价页误清空。
    }
  },

  resolveOrderCity() {
    if (this.data.demand && this.data.demand.city) {
      return this.data.demand.city;
    }
    if (this.data.demandDraft && this.data.demandDraft.city) {
      return this.data.demandDraft.city;
    }
    if (this.data.demandForm && this.data.demandForm.orderCity) {
      return this.data.demandForm.orderCity;
    }
    return app.globalData.orderCity || app.globalData.city || '长治';
  },

  buildWorkCopy(work, demand, draft) {
    if (demand && demand.description) return demand.description;
    if (draft && draft.description) return draft.description;
    if (work && work.prompt) return work.prompt;
    return '';
  },

  buildDemandSummary(demand, draft) {
    const item = demand || draft || {};
    if (!demand && !draft) return [];
    return [
      { label: '城市', value: `${item.city || this.data.demandForm.orderCity}${item.district || this.data.demandForm.orderDistrict || ''}` },
      { label: '日期', value: item.expectedDate || this.data.demandForm.expectedDate || nextWeek() },
      { label: '时间', value: item.deliveryWindow || this.data.demandForm.deliveryWindowText || '定时需确认' },
      { label: '预算', value: item.budget || this.data.demandForm.budgetText },
      { label: '尺寸口味', value: `${item.cakeSize || item.servings || this.data.demandForm.servingsText} · ${item.flavor || this.data.demandForm.flavorText}` },
      { label: '方式', value: item.deliveryMethod || this.data.demandForm.deliveryText }
    ];
  },

  buildDemandNextStep(demand, isBakerMode) {
    if (!demand) return null;
    if (isBakerMode) {
      if (demand.reviewStatus !== 'approved' || demand.status !== 'quoting') {
        return {
          title: '先等平台审核',
          desc: '审核通过后这条需求才会对师傅开放报价，避免未确认图片和联系方式直接流入交易。'
        };
      }
      return {
        title: '确认能否承接',
        desc: '先看图片、日期、预算和制作沟通等级，再给出报价、调整建议或暂不接单回复。'
      };
    }
    if (demand.status === 'reviewing' || demand.reviewStatus !== 'approved') {
      return {
        title: '等待平台审核',
        desc: '审核通过后同城蛋糕师可以看到需求并报价，你不用重复提交。'
      };
    }
    if (demand.status === 'quoting') {
      return {
        title: '等待师傅报价',
        desc: '师傅会按图、预算、日期和可调整范围回复，之后你再选择合适报价。'
      };
    }
    if (demand.status === 'selected') {
      return {
        title: '已选择报价',
        desc: '下一步在订单里跟进制作确认、配送或自提，以及售后记录。'
      };
    }
    return {
      title: '需求已关闭',
      desc: '可以回到设计页重新发布一条更清楚的制作需求。'
    };
  },

  buildQuoteDemandSummary(demand) {
    if (!demand) return [];
    return [
      { label: '用户要做', value: demand.title || '同款 AI 蛋糕' },
      { label: '城市日期', value: `${demand.city || '长治'}${demand.district || ''} · ${demand.expectedDate || '待确认'}` },
      { label: '配送时间', value: `${demand.deliveryMethod || '配送待沟通'} · ${demand.deliveryWindow || '时间待确认'}` },
      { label: '尺寸口味', value: `${demand.cakeSize || demand.servings || '尺寸待沟通'} · ${demand.flavor || '口味待沟通'}` },
      { label: '预算人数', value: `${demand.budget || '待报价'} · ${demand.servings || '人数待沟通'}` },
      { label: '保留重点', value: demand.mustKeep || '看图确认主体和装饰' }
    ];
  },

  buildQuoteGuidance(demand) {
    if (!demand) return [];
    return [
      '报价只承诺你能确认的材料、结构和交付日期。',
      `用户期望${demand.deliveryWindow || '时间待确认'}，定时配送需要在报价里写清楚。`,
      '不能还原的装饰请写进调整说明，避免用户误解。',
      demand.allowAdjustments ? '用户允许师傅按真实制作调整。' : '用户暂不允许大幅调整，请谨慎报价。'
    ];
  },

  productionLevelText(value) {
    const match = this.data.productionLevelOptions.find((item) => item.value === value);
    return match ? match.label : '需要沟通';
  },

  buildDemandForm(work, draft) {
    const form = this.data.demandForm;
    const budgetText = draft.budget || work.budget || form.budgetText || '200-399元';
    const budgetIndex = Math.max(this.data.budgetOptions.indexOf(budgetText), 1);
    const servingsText = draft.servings || (work.size === '8寸' ? '8-10人' : form.servingsText || '4-6人');
    const servingsIndex = Math.max(this.data.servingOptions.indexOf(servingsText), 1);
    const deliveryText = draft.deliveryMethod || form.deliveryText || '同城配送';
    const deliveryIndex = Math.max(this.data.deliveryOptions.indexOf(deliveryText), 0);
    const deliveryWindowText = draft.deliveryWindow || form.deliveryWindowText || '定时需确认';
    const resolvedDeliveryWindowIndex = this.data.deliveryWindowOptions.indexOf(deliveryWindowText);
    const deliveryWindowIndex = resolvedDeliveryWindowIndex >= 0 ? resolvedDeliveryWindowIndex : 4;
    const flavorText = draft.flavor || form.flavorText || '口味待沟通';
    const resolvedFlavorIndex = this.data.flavorOptions.indexOf(flavorText);
    const flavorIndex = resolvedFlavorIndex >= 0 ? resolvedFlavorIndex : 4;
    const contact = app.globalData.currentUser && app.globalData.currentUser.phoneNumber
      ? app.globalData.currentUser.phoneNumber
      : draft.contact || form.contact || '';
    const orderCity = draft.city || app.globalData.orderCity || app.globalData.city || form.orderCity;
    const cityIndex = Math.max(this.data.cityOptions.indexOf(orderCity), 0);
    const cityProfile = getCityProfile(this.data.cityOptions[cityIndex]);

    return Object.assign({}, form, {
      expectedDate: form.expectedDate || nextWeek(),
      orderCityIndex: cityIndex,
      orderCity: cityProfile.city,
      orderDistrict: cityProfile.district,
      deliveryIndex,
      deliveryText: this.data.deliveryOptions[deliveryIndex],
      deliveryWindowIndex,
      deliveryWindowText: this.data.deliveryWindowOptions[deliveryWindowIndex],
      servingsIndex,
      servingsText: this.data.servingOptions[servingsIndex],
      flavorIndex,
      flavorText: this.data.flavorOptions[flavorIndex],
      budgetIndex,
      budgetText: this.data.budgetOptions[budgetIndex],
      address: form.address || '',
      contact,
      description: form.description || '',
      productionLevel: draft.productionLevel || form.productionLevel || 'discuss',
      productionLevelText: form.productionLevelText || '需要沟通',
      mustKeep: form.mustKeep || '',
      canAdjust: form.canAdjust || '',
      recipientNote: form.recipientNote || draft.recipientNote || '',
      productionNoticeAccepted: Boolean(form.productionNoticeAccepted || draft.productionNoticeAccepted)
    });
  },

  async publishDraftDemand() {
    if (this.data.publishing) return;
    const work = this.data.work;
    const draft = this.data.demandDraft;
    if (!work || !draft) return;

    const form = this.data.demandForm;
    const description = form.description.trim();
    const address = form.address.trim();
    const contact = form.contact.trim();

    if (!description || !address || !contact) {
      wx.showToast({ title: '请补全需求、地址和联系方式', icon: 'none' });
      return;
    }
    if (!form.productionNoticeAccepted) {
      wx.showToast({ title: '请先确认真实制作说明', icon: 'none' });
      return;
    }
    if (!ensureCommercialContact({
      action: 'publish-draft-demand',
      phoneTitle: '先绑定手机号再发布需求',
      phoneContent: '发布正式制作需求前，需要已绑定手机号，方便蛋糕师联系、确认配送和售后处理。绑定完成后会自动回到当前页面。'
    })) {
      this.preserveDraftDemandForAuth('publish-draft-demand');
      return;
    }

    this.setData({ publishing: true });
    try {
      const demand = await request('/demands', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          workId: work.id,
          title: draft.title || `做同款：${work.title}`,
          description: `${description}；口味偏好：${form.flavorText}；配送时间段：${form.deliveryWindowText}；收货地址：${address}`,
          city: form.orderCity,
          district: form.orderDistrict,
          expectedDate: form.expectedDate,
          budget: form.budgetText,
          servings: form.servingsText,
          deliveryMethod: form.deliveryText,
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
      app.globalData.currentDemandDraft = null;
      app.globalData.currentQuote = null;
      app.globalData.currentPayment = null;
      app.globalData.currentOrder = {
        id: demand.id,
        title: work.title,
        city: demand.city,
        district: demand.district,
        total: 0,
        totalText: '等待报价',
        status: '已发布同款需求，等待审核和报价',
        deliveryMethod: demand.deliveryMethod,
        expectedDate: demand.expectedDate
      };
      this.setData({
        demand,
        demandDraft: null,
        demandSummary: this.buildDemandSummary(demand, null),
        demandNextStep: this.buildDemandNextStep(demand, this.data.isBakerMode),
        quoteDemandSummary: this.buildQuoteDemandSummary(demand),
        quoteGuidance: this.buildQuoteGuidance(demand),
        buyerReviewing: !this.data.isBakerMode && (demand.status === 'reviewing' || demand.reviewStatus !== 'approved'),
        buyerQuoting: !this.data.isBakerMode && demand.reviewStatus === 'approved' && demand.status === 'quoting',
        buyerSelected: !this.data.isBakerMode && demand.status === 'selected',
        buyerClosed: !this.data.isBakerMode && demand.status === 'closed'
      });
      wx.showModal({
        title: '已发布制作需求',
        content: '需求已进入平台审核。审核通过后，附近蛋糕师傅可以看到图片、预算和配送信息并报价。',
        showCancel: false
      });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'publish-draft-demand',
        title: '登录后发布需求'
      })) {
        this.preserveDraftDemandForAuth('publish-draft-demand');
        return;
      }
      wx.showModal({
        title: '发布失败',
        content: toUserMessage(error, '制作需求发布失败，请稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ publishing: false });
    }
  },

  async createQuote() {
    if (this.data.loading) return;
    if (!this.data.demand) return;
    if (!this.data.baker || !this.data.baker.id || !this.data.baker.userId) {
      wx.showModal({
        title: '请先完成商家入驻',
        content: '提交报价需要使用已入驻并通过审核的蛋糕店账号。请先到我的页完善入驻资料，等待平台审核通过后再报价。',
        confirmText: '去入驻',
        cancelText: '稍后',
        success: (result) => {
          if (result.confirm) {
            wx.navigateTo({ url: '/pages/onboarding/onboarding' });
          }
        }
      });
      return;
    }
    if (this.data.baker.reviewStatus !== 'approved') {
      wx.showModal({
        title: '入驻资料待审核',
        content: '平台审核通过后才会开放对外报价。你可以先补充资料、完善作品集，审核完成后再来接单。',
        showCancel: false
      });
      return;
    }
    if (this.data.demand.reviewStatus !== 'approved' || this.data.demand.status !== 'quoting') {
      wx.showModal({
        title: '需求待审核',
        content: '制作需求需要平台审核通过后，才会进入接单广场并允许蛋糕师报价。',
        showCancel: false
      });
      return;
    }
    const form = this.data.quoteForm;
    const amount = Number(form.amount);
    const deliveryFee = Number(form.deliveryFee);
    const productionDays = Number(form.productionDaysText.replace('天', ''));
    if (form.decision !== 'decline' && (!amount || amount <= 0)) {
      wx.showToast({ title: '请填写蛋糕价格', icon: 'none' });
      return;
    }
    if (deliveryFee < 0) {
      wx.showToast({ title: '配送费不能小于 0', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const quote = await request('/quotes', {
        method: 'POST',
        data: {
          userId: this.data.baker.userId,
          demandId: this.data.demand.id,
          bakerId: this.data.baker.id,
          amount,
          deliveryFee,
          availableDate: form.availableDate,
          productionDays,
          decision: form.decision,
          restorationLevel: form.restorationText,
          deliveryWindow: form.deliveryWindowText,
          scheduledDeliverySupported: form.scheduledDeliverySupported,
          changeDeadline: form.changeDeadline,
          cancelPolicy: form.cancelPolicy,
          signoffNote: form.signoffNote,
          adjustmentNote: form.adjustmentNote,
          message: form.message
        }
      });
      app.globalData.currentQuote = quote;
      if (quote.decision === 'decline') {
        wx.showModal({
          title: '已回复暂不接单',
          content: '这条回复会帮助用户理解当前制作条件。用户仍可等待其他蛋糕师报价或调整需求。',
          showCancel: false
        });
        return;
      }
      app.globalData.currentOrder = Object.assign({}, app.globalData.currentOrder || {}, {
        title: app.globalData.currentWork ? app.globalData.currentWork.title : this.data.demand.title,
        city: this.data.demand.city,
        district: this.data.demand.district,
        total: quote.amount + quote.deliveryFee,
        totalText: `¥${quote.amount + quote.deliveryFee}`,
        status: '蛋糕师已报价，待用户确认',
        deliveryMethod: this.data.demand.deliveryMethod,
        expectedDate: this.data.demand.expectedDate
      });
      wx.showToast({ title: '已生成报价' });
      wx.navigateTo({ url: '/pages/quotes/quotes' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'create-quote',
        title: '登录后提交报价'
      })) {
        this.preserveQuoteForAuth('create-quote');
        return;
      }
      wx.showToast({ title: error.message || '报价失败，请确认需求和资质已审核', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDesign() {
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  goQuotes() {
    wx.navigateTo({ url: '/pages/quotes/quotes' });
  },

  goBakers() {
    wx.switchTab({ url: '/pages/bakers/bakers' });
  },

  goOnboarding() {
    app.globalData.accountRole = 'baker';
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  },

  onAmountInput(event) {
    this.setData({ 'quoteForm.amount': event.detail.value });
  },

  onDeliveryFeeInput(event) {
    this.setData({ 'quoteForm.deliveryFee': event.detail.value });
  },

  onProductionDaysChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'quoteForm.productionDaysIndex': index,
      'quoteForm.productionDaysText': this.data.productionDayOptions[index]
    });
  },

  onAvailableDateChange(event) {
    this.setData({ 'quoteForm.availableDate': event.detail.value });
  },

  onQuoteRestorationChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'quoteForm.restorationIndex': index,
      'quoteForm.restorationText': this.data.restorationOptions[index]
    });
  },

  onQuoteDeliveryWindowChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'quoteForm.deliveryWindowIndex': index,
      'quoteForm.deliveryWindowText': this.data.deliveryWindowOptions[index]
    });
  },

  onQuoteDecisionChange(event) {
    const index = Number(event.detail.value);
    const option = this.data.quoteDecisionOptions[index];
    const next = {
      'quoteForm.decisionIndex': index,
      'quoteForm.decisionText': option.label,
      'quoteForm.decision': option.value
    };
    if (option.value === 'decline') {
      next['quoteForm.amount'] = '0';
      next['quoteForm.deliveryFee'] = '0';
      next['quoteForm.scheduledDeliverySupported'] = false;
      next['quoteForm.message'] = '暂不接单：当前工期、材料或结构条件不适合承接这款蛋糕。';
      next['quoteForm.adjustmentNote'] = '建议用户保留创意，等待其他蛋糕师报价，或接受师傅二次改稿后再发布。';
    }
    this.setData(next);
  },

  onQuoteMessageInput(event) {
    this.setData({ 'quoteForm.message': event.detail.value });
  },

  onAdjustmentInput(event) {
    this.setData({ 'quoteForm.adjustmentNote': event.detail.value });
  },

  onChangeDeadlineInput(event) {
    this.setData({ 'quoteForm.changeDeadline': event.detail.value });
  },

  onCancelPolicyInput(event) {
    this.setData({ 'quoteForm.cancelPolicy': event.detail.value });
  },

  onSignoffNoteInput(event) {
    this.setData({ 'quoteForm.signoffNote': event.detail.value });
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

  onRecipientNoteInput(event) {
    this.setData({ 'demandForm.recipientNote': event.detail.value });
  },

  onMustKeepInput(event) {
    this.setData({ 'demandForm.mustKeep': event.detail.value });
  },

  onCanAdjustInput(event) {
    this.setData({ 'demandForm.canAdjust': event.detail.value });
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

  toggleScheduledDelivery() {
    this.setData({ 'quoteForm.scheduledDeliverySupported': !this.data.quoteForm.scheduledDeliverySupported });
  },

  toggleProductionNoticeAccepted() {
    this.setData({ 'demandForm.productionNoticeAccepted': !this.data.demandForm.productionNoticeAccepted });
  },

  toggleDemandDetails() {
    this.setData({ demandDetailsOpen: !this.data.demandDetailsOpen });
  }
});
