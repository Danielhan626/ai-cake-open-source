const { request } = require('../../utils/api');
const { ensureCommercialContact, promptLoginRequired } = require('../../utils/auth');
const app = getApp();

Page({
  data: {
    quote: null,
    payment: null,
    total: 0,
    quoteDecisionText: '',
    selectableQuote: false,
    quoteSummary: [],
    quoteRuleCards: [],
    quoteNextStep: null,
    hasCurrentDemand: false,
    emptyQuoteActionText: '去设计发布需求',
    loading: false
  },

  onShow() {
    const quote = app.globalData.currentQuote || null;
    const payment = app.globalData.currentPayment || null;
    this.setData({
      quote,
      payment,
      total: quote ? quote.amount + quote.deliveryFee : 0,
      quoteDecisionText: this.decisionText(quote),
      selectableQuote: quote ? quote.decision !== 'decline' : false,
      quoteSummary: this.buildQuoteSummary(quote),
      quoteRuleCards: this.buildQuoteRuleCards(quote),
      quoteNextStep: this.buildQuoteNextStep(quote, payment),
      hasCurrentDemand: Boolean(app.globalData.currentDemand),
      emptyQuoteActionText: app.globalData.currentDemand ? '回到需求详情' : '去设计发布需求'
    });
    this.resumePendingQuoteSelection();
  },

  preserveQuoteSelectionForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function' || !action) return;
    app.setPendingAuthDraft(action, {
      quoteId: this.data.quote && this.data.quote.id
    });
  },

  resumePendingQuoteSelection() {
    if (typeof app.consumePendingAuthDraft !== 'function') return;
    const pending = app.consumePendingAuthDraft('select-quote');
    if (!pending) return;
    if (pending.quoteId && this.data.quote && pending.quoteId !== this.data.quote.id) return;
    setTimeout(() => {
      this.pay();
    }, 180);
  },

  async pay() {
    if (this.data.loading) return;
    if (!this.data.quote) return;
    const paymentMode = app.globalData.paymentMode;
    if (this.data.quote.decision === 'decline') {
      wx.showModal({
        title: '这不是可选报价',
        content: '蛋糕师当前选择暂不接单。你可以等待其他师傅报价，或返回需求页调整创意后重新发布。',
        showCancel: false
      });
      return;
    }
    if (paymentMode !== 'intent' && paymentMode !== 'wechat') {
      wx.showModal({
        title: '支付功能准备中',
        content: '当前版本还没有接入真实微信支付，请先确认报价意向，后续由蛋糕师继续联系并推进制作、配送和售后流程。',
        showCancel: false
      });
      return;
    }
    if (!ensureCommercialContact({
      action: 'select-quote',
      phoneTitle: '先绑定手机号再确认报价',
      phoneContent: '确认报价意向前，需要已绑定手机号，方便蛋糕师联系你确认制作、配送和售后细节。绑定完成后会自动回到当前页面。'
    })) {
      this.preserveQuoteSelectionForAuth('select-quote');
      return;
    }
    this.setData({ loading: true });
    try {
      const selectedQuote = await request(`/quotes/${this.data.quote.id}/select`, {
        method: 'PATCH',
        data: {
          userId: app.globalData.userId
        }
      });
      const amount = selectedQuote.amount + selectedQuote.deliveryFee;
      const order = await request('/orders', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          quoteId: selectedQuote.id
        }
      });
      app.globalData.currentQuote = selectedQuote;
      app.globalData.deliveryProfile = null;
      app.globalData.currentOrder = this.presentOrder(order);

      if (paymentMode === 'wechat') {
        const payment = await request('/payments', {
          method: 'POST',
          data: {
            userId: app.globalData.userId,
            quoteId: selectedQuote.id,
            orderId: order.id
          }
        });
        await this.requestWechatPayment(payment);
        const synced = await request(`/payments/${payment.id}/sync`, {
          method: 'POST',
          data: {
            userId: app.globalData.userId
          }
        });
        app.globalData.currentPayment = synced;
        this.setData({ quote: selectedQuote, payment: synced, total: amount });
        wx.showToast({ title: '支付结果确认中', icon: 'none' });
        wx.navigateTo({ url: '/pages/orders/orders' });
        return;
      }

      const payment = {
        id: `intent-${selectedQuote.id}`,
        quoteId: selectedQuote.id,
        userId: app.globalData.userId,
        amount,
        provider: 'intent',
        status: '意向已确认'
      };
      app.globalData.currentPayment = payment;
      this.setData({ quote: selectedQuote, payment, total: amount });
      wx.showToast({ title: '已确认报价意向' });
      wx.navigateTo({ url: '/pages/orders/orders' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'select-quote',
        title: '登录后确认报价',
        beforeLogin: () => this.preserveQuoteSelectionForAuth('select-quote')
      })) {
        return;
      }
      wx.showToast({ title: error.message || '确认失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goBakers() {
    wx.switchTab({ url: '/pages/bakers/bakers' });
  },

  goDemand() {
    if (!app.globalData.currentDemand) {
      this.goDesign();
      return;
    }
    wx.navigateTo({ url: '/pages/demand/demand' });
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  decisionText(quote) {
    if (!quote) return '';
    const map = {
      as_designed: '按图接近制作',
      with_adjustments: '建议调整后制作',
      decline: '暂不接单'
    };
    return map[quote.decision] || '建议调整后制作';
  },

  buildQuoteSummary(quote) {
    if (!quote) return [];
    const demand = quote.demand || app.globalData.currentDemand || {};
    const baker = quote.baker || app.globalData.bakerProfile || {};
    return [
      { label: '需求城市', value: `${demand.city || app.globalData.city || '长治'}${demand.district || app.globalData.district || ''}` },
      { label: '期望日期', value: demand.expectedDate || '待确认' },
      { label: '配送时间', value: `${demand.deliveryWindow || '时间待确认'} · ${quote.deliveryWindow || '与师傅确认'}` },
      { label: '尺寸口味', value: `${demand.cakeSize || demand.servings || '尺寸待确认'} · ${demand.flavor || '口味待沟通'}` },
      { label: '报价师傅', value: baker.name || quote.bakerName || '已入驻蛋糕师' },
      { label: '确认后', value: '进入订单履约' }
    ];
  },

  buildQuoteRuleCards(quote) {
    if (!quote) return [];
    return [
      { title: '可还原程度', value: quote.restorationLevel || '主体创意接近，局部细节按材料调整' },
      { title: '定时配送', value: quote.scheduledDeliverySupported ? `${quote.deliveryWindow || '时间待确认'}，支持提前沟通` : '暂不支持定时配送' },
      { title: '改单截止', value: quote.changeDeadline || '开做前再次确认' },
      { title: '取消规则', value: quote.cancelPolicy || '开做前沟通，备料或制作后按实际损耗协商' },
      { title: '签收提醒', value: quote.signoffNote || '签收前检查外观和配送完整度' }
    ];
  },

  buildQuoteNextStep(quote, payment) {
    if (!quote) {
      return {
        title: app.globalData.currentDemand ? '还在等报价' : '先有制作需求，再谈报价',
        desc: app.globalData.currentDemand
          ? '回到需求页查看审核和报价进度；收到师傅回复后，再在这里确认撮合。'
          : '先从作品或设计页发布一条制作需求，平台审核后才会进入师傅报价环节。'
      };
    }
    if (quote.decision === 'decline') {
      return {
        title: '这条回复暂不接单',
        desc: '你可以回到需求页继续等待其他师傅，或修改需求后重新发布。'
      };
    }
    if (payment) {
      return {
        title: '已记录确认结果',
        desc: '订单页会继续承接制作、配送或自提，以及后续售后记录。'
      };
    }
    return {
      title: '确认后进入订单履约',
      desc: '先确认这条报价是否适合你的日期、预算和调整范围，再进入订单。'
    };
  },

  presentOrder(order) {
    const work = order && order.work ? order.work : app.globalData.currentWork;
    return {
      id: order.id,
      title: work ? work.title : 'AI 蛋糕订单',
      city: order.city || app.globalData.city,
      district: order.district || app.globalData.district,
      total: order.amount,
      totalText: order.totalText || `¥${order.amount}`,
      status: order.statusText || '已确认报价意向，待蛋糕师联系',
      deliveryMethod: order.deliveryMethod || (app.globalData.currentDemand ? app.globalData.currentDemand.deliveryMethod : '同城配送或自提'),
      expectedDate: order.expectedDate || (app.globalData.currentDemand ? app.globalData.currentDemand.expectedDate : '待确认'),
      fulfillment: order.fulfillment || null,
      raw: order
    };
  },

  requestWechatPayment(payment) {
    return new Promise((resolve, reject) => {
      if (!payment || !payment.payParams) {
        reject(new Error('支付参数缺失，请稍后重试'));
        return;
      }
      if (typeof wx.requestPayment !== 'function') {
        reject(new Error('当前环境暂不支持微信支付，请在手机微信中重试'));
        return;
      }
      wx.requestPayment({
        timeStamp: payment.payParams.timeStamp,
        nonceStr: payment.payParams.nonceStr,
        package: payment.payParams.package,
        signType: payment.payParams.signType || 'RSA',
        paySign: payment.payParams.paySign,
        success: resolve,
        fail: (error) => {
          if (error && (error.errMsg || '').includes('cancel')) {
            reject(new Error('你已取消支付，可稍后在订单页继续支付。'));
            return;
          }
          reject(error || new Error('微信支付未完成'));
        }
      });
    });
  }
});
