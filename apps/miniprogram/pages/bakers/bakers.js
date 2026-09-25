const { request } = require('../../utils/api');
const app = getApp();

Page({
  data: {
    demands: [],
    bakers: [],
    marketSummary: [],
    activeMarketCity: '长治'
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    const activeMarketCity = app.globalData.orderCity || app.globalData.city || '长治';
    try {
      const [demands, bakers] = await Promise.all([
        request(`/demands?city=${activeMarketCity}`),
        request(`/bakers?city=${activeMarketCity}`)
      ]);
      this.setData({
        demands: (demands || []).map((item) => this.decorateDemand(item)),
        bakers: bakers || [],
        marketSummary: this.buildMarketSummary(demands || [], bakers || []),
        activeMarketCity
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  decorateDemand(demand) {
    const details = [demand.budget || '预算待沟通', demand.expectedDate || '日期待确认'];
    if (demand.deliveryMethod) details.push(demand.deliveryMethod);
    return Object.assign({}, demand, {
      demandSignal: details.join(' · '),
      demandBrief: demand.mustKeep || demand.description || '先看作品图片，再确认可还原和可调整部分。',
      demandStage:
        demand.status === 'quoting'
          ? '可报价'
          : demand.status === 'selected'
            ? '已选报价'
            : demand.status === 'reviewing'
              ? '平台审核中'
              : '履约中',
      quoteLabel: demand.quoteCount ? `${demand.quoteCount} 个报价` : '暂无报价'
    });
  },

  buildMarketSummary(demands, bakers) {
    return [
      { label: '当前需求', value: `${demands.length} 条` },
      { label: '可报价', value: `${demands.filter((item) => item.status === 'quoting').length} 条` },
      { label: '已入驻师傅', value: `${bakers.length} 位` }
    ];
  },

  openDemand(event) {
    const demand = this.data.demands.find((item) => item.id === event.currentTarget.dataset.id);
    if (!demand) return;
    app.globalData.currentDemand = demand;
    app.globalData.currentWork = demand.work;
    app.globalData.currentDemandEntry = '';
    wx.navigateTo({ url: '/pages/demand/demand' });
  },

  openQuoteDemand(event) {
    const demand = this.data.demands.find((item) => item.id === event.currentTarget.dataset.id);
    if (!demand) return;
    app.globalData.accountRole = 'baker';
    app.globalData.currentDemand = demand;
    app.globalData.currentWork = demand.work;
    app.globalData.currentDemandEntry = 'quote';
    wx.navigateTo({ url: '/pages/demand/demand?entry=quote' });
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goBakerMine() {
    app.globalData.accountRole = 'baker';
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  goOnboarding() {
    app.globalData.accountRole = 'baker';
    wx.navigateTo({ url: '/pages/onboarding/onboarding' });
  }
});
