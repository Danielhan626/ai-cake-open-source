const { request, toUserMessage, uploadLocalFile, isLoginRequiredError } = require('../../utils/api');
const { ensureCommercialContact, promptLoginRequired, goLogin: openAuthLogin } = require('../../utils/auth');
const { runWithPrivacy } = require('../../utils/privacy');
const app = getApp();

Page({
  data: {
    order: null,
    orders: [],
    work: null,
    demand: null,
    quote: null,
    payment: null,
    delivery: null,
    steps: [],
    orderNextStep: null,
    orderActionButtons: [],
    orderSummary: [],
    orderRuleCards: [],
    refundEligible: false,
    loading: false,
    loadError: '',
    requiresLogin: false,
    pendingRefundAction: '',
    refundPanelOpen: false,
    refundSubmitting: false,
    orderSource: 'none',
    pendingRefundOrderId: '',
    refundRequestSubmitted: false,
    refundForm: {
      reason: '',
      description: '',
      requestedAmount: '',
      evidenceNote: '',
      evidenceImages: [],
      contact: ''
    },
    refundRequests: []
  },

  onShow() {
    this.restorePendingRefundForAuth();
    this.loadOrders();
  },

  restorePendingRefundForAuth() {
    if (typeof app.consumePendingAuthDraft !== 'function') return;
    const requestRefundDraft = app.consumePendingAuthDraft('request-refund');
    const uploadEvidenceDraft = app.consumePendingAuthDraft('upload-refund-evidence');
    const pendingAuthDraft = requestRefundDraft || uploadEvidenceDraft;
    if (!pendingAuthDraft || !pendingAuthDraft.refundForm) return;
    this.setData({
      pendingRefundAction: requestRefundDraft ? 'request-refund' : '',
      pendingRefundOrderId: pendingAuthDraft.orderId || '',
      refundPanelOpen: true,
      refundForm: Object.assign({}, this.data.refundForm, pendingAuthDraft.refundForm)
    });
  },

  preserveRefundForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      refundForm: Object.assign({}, this.data.refundForm),
      orderId: this.data.order && this.data.order.id
    });
  },

  appendRefundEvidenceImages(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    this.setData({
      'refundForm.evidenceImages': this.data.refundForm.evidenceImages.concat(urls).slice(0, 6)
    });
  },

  async loadOrders() {
    this.setData({ loading: true, loadError: '' });
    try {
      const orders = await request(`/orders?userId=${app.globalData.userId}`);
      if (orders && orders.length) {
        this.applyBackendOrders(orders);
        return;
      }
      this.clearOrderSurface();
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.clearOrderSurface({
          loadError: '请先完成微信登录后查看服务器订单。',
          requiresLogin: true
        });
        return;
      }
      const cachedOrder = this.cachedServerOrder();
      if (cachedOrder) {
        this.applyCachedServerOrder(
          cachedOrder,
          toUserMessage(error, '订单同步失败，当前显示最近一次同步到本机的服务器订单快照。')
        );
        return;
      }
      this.clearOrderSurface({
        loadError: toUserMessage(error, '订单同步失败，请稍后重试。'),
        requiresLogin: false
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyBackendOrders(orders) {
    const formatted = orders.map((item) => this.presentOrder(item));
    const preferredOrder = this.data.pendingRefundOrderId
      ? formatted.find((item) => item.id === this.data.pendingRefundOrderId)
      : null;
    const latest = preferredOrder || formatted[0] || null;
    const raw = latest && latest.raw ? latest.raw : null;
    const work = raw && raw.work ? raw.work : null;
    const demand = raw && raw.demand ? raw.demand : null;
    const quote = raw && raw.quote ? raw.quote : null;
    const payment = raw && raw.payment ? raw.payment : null;

    if (latest) {
      app.globalData.currentOrder = latest;
      app.globalData.currentWork = work;
      app.globalData.currentDemand = demand;
      app.globalData.currentQuote = quote;
      app.globalData.currentPayment = payment;
    }

    this.setData({
      orders: formatted,
      order: latest,
      work,
      demand,
      quote,
      payment,
      delivery: this.deliveryFromOrder(raw),
      steps: this.buildSteps(latest, demand, quote, payment),
      orderNextStep: this.buildOrderNextStep(latest, demand, quote, payment),
      orderActionButtons: this.buildOrderActionButtons(latest, demand, quote, payment),
      orderSummary: this.buildOrderSummary(latest, demand, quote),
      orderRuleCards: this.buildOrderRuleCards(latest, demand, quote),
      refundEligible: this.canRequestRefund(latest),
      refundRequestSubmitted: false,
      orderSource: latest ? 'server' : 'none'
    });
    this.loadRefundRequests();
    this.resumePendingRefundAction();
    if (this.data.requiresLogin) {
      this.setData({ requiresLogin: false });
    }
  },

  clearOrderSurface(options = {}) {
    this.setData({
      loadError: options.loadError || '',
      requiresLogin: Boolean(options.requiresLogin),
      orders: [],
      order: null,
      work: null,
      demand: null,
      quote: null,
      payment: null,
      delivery: null,
      steps: [],
      orderNextStep: null,
      orderActionButtons: [],
      orderSummary: [],
      orderRuleCards: [],
      refundEligible: false,
      pendingRefundOrderId: '',
      refundRequestSubmitted: false,
      orderSource: 'none'
    });
  },

  cachedServerOrder() {
    const order = app.globalData.currentOrder || null;
    return order && order.raw ? order : null;
  },

  applyCachedServerOrder(order, loadError) {
    if (this.data.pendingRefundOrderId && this.data.pendingRefundOrderId !== order.id) {
      this.clearOrderSurface({
        loadError: '登录后要继续处理的退款订单暂未同步，请联网后重试。'
      });
      return;
    }
    const raw = order && order.raw ? order.raw : null;
    const work = raw && raw.work ? raw.work : app.globalData.currentWork || null;
    const demand = raw && raw.demand ? raw.demand : app.globalData.currentDemand || null;
    const quote = raw && raw.quote ? raw.quote : app.globalData.currentQuote || null;
    const payment = raw && raw.payment ? raw.payment : app.globalData.currentPayment || null;

    app.globalData.currentOrder = order;
    app.globalData.currentWork = work;
    app.globalData.currentDemand = demand;
    app.globalData.currentQuote = quote;
    app.globalData.currentPayment = payment;

    this.setData({
      loadError,
      requiresLogin: false,
      orders: [order],
      order,
      work,
      demand,
      quote,
      payment,
      delivery: this.deliveryFromOrder(raw),
      steps: this.buildSteps(order, demand, quote, payment),
      orderNextStep: this.buildOrderNextStep(order, demand, quote, payment),
      orderActionButtons: this.buildOrderActionButtons(order, demand, quote, payment),
      orderSummary: this.buildOrderSummary(order, demand, quote),
      orderRuleCards: this.buildOrderRuleCards(order, demand, quote),
      refundEligible: this.canRequestRefund(order),
      refundRequestSubmitted: false,
      orderSource: 'cached-server'
    });
    this.loadRefundRequests();
    this.resumePendingRefundAction();
  },

  resumePendingRefundAction() {
    if (this.data.pendingRefundAction !== 'request-refund') return;
    if (!this.data.order) return;
    if (this.data.pendingRefundOrderId && this.data.pendingRefundOrderId !== this.data.order.id) {
      this.setData({ pendingRefundAction: '', pendingRefundOrderId: '' });
      return;
    }
    this.setData({ pendingRefundAction: '', pendingRefundOrderId: '' });
    setTimeout(() => {
      this.requestRefund();
    }, 180);
  },

  presentOrder(order) {
    const work = order && order.work ? order.work : null;
    return {
      id: order.id,
      title: work ? work.title : order.demand ? order.demand.title : 'AI 蛋糕订单',
      city: order.city,
      district: order.district,
      total: order.amount || order.total || 0,
      totalText: order.totalText || (order.amount ? `¥${order.amount}` : '待报价'),
      status: order.statusText || order.status || '已确认报价意向',
      paymentStatus: order.payment ? this.paymentStatusText(order.payment.status, order.payment.tradeStateDesc) : '',
      deliveryMethod: order.deliveryMethod,
      expectedDate: order.expectedDate,
      fulfillmentStatus: order.fulfillment ? this.fulfillmentText(order.fulfillment.status) : '待制作确认',
      raw: order
    };
  },

	  deliveryFromOrder(order) {
    if (!order || !order.fulfillment) return null;
    const fulfillment = order.fulfillment;
    const hasCourier = Boolean(fulfillment.courierName || fulfillment.courierPhone);
    return {
      name: fulfillment.courierName || '待商家确认',
      phone: fulfillment.courierPhone || '',
      hasCourier,
      status: this.fulfillmentText(fulfillment.status),
      eta: fulfillment.eta || '等待蛋糕师确认制作排期',
      note: fulfillment.note || '平台已记录订单履约状态；配送联系人和轨迹会在商家确认后显示。'
    };
  },

  fulfillmentText(status) {
    const textMap = {
      created: '等待蛋糕师确认',
      baker_confirmed: '蛋糕师已确认',
      producing: '制作中',
      ready: '待配送/自提',
      delivering_or_pickup: '配送/自提中',
      completed: '已完成',
      disputed: '售后处理中'
    };
    return textMap[status] || '等待更新';
  },

  paymentStatusText(status, note) {
    const map = {
      pending: '支付确认中',
      paid: '已支付',
      failed: '支付失败',
      refunded: '已退款'
    };
    if (note) {
      return note;
    }
    return map[status] || '待确认';
  },

  buildSteps(order, demand, quote, payment) {
    const raw = order && order.raw ? order.raw : null;
    const fulfillment = raw && raw.fulfillment ? raw.fulfillment : null;
    const fulfillmentStatus = fulfillment ? fulfillment.status : '';
    return [
      { title: '完成设计', done: Boolean(order) },
      { title: '发布需求', done: Boolean(demand) },
      { title: '蛋糕师报价', done: Boolean(quote) },
      { title: '确认报价', done: Boolean(payment || raw) },
      { title: '制作配送', done: ['baker_confirmed', 'producing', 'ready', 'delivering_or_pickup', 'completed'].includes(fulfillmentStatus) }
    ];
  },

  buildOrderSummary(order, demand, quote) {
    if (!order) return [];
    const raw = order.raw || {};
    const fulfillment = raw.fulfillment || {};
    return [
      { label: '订单状态', value: order.status || '待更新' },
      { label: '支付状态', value: order.paymentStatus || '待确认' },
      { label: '履约状态', value: order.fulfillmentStatus || '待制作确认' },
      { label: '联系入口', value: fulfillment.courierPhone ? '已确认联系人' : '等待商家确认' }
    ];
  },

  buildOrderRuleCards(order, demand, quote) {
    if (!order) return [];
    const raw = order.raw || {};
    const fulfillmentStatus = raw.fulfillment ? raw.fulfillment.status : '';
    const productionStarted = ['producing', 'ready', 'delivering_or_pickup', 'completed'].includes(fulfillmentStatus);
    return [
      {
        title: '改信息',
        value: productionStarted
          ? '制作或配送已开始，先联系师傅确认是否还能调整。'
          : (quote && quote.changeDeadline) || '蛋糕师确认开做前，尽快联系平台或师傅修改。'
      },
      {
        title: '取消',
        value: productionStarted
          ? '制作、备料或配送中，取消需按实际损耗协商。'
          : (quote && quote.cancelPolicy) || '开做前可沟通取消，具体以师傅报价规则为准。'
      },
      {
        title: '签收',
        value: (quote && quote.signoffNote) || '签收前检查外观、祝福牌和配送完整度，问题请先拍照。'
      },
      {
        title: '售后',
        value: '订单完成后可提交问题说明和证据，平台再协助商家协商处理。'
      }
    ];
  },

  buildOrderNextStep(order, demand, quote, payment) {
    if (!order) return null;
    const raw = order.raw || {};
    const fulfillmentStatus = raw.fulfillment ? raw.fulfillment.status : '';
    if (['completed'].includes(raw.status) || fulfillmentStatus === 'completed') {
      return {
        title: '订单已完成',
        desc: '如果成品、配送或沟通结果有问题，可以在售后周期内提交证据申请退款协商。'
      };
    }
    if (['disputed'].includes(raw.status) || fulfillmentStatus === 'disputed') {
      return {
        title: '售后处理中',
        desc: '平台已经记录问题和证据，商家处理后会更新退款或协商结果。'
      };
    }
    if (['producing', 'ready', 'delivering_or_pickup'].includes(fulfillmentStatus)) {
      return {
        title: this.fulfillmentText(fulfillmentStatus),
        desc: '现在重点是跟进制作排期和配送/自提安排，平台只展示商家已确认的状态。'
      };
    }
    if (quote && (payment || raw.status === 'intent_confirmed' || raw.status === 'merchant_confirmed')) {
      return {
        title: '等待蛋糕师确认制作',
        desc: '报价已经进入订单，师傅确认后会继续补充制作排期、配送联系人和履约状态。'
      };
    }
    if (quote) {
      return {
        title: '报价已生成，等待确认',
        desc: '回到报价页确认价格、日期和调整范围，确认后才会进入订单履约。'
      };
    }
    if (demand) {
      return {
        title: '等待师傅报价',
        desc: '需求已经记录，收到报价后再选择，不会直接替你下单。'
      };
    }
    return {
      title: '先完成一条制作需求',
      desc: '回到设计页生成作品并发布需求，平台才会进入师傅报价环节。'
    };
  },

  buildOrderActionButtons(order, demand, quote, payment) {
    if (!order) return [];
    const raw = order.raw || {};
    const fulfillmentStatus = raw.fulfillment ? raw.fulfillment.status : '';
    if (['completed', 'disputed'].includes(raw.status) || ['completed', 'disputed'].includes(fulfillmentStatus)) {
      return [
        { label: '售后帮助', action: 'support', tone: 'primary' },
        { label: '查看作品', action: 'design', tone: 'ghost' }
      ];
    }
    if (['producing', 'ready', 'delivering_or_pickup'].includes(fulfillmentStatus)) {
      return [
        { label: '履约跟踪', action: 'track', tone: 'primary' },
        { label: '查看需求', action: 'demand', tone: 'ghost' }
      ];
    }
    if (quote && (payment || raw.status === 'intent_confirmed')) {
      return [
        { label: '查看报价', action: 'quote', tone: 'secondary' },
        { label: '查看需求', action: 'demand', tone: 'ghost' }
      ];
    }
    if (quote) {
      return [
        { label: '去确认报价', action: 'quote', tone: 'primary' },
        { label: '查看需求', action: 'demand', tone: 'ghost' }
      ];
    }
    if (demand) {
      return [
        { label: '看报价进度', action: 'quote', tone: 'primary' },
        { label: '查看需求', action: 'demand', tone: 'ghost' }
      ];
    }
    return [{ label: '开始设计', action: 'design', tone: 'primary' }];
  },

  handleOrderAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === 'track') {
      this.showTrack();
      return;
    }
    if (action === 'support') {
      this.goSupport();
      return;
    }
    if (action === 'quote') {
      this.goQuotes();
      return;
    }
    if (action === 'demand') {
      this.goDemand();
      return;
    }
    this.goDesign();
  },

  selectOrder(event) {
    const id = event.currentTarget.dataset.id;
    const order = this.data.orders.find((item) => item.id === id);
    if (!order) return;
    const raw = order.raw || null;
    const work = raw && raw.work ? raw.work : null;
    const demand = raw && raw.demand ? raw.demand : null;
    const quote = raw && raw.quote ? raw.quote : null;
    const payment = raw && raw.payment ? raw.payment : null;
    app.globalData.currentOrder = order;
    app.globalData.currentWork = work;
    app.globalData.currentDemand = demand;
    app.globalData.currentQuote = quote;
    app.globalData.currentPayment = payment;
    this.setData({
      order,
      work,
      demand,
      quote,
      payment,
      delivery: this.deliveryFromOrder(raw),
      steps: this.buildSteps(order, demand, quote, payment),
      orderNextStep: this.buildOrderNextStep(order, demand, quote, payment),
      orderActionButtons: this.buildOrderActionButtons(order, demand, quote, payment),
      orderSummary: this.buildOrderSummary(order, demand, quote),
      orderRuleCards: this.buildOrderRuleCards(order, demand, quote),
      refundEligible: this.canRequestRefund(order),
      refundRequestSubmitted: false,
      refundPanelOpen: false
    });
    this.loadRefundRequests();
  },

  async loadRefundRequests() {
    try {
      const list = await request(`/refunds?userId=${app.globalData.userId}`);
      const currentOrderId = this.data.order && this.data.order.id;
      const scoped = (list || []).filter((item) => !currentOrderId || item.orderId === currentOrderId);
      const hasActiveRefund = scoped.some((item) => !['rejected', 'cancelled'].includes(item.status));
      this.setData({
        refundRequests: scoped,
        refundRequestSubmitted: hasActiveRefund,
        refundEligible: this.canRequestRefund(this.data.order) && !hasActiveRefund
      });
    } catch (error) {
      this.setData({ refundRequests: [], refundRequestSubmitted: false });
    }
  },

  canRequestRefund(order) {
    const raw = order && order.raw ? order.raw : null;
    const status = raw ? raw.status : order ? order.status : '';
    return ['completed', 'disputed', '已完成', '售后处理中'].includes(status);
  },

  toggleRefundPanel() {
    const order = this.data.order;
    if (!order) return;
    if (!this.canRequestRefund(order) || this.data.refundRequestSubmitted) {
      wx.showToast({ title: '订单完成后可申请售后退款', icon: 'none' });
      return;
    }
    this.setData({
      refundPanelOpen: !this.data.refundPanelOpen,
      'refundForm.requestedAmount': this.data.refundForm.requestedAmount || `${order.total || ''}`,
      'refundForm.contact': this.data.refundForm.contact || (app.globalData.currentUser && app.globalData.currentUser.phoneNumber) || ''
    });
  },

  onRefundReasonInput(event) {
    this.setData({ 'refundForm.reason': event.detail.value });
  },

  onRefundDescriptionInput(event) {
    this.setData({ 'refundForm.description': event.detail.value });
  },

  onRefundAmountInput(event) {
    this.setData({ 'refundForm.requestedAmount': event.detail.value });
  },

  onRefundEvidenceInput(event) {
    this.setData({ 'refundForm.evidenceNote': event.detail.value });
  },

  onRefundContactInput(event) {
    this.setData({ 'refundForm.contact': event.detail.value });
  },

  chooseRefundEvidence() {
    runWithPrivacy(() => {
      wx.chooseMedia({
        count: 3,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (result) => {
          const files = result.tempFiles || [];
          let failedCount = 0;
          for (const file of files) {
            try {
              const record = await uploadLocalFile(file.tempFilePath, {
                kind: 'supportEvidence',
                userId: app.globalData.userId
              });
              this.appendRefundEvidenceImages([record.url]);
            } catch (error) {
              failedCount += 1;
              if (promptLoginRequired(error, {
                action: 'upload-refund-evidence',
                title: '登录后上传退款证据'
              })) {
                this.preserveRefundForAuth('upload-refund-evidence');
                return;
              }
            }
          }
          if (failedCount) {
            wx.showToast({ title: '部分证据上传失败，请重试', icon: 'none' });
          }
        }
      });
    }, '请先同意隐私保护指引再上传退款证据');
  },

  async requestRefund() {
    const order = this.data.order;
    if (!order) return;
    if (!this.canRequestRefund(order) || this.data.refundRequestSubmitted) {
      wx.showToast({ title: '订单完成后可申请退款', icon: 'none' });
      return;
    }
    if (!ensureCommercialContact({
      action: 'request-refund',
      phoneTitle: '先绑定手机号再申请售后',
      phoneContent: '售后退款需要已绑定手机号，方便平台与商家联系你确认问题和处理结果。绑定完成后会自动回到当前页面。'
    })) {
      this.preserveRefundForAuth('request-refund');
      return;
    }
    const raw = order.raw || order;
    const form = this.data.refundForm;
    const description = form.description.trim();
    const contact = form.contact.trim();
    const evidenceNote = form.evidenceNote.trim();
    if (!description || !contact || (!evidenceNote && !form.evidenceImages.length)) {
      wx.showToast({ title: '请填写说明、联系方式和证据', icon: 'none' });
      return;
    }
    this.setData({ refundSubmitting: true });
    try {
      const refund = await request('/refunds', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          orderId: raw.id,
          reason: form.reason.trim() || '用户不满意',
          description,
          evidenceImages: form.evidenceImages,
          evidenceNote,
          requestedAmount: Number(form.requestedAmount) || order.total || raw.amount,
          contact
        }
      });
      const nextRaw = Object.assign({}, raw, {
        status: 'disputed',
        statusText: refund.order && refund.order.statusText ? refund.order.statusText : '售后处理中'
      });
      const nextOrder = Object.assign({}, order, {
        status: nextRaw.statusText,
        raw: nextRaw
      });
      app.globalData.currentOrder = nextOrder;
      this.setData({
        refundPanelOpen: false,
        refundRequests: [refund].concat(this.data.refundRequests || []),
        order: nextOrder,
        refundEligible: false,
        refundRequestSubmitted: true,
        orderNextStep: this.buildOrderNextStep(nextOrder, this.data.demand, this.data.quote, this.data.payment),
        orderActionButtons: this.buildOrderActionButtons(nextOrder, this.data.demand, this.data.quote, this.data.payment),
        orderSummary: this.buildOrderSummary(nextOrder, this.data.demand, this.data.quote),
        refundForm: {
          reason: '',
          description: '',
          requestedAmount: '',
          evidenceNote: '',
          evidenceImages: [],
          contact: form.contact
        }
      });
      wx.showModal({
        title: '退款申请已提交',
        content: '平台已记录证据并通知商家处理。商家同意则退款回支付渠道，不同意则客服介入协商。',
        showCancel: false
      });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'request-refund',
        title: '登录后申请售后'
      })) {
        this.preserveRefundForAuth('request-refund');
        return;
      }
      wx.showModal({
        title: '退款申请失败',
        content: toUserMessage(error, '退款申请提交失败，请稍后重试。'),
        showCancel: false
      });
    } finally {
      this.setData({ refundSubmitting: false });
    }
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goDemand() {
    if (!this.data.demand) {
      this.goDesign();
      return;
    }
    app.globalData.currentDemand = this.data.demand;
    wx.navigateTo({ url: '/pages/demand/demand' });
  },

  goSupport() {
    wx.navigateTo({ url: '/pages/support/support' });
  },

  goLogin() {
    openAuthLogin({
      url: '/pages/orders/orders',
      action: 'view-orders'
    });
  },

  goQuotes() {
    if (this.data.quote) {
      app.globalData.currentQuote = this.data.quote;
    }
    if (this.data.demand) {
      app.globalData.currentDemand = this.data.demand;
    }
    wx.navigateTo({ url: '/pages/quotes/quotes' });
  },

  goBakers() {
    wx.switchTab({ url: '/pages/bakers/bakers' });
  },

  callCourier() {
    const delivery = this.data.delivery;
    if (!delivery || !delivery.phone) {
      wx.showModal({
        title: '配送联系人待确认',
        content: '商家确认制作和配送方式后，会在这里显示可联系的配送或自提信息。',
        showCancel: false
      });
      return;
    }
    wx.showModal({
      title: '配送联系人',
      content: delivery.phone,
      showCancel: false
    });
  },

  showTrack() {
    wx.showModal({
      title: '履约跟踪',
      content: '当前先展示平台记录的制作和配送状态。实时地图轨迹会在商家配送或第三方运力接入后开放。',
      showCancel: false
    });
  }
});
