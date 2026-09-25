const { request, toUserMessage } = require('../../utils/api');
const { promptLoginRequired } = require('../../utils/auth');
const { buildBotReviewPreview } = require('../../utils/bot-reviews');
const app = getApp();

Page({
  data: {
    workId: '',
    work: null,
    loading: false,
    interaction: {
      votes: 0,
      roses: 0,
      voted: false,
      roseSent: false,
      roseBalance: 0
    },
    aiReviews: [],
    makerTips: [
      '适合转成奶油裱花和可食用插牌，先确认尺寸和配送时间。',
      '复杂立体装饰可以让蛋糕师改成平面装饰，成品更稳定。',
      '发布制作需求时写清口味、人数、预算和可接受调整范围。'
    ]
  },

  onLoad(options) {
    const workId = options && options.id ? options.id : '';
    this.setData({ workId });
    this.loadWork();
  },

  async loadWork() {
    if (!this.data.workId) {
      wx.showToast({ title: '作品不存在', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const work = await request(`/works/${this.data.workId}?userId=${app.globalData.userId}`);
      this.bindWork(work);
    } catch (error) {
      const fallback = app.globalData.currentWork;
      if (fallback && fallback.id === this.data.workId) {
        this.bindWork(fallback);
      } else {
        wx.showToast({ title: error.message || '作品加载失败', icon: 'none' });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  bindWork(work) {
    app.globalData.currentWork = work;
    this.setData({
      work,
      interaction: this.buildInteraction(work),
      aiReviews: this.buildAiReviews(work)
    });
    this.resumePendingDetailAction(work);
    this.loadBotReviews(work);
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
      this.setData({ aiReviews: result.items || this.buildAiReviews(work) });
    } catch (error) {
      this.setData({ aiReviews: this.buildAiReviews(work) });
    }
  },

  buildInteraction(work) {
    const voteState = app.globalData.workVoteState || {};
    const roseState = app.globalData.workRoseState || {};
    const userInteraction = work && work.userInteraction ? work.userInteraction : {};
    const voted = Boolean(userInteraction.voted || voteState[work.id]);
    const roseSent = Boolean(userInteraction.roseSent || roseState[work.id]);
    return {
      votes: typeof work.voteCount === 'number' ? work.voteCount : 0,
      roses: typeof work.roseCount === 'number' ? work.roseCount : 0,
      voted,
      roseSent,
      roseBalance: app.globalData.roseBalance || 0
    };
  },

  buildAiReviews(work) {
    return buildBotReviewPreview(work);
  },

  preserveDetailActionForAuth(action, workId) {
    if (typeof app.setPendingAuthDraft !== 'function' || !action || !workId) return;
    app.setPendingAuthDraft('work-detail-interaction', {
      action,
      workId
    });
  },

  resumePendingDetailAction(work) {
    if (!work || typeof app.consumePendingAuthDraft !== 'function') return;
    const pending = app.consumePendingAuthDraft('work-detail-interaction');
    if (!pending || !pending.action) return;
    if (pending.workId && pending.workId !== work.id) return;
    setTimeout(() => {
      if (pending.action === 'vote') {
        this.voteWork();
        return;
      }
      if (pending.action === 'rose') {
        this.sendRose();
      }
    }, 180);
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
      const currentVotes = typeof work.voteCount === 'number' ? work.voteCount : 0;
      const nextWork = Object.assign({}, work, {
        voteCount: result.counts ? result.counts.votes : currentVotes + 1,
        userInteraction: Object.assign({}, work.userInteraction || {}, { voted: true })
      });
      this.bindWork(nextWork);
      wx.showToast({ title: '投票成功' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'work-detail-vote',
        title: '登录后投票',
        beforeLogin: () => this.preserveDetailActionForAuth('vote', work.id)
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
      const currentRoses = typeof work.roseCount === 'number' ? work.roseCount : 0;
      const nextWork = Object.assign({}, work, {
        roseCount: result.counts ? result.counts.roses : currentRoses + 1,
        userInteraction: Object.assign({}, work.userInteraction || {}, { roseSent: true })
      });
      this.bindWork(nextWork);
      wx.showToast({ title: '已送出玫瑰' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'work-detail-rose',
        title: '登录后送玫瑰',
        beforeLogin: () => this.preserveDetailActionForAuth('rose', work.id)
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '送玫瑰失败，请稍后重试'), icon: 'none' });
    }
  },

  promptRoseCheckIn() {
    wx.showModal({
      title: '玫瑰不足',
      content: '每天签到可领取玫瑰。领取后再回来给这款作品送花。',
      confirmText: '去签到',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/mine/mine' });
        }
      }
    });
  },

  startSameCake() {
    const work = this.data.work;
    if (!work) return;
    app.globalData.accountRole = 'player';
    app.globalData.currentWork = work;
    app.globalData.currentDesignGame = {
      score: 78,
      badge: '分享同款',
      challenge: '作品详情',
      props: [work.color, work.size]
    };
    app.globalData.currentDemandDraft = {
      source: 'work-detail',
      sourceWorkId: work.id,
      title: `做同款：${work.title}`,
      description: `我想做同款「${work.title}」，希望尽量还原图片主体和风格，可接受蛋糕师根据真实制作调整。`,
      budget: work.budget || '200-399元',
      servings: work.size === '8寸' ? '8-10人' : '4-6人',
      deliveryMethod: '同城配送',
      contact: app.globalData.currentUser && app.globalData.currentUser.phoneNumber ? app.globalData.currentUser.phoneNumber : ''
    };
    app.globalData.currentDemand = null;
    app.globalData.currentQuote = null;
    app.globalData.currentPayment = null;
    app.globalData.currentOrder = null;
    wx.navigateTo({ url: '/pages/demand/demand' });
  },

  joinSameThemeTask() {
    const work = this.data.work;
    if (!work) return;
    const task = {
      id: `share-${work.id}`,
      title: `同主题任务：${work.scenario}蛋糕`,
      prompt: `参考「${work.title}」的场景和情绪，重新设计一款不同但同主题的蛋糕：${work.prompt}`,
      scenario: work.scenario,
      style: work.style,
      color: work.color,
      botLine: '来自作品分享页的同主题挑战，生成后可发布到作品广场继续获得投票。',
      rewardAmount: 0,
      tags: ['同主题', work.scenario, work.style],
      participantCount: 0,
      rewardStatusText: '可参与',
      source: 'share-landing'
    };
    app.globalData.currentTask = task;
    app.globalData.pendingChallenge = task;
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goWorks() {
    wx.switchTab({ url: '/pages/works/works' });
  },

  onShareAppMessage() {
    const work = this.data.work;
    return {
      title: work ? `这款 AI 蛋糕你觉得好看吗：${work.title}` : '来投票选一款 AI 蛋糕',
      path: work ? `/pages/work-detail/work-detail?id=${work.id}` : '/pages/works/works'
    };
  }
});
