const { request, toUserMessage } = require('../../utils/api');
const { promptLoginRequired } = require('../../utils/auth');
const { buildBotReviewPreview } = require('../../utils/bot-reviews');
const { getSeasonalTasks } = require('../../config/seasonal-tasks');
const { decorateDesignTask, isBackendTaskId, toLocalPracticeTask } = require('../../utils/tasks');
const app = getApp();

Page({
  data: {
    rawWorks: [],
    works: [],
    myWorks: [],
    forumStats: [],
    forumBots: [],
    inspirationTasks: []
  },

  onShow() {
    const forumBots = (app.globalData.aiReviewBots || []).slice(0, 8);
    this.setData({
      forumBots,
      forumStats: this.buildForumStats([], [], forumBots)
    });
    this.loadPageData();
  },

  async loadPageData() {
    await Promise.all([this.loadWorks(), this.loadInspirationTasks()]);
  },

  async loadWorks() {
    try {
      const works = await request(app.globalData.currentUser ? '/works?includePending=true' : '/works');
      const publicWorks = (works || []).filter((item) => item.visibility === 'public' && item.reviewStatus === 'approved');
      const myWorks = app.globalData.currentUser
        ? (works || []).filter(
            (item) => item.userId === app.globalData.userId && !(item.visibility === 'public' && item.reviewStatus === 'approved'),
          )
        : [];
      this.setData({
        rawWorks: works || [],
        works: this.decorateWorks(publicWorks),
        myWorks: this.decorateOwnedWorks(myWorks),
        forumStats: this.buildForumStats(publicWorks, myWorks)
      });
      this.resumePendingGalleryAction();
    } catch (error) {
      wx.showToast({ title: toUserMessage(error, '广场加载失败，请稍后重试'), icon: 'none' });
      this.setData({ forumStats: this.buildForumStats([], []) });
    }
  },

  async loadInspirationTasks() {
    try {
      const result = await request(`/design-tasks/today?userId=${app.globalData.userId || ''}`);
      const tasks = (result.tasks || []).map((item) => decorateDesignTask(item)).slice(0, 3);
      if (tasks.length) {
        this.setData({ inspirationTasks: tasks });
        return;
      }
    } catch {
      // 任务服务不可用时退回本地练习题，避免广场空白后没有下一步。
    }

    this.setData({
      inspirationTasks: getSeasonalTasks().slice(0, 3).map((item) => toLocalPracticeTask(item))
    });
  },

  buildForumStats(works, myWorks = [], bots = this.data.forumBots) {
    const visibleWorks = works || [];
    const ownWorks = myWorks || [];
    const totalInteractions = visibleWorks.reduce((sum, work) => {
      const votes = typeof work.voteCount === 'number' ? work.voteCount : 0;
      const roses = typeof work.roseCount === 'number' ? work.roseCount : 0;
      return sum + votes + roses;
    }, 0);
    return [
      { label: '公开作品', value: `${visibleWorks.length} 个` },
      { label: '我的作品', value: app.globalData.currentUser ? `${ownWorks.length} 个` : '登录后可见' },
      { label: 'Bot 点评席', value: `${(bots || []).length} 位` }
    ];
  },

  decorateWorks(works) {
    const makerTips = [
      '适合奶油裱花和可食用插牌，还原度较高。',
      '建议把复杂摆件改成平面装饰，配送更稳。',
      '如果要做大尺寸，提前确认夹心、口味和取货时间。'
    ];

    return (works || []).map((work, index) => {
      const previewReview = this.previewReviewMeta(work, index);
      const voteState = app.globalData.workVoteState || {};
      const roseState = app.globalData.workRoseState || {};
      const userInteraction = work.userInteraction || {};
      const voted = Boolean(userInteraction.voted || voteState[work.id]);
      const roseSent = Boolean(userInteraction.roseSent || roseState[work.id]);
      const voteCount = this.visibleInteractionCount(work.voteCount, voted);
      const roseCount = this.visibleInteractionCount(work.roseCount, roseSent);
      const heat = typeof work.heat === 'number' ? work.heat : voteCount + roseCount;
      const adoptCount = typeof work.adoptCount === 'number' ? work.adoptCount : 0;
      const commentCount = typeof work.commentCount === 'number' ? work.commentCount : 0;
      return Object.assign({}, work, {
        heat,
        heatText: heat > 0 ? `热度 ${heat}` : '新作品',
        adoptCount,
        adoptText: adoptCount > 0 ? `采用 ${adoptCount}` : '暂无同款',
        commentCount,
        commentText: commentCount > 0 ? `评论 ${commentCount}` : '暂无评论',
        voteCount,
        voteText: voteCount > 0 ? `好看票 ${voteCount}` : '暂无票',
        roseCount,
        roseText: roseCount > 0 ? `玫瑰 ${roseCount}` : '暂无玫瑰',
        voted,
        roseSent,
        reviewSeatName: previewReview.name,
        reviewSeatFocus: previewReview.focus,
        reviewSeatLine: previewReview.line,
        makerTip: makerTips[index % makerTips.length]
      });
    });
  },

  decorateOwnedWorks(works) {
    return (works || []).map((work) => {
      const reviewText = this.ownedReviewText(work);
      return Object.assign({}, work, {
        reviewText,
        reviewTone: this.ownedReviewTone(work),
        meta: `${work.scenario || '场景待定'} · ${work.style || '风格待定'} · ${work.color || '色系待定'}`,
        visibilityText: work.visibility === 'public' ? '已提交公开，等待平台审核' : '仅自己可见，还没提交公开'
      });
    });
  },

  ownedReviewText(work) {
    if (work.visibility === 'public' && work.reviewStatus === 'pending') {
      return '公开审核中';
    }
    if (work.reviewStatus === 'rejected') {
      return '审核未通过';
    }
    if (work.visibility === 'private') {
      return '未公开';
    }
    if (work.reviewStatus === 'approved') {
      return '已公开';
    }
    return '待处理';
  },

  ownedReviewTone(work) {
    if (work.reviewStatus === 'rejected') return 'rejected';
    if (work.visibility === 'public') return 'pending';
    return 'private';
  },

  previewReviewMeta(work, index) {
    const reviews = buildBotReviewPreview(work);
    const review = reviews[index % reviews.length] || reviews[0];
    return review || {
      name: '灵感官',
      focus: '主题表达',
      line: '愿这款蛋糕把奶油细节和祝福心意稳稳送达。'
    };
  },

  visibleInteractionCount(count, interacted) {
    if (typeof count === 'number') return count;
    return interacted ? 1 : 0;
  },

  preserveGalleryActionForAuth(action, workId) {
    if (typeof app.setPendingAuthDraft !== 'function' || !action || !workId) return;
    app.setPendingAuthDraft('work-gallery-interaction', {
      action,
      workId
    });
  },

  resumePendingGalleryAction() {
    if (typeof app.consumePendingAuthDraft !== 'function') return;
    const pending = app.consumePendingAuthDraft('work-gallery-interaction');
    if (!pending || !pending.workId) return;
    const workExists = (this.data.works || []).some((item) => item.id === pending.workId);
    if (!workExists) return;
    const runner = pending.action === 'vote' ? this.voteWorkById : pending.action === 'rose' ? this.sendRoseById : null;
    if (typeof runner !== 'function') return;
    setTimeout(() => {
      runner.call(this, pending.workId);
    }, 180);
  },

  async voteWork(event) {
    const id = event.currentTarget.dataset.id;
    return this.voteWorkById(id);
  },

  async voteWorkById(id) {
    if (!id) return;
    app.globalData.workVoteState = app.globalData.workVoteState || {};
    if (app.globalData.workVoteState[id]) {
      wx.showToast({ title: '你已投过票', icon: 'none' });
      return;
    }
    try {
      await request('/interactions', {
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          targetType: 'work',
          targetId: id,
          action: 'vote'
        }
      });
      app.globalData.workVoteState[id] = true;
      await this.loadWorks();
      wx.showToast({ title: '投票成功' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'work-vote',
        title: '登录后投票',
        beforeLogin: () => this.preserveGalleryActionForAuth('vote', id)
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '投票失败，请稍后重试'), icon: 'none' });
    }
  },

  async sendRose(event) {
    const id = event.currentTarget.dataset.id;
    return this.sendRoseById(id);
  },

  async sendRoseById(id) {
    if (!id) return;
    app.globalData.workRoseState = app.globalData.workRoseState || {};
    if (app.globalData.workRoseState[id]) {
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
          targetId: id,
          action: 'rose'
        }
      });
      app.globalData.workRoseState[id] = true;
      app.globalData.roseBalance = result.wallet ? result.wallet.roseBalance : app.globalData.roseBalance - 1;
      await this.loadWorks();
      wx.showToast({ title: '已送出玫瑰' });
    } catch (error) {
      if (promptLoginRequired(error, {
        action: 'work-rose',
        title: '登录后送玫瑰',
        beforeLogin: () => this.preserveGalleryActionForAuth('rose', id)
      })) {
        return;
      }
      wx.showToast({ title: toUserMessage(error, '送玫瑰失败，请稍后重试'), icon: 'none' });
    }
  },

  promptRoseCheckIn() {
    wx.showModal({
      title: '玫瑰不足',
      content: '先去我的页签到领玫瑰，再回来支持喜欢的作品。',
      confirmText: '去签到',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          this.goMine();
        }
      }
    });
  },

  openWork(event) {
    const work = this.findWorkById(event.currentTarget.dataset.id);
    if (!work) return;
    app.globalData.currentWork = work;
    wx.navigateTo({ url: `/pages/work-detail/work-detail?id=${work.id}` });
  },

  adoptWork(event) {
    const work = this.findWorkById(event.currentTarget.dataset.id);
    if (!work) return;
    this.startSameCake(work);
  },

  findWorkById(id) {
    return [...(this.data.works || []), ...(this.data.myWorks || [])].find((item) => item.id === id);
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  async playInspirationTask(event) {
    const task = (this.data.inspirationTasks || []).find((item) => item.id === event.currentTarget.dataset.id);
    if (!task) return;
    await this.startInspirationTask(task);
  },

  async startInspirationTask(task) {
    app.globalData.accountRole = 'player';
    app.globalData.pendingChallenge = task;
    if (task && isBackendTaskId(task.id)) {
      try {
        const result = await request(`/design-tasks/${task.id}/join`, {
          method: 'POST',
          data: {
            userId: app.globalData.userId
          }
        });
        app.globalData.pendingChallenge = result.task || task;
      } catch (error) {
        if (
          promptLoginRequired(error, {
            action: 'task-join',
            url: '/pages/design/design',
            title: '登录后参与任务'
          })
        ) {
          return;
        }
        app.globalData.pendingChallenge = task;
      }
    }
    wx.navigateTo({ url: '/pages/design/design' });
  },

  startSameCake(work) {
    app.globalData.accountRole = 'player';
    app.globalData.currentWork = work;
    app.globalData.currentDesignGame = {
      score: 76,
      badge: '做同款',
      challenge: '作品广场',
      props: [work.color, work.size]
    };
    app.globalData.currentDemandDraft = {
      source: 'works-gallery',
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
    app.globalData.playerProfile = app.globalData.playerProfile || {};
    app.globalData.playerProfile.adoptedCount = (app.globalData.playerProfile.adoptedCount || 0) + 1;
    wx.navigateTo({ url: '/pages/demand/demand' });
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  }
});
