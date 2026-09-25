const { request, toUserMessage, isLoginRequiredError } = require('../../utils/api');
const { promptLoginRequired, saveLoginReturn } = require('../../utils/auth');
const { getSeasonalTaskBoard, seasonalTaskCatalog } = require('../../config/seasonal-tasks');
const { refreshCreationCreditSummary } = require('../../utils/creation-credits');
const { decorateDesignTask, isBackendTaskId, toLocalPracticeTask } = require('../../utils/tasks');
const app = getApp();

function buildLocalPracticeGroups(date = new Date()) {
  const board = getSeasonalTaskBoard(date);
  return [
    {
      key: 'active',
      title: '正在进行',
      note: '当前周期练习',
      tasks: board.active.map((item) => toLocalPracticeTask(item))
    },
    {
      key: 'upcoming',
      title: '即将开始',
      note: '45天内提前预告',
      tasks: board.upcoming.slice(0, 4).map((item) => toLocalPracticeTask(item))
    },
    {
      key: 'evergreen',
      title: '常驻灵感',
      note: '平时也能练风格',
      tasks: board.evergreen.slice(0, 3).map((item) => toLocalPracticeTask(item))
    }
  ].filter((group) => group.tasks.length);
}

function buildBackendGroups(tasks) {
  const localGroups = buildLocalPracticeGroups();
  const upcoming = localGroups.find((group) => group.key === 'upcoming');
  const evergreen = localGroups.find((group) => group.key === 'evergreen');
  return [
    {
      key: 'active',
      title: '正在进行',
      note: '真实参赛任务',
      tasks: tasks.slice(0, 5)
    },
    upcoming
      ? Object.assign({}, upcoming, {
          note: '预告题先练习，不计真实奖励'
        })
      : null,
    evergreen
      ? Object.assign({}, evergreen, {
          note: '常驻灵感，不计真实奖励'
        })
      : null
  ].filter((group) => group && group.tasks && group.tasks.length);
}

function flattenGroups(groups) {
  return (groups || []).reduce((list, group) => list.concat(group.tasks || []), []);
}

function buildTaskCycleSummary(groups) {
  return (groups || []).filter((group) => group && group.tasks && group.tasks.length).map((group) => ({
    key: group.key,
    title: group.title,
    value: `${group.tasks.length} 题`,
    note: group.note
  })).slice(0, 3);
}

const initialChallengeGroups = buildLocalPracticeGroups();

Page({
  data: {
    loading: false,
    showTaskList: false,
    showAdvancedRecipe: false,
    scenarioOptions: ['生日', '情侣', '闺蜜', '毕业', '宠物', '纪念日', '聚会', '开学', '踏青'],
    styleOptions: ['韩系奶油风', '复古花艺', '高级简约', '可爱卡通', '国潮', '黑金', '运动派对', '清新可爱', '自然花艺', '节日派对', '清新水果'],
    colorOptions: ['粉色', '白绿', '香槟金', '蓝色', '紫色', '红色', '绿色'],
    sizeOptions: ['4寸', '6寸', '8寸'],
    budgetOptions: ['100-199元', '200-399元', '400-699元', '700元以上'],
    propOptions: ['大蝴蝶结', '可食用珍珠', '奶油花边', '手写祝福牌', '水果点缀', '迷你皇冠'].map((name) => ({ name, active: false })),
    challengeGroups: initialChallengeGroups,
    quickChallenges: flattenGroups(initialChallengeGroups),
    taskCycleSummary: buildTaskCycleSummary(initialChallengeGroups),
    seasonalTaskCatalog,
    selectedProps: [],
    activeChallenge: { title: '', rewardAmount: 0, botLine: '', rewardStatusText: '', source: '' },
    creativityScore: 35,
    creativityBadge: '灵感起步',
    creditSummary: {
      balance: 0,
      generationCost: 5,
      dailyFreeGenerationText: '登录后可享今日免费基础生成'
    },
    scenarioIndex: 0,
    styleIndex: 0,
    colorIndex: 0,
    sizeIndex: 1,
    budgetIndex: 1,
    form: {
      prompt: '',
      scenario: '生日',
      style: '韩系奶油风',
      color: '粉色',
      size: '6寸',
      budget: '200-399元'
    }
  },

  onLoad(options = {}) {
    if (options.showTasks === '1') {
      this.setData({ showTaskList: true });
    }
  },

  onShow() {
    app.globalData.accountRole = 'player';
    this.loadTodayTasks();
    this.syncCreationCredits();
    this.restoreDesignDraftForAuth();
    if (app.globalData.pendingChallenge) {
      this.applyChallenge(app.globalData.pendingChallenge);
      app.globalData.pendingChallenge = null;
    }
  },

  async syncCreationCredits() {
    if (!app.globalData.currentUser) {
      this.setData({
        creditSummary: {
          balance: app.globalData.creationCreditBalance || 0,
          generationCost: app.globalData.creationGenerationCost || 5,
          dailyFreeGenerationText: '登录后可享今日免费基础生成'
        }
      });
      return;
    }
    try {
      const summary = await refreshCreationCreditSummary();
      this.setData({
        creditSummary: {
          balance: summary.wallet ? summary.wallet.creationCreditBalance || 0 : 0,
          generationCost: summary.generationCost || 5,
          dailyFreeGenerationText:
            summary.dailyFreeGenerationRemaining > 0
              ? '今日还可免费基础生成 1 次'
              : `免费已用完，继续生成消耗 ${summary.generationCost || 5} 积分/次`
        }
      });
    } catch (error) {
      this.setData({
        creditSummary: {
          balance: app.globalData.creationCreditBalance || 0,
          generationCost: app.globalData.creationGenerationCost || 5,
          dailyFreeGenerationText:
            (app.globalData.dailyFreeGenerationRemaining || 0) > 0
              ? '今日还可免费基础生成 1 次'
              : `免费已用完，继续生成消耗 ${app.globalData.creationGenerationCost || 5} 积分/次`
        }
      });
    }
  },

  async loadTodayTasks() {
    try {
      const result = await request(`/design-tasks/today?userId=${app.globalData.userId}`);
      const tasks = (result.tasks || []).map((item) => this.decorateTask(item));
      if (tasks.length) {
        app.globalData.todayDesignTasks = tasks;
        const challengeGroups = buildBackendGroups(tasks);
        this.setData({
          challengeGroups,
          quickChallenges: flattenGroups(challengeGroups),
          taskCycleSummary: buildTaskCycleSummary(challengeGroups)
        });
      }
    } catch (error) {
      const challengeGroups = buildLocalPracticeGroups();
      this.setData({
        challengeGroups,
        quickChallenges: flattenGroups(challengeGroups),
        taskCycleSummary: buildTaskCycleSummary(challengeGroups)
      });
    }
  },

  decorateTask(task) {
    return decorateDesignTask(task);
  },

  preserveDesignDraftForAuth(action) {
    if (typeof app.setPendingAuthDraft !== 'function') return;
    app.setPendingAuthDraft(action, {
      form: Object.assign({}, this.data.form),
      scenarioIndex: this.data.scenarioIndex,
      styleIndex: this.data.styleIndex,
      colorIndex: this.data.colorIndex,
      sizeIndex: this.data.sizeIndex,
      budgetIndex: this.data.budgetIndex,
      propOptions: this.data.propOptions.map((item) => Object.assign({}, item)),
      selectedProps: this.data.selectedProps.slice(),
      activeChallenge: this.data.activeChallenge ? Object.assign({}, this.data.activeChallenge) : null,
      showTaskList: Boolean(this.data.showTaskList),
      showAdvancedRecipe: Boolean(this.data.showAdvancedRecipe)
    });
  },

  restoreDesignDraftForAuth() {
    if (typeof app.consumePendingAuthDraft !== 'function') return;
    const pending = app.consumePendingAuthDraft('design-generate');
    if (!pending) return;
    const nextData = {
      form: Object.assign({}, this.data.form, pending.form || {}),
      scenarioIndex: typeof pending.scenarioIndex === 'number' ? pending.scenarioIndex : this.data.scenarioIndex,
      styleIndex: typeof pending.styleIndex === 'number' ? pending.styleIndex : this.data.styleIndex,
      colorIndex: typeof pending.colorIndex === 'number' ? pending.colorIndex : this.data.colorIndex,
      sizeIndex: typeof pending.sizeIndex === 'number' ? pending.sizeIndex : this.data.sizeIndex,
      budgetIndex: typeof pending.budgetIndex === 'number' ? pending.budgetIndex : this.data.budgetIndex,
      propOptions: Array.isArray(pending.propOptions)
        ? pending.propOptions.map((item) => Object.assign({}, item))
        : this.data.propOptions,
      selectedProps: Array.isArray(pending.selectedProps) ? pending.selectedProps.slice() : this.data.selectedProps,
      activeChallenge: pending.activeChallenge ? Object.assign({}, pending.activeChallenge) : this.data.activeChallenge,
      showTaskList: Boolean(pending.showTaskList),
      showAdvancedRecipe: Boolean(pending.showAdvancedRecipe)
    };
    this.setData(nextData, () => this.updateScore());
  },

  onPromptInput(event) {
    this.setData({ 'form.prompt': event.detail.value }, () => this.updateScore());
  },

  onScenarioChange(event) {
    const index = Number(event.detail.value);
    this.setData({ scenarioIndex: index, 'form.scenario': this.data.scenarioOptions[index] }, () => this.updateScore());
  },

  onStyleChange(event) {
    const index = Number(event.detail.value);
    this.setData({ styleIndex: index, 'form.style': this.data.styleOptions[index] }, () => this.updateScore());
  },

  onColorChange(event) {
    const index = Number(event.detail.value);
    this.setData({ colorIndex: index, 'form.color': this.data.colorOptions[index] }, () => this.updateScore());
  },

  onSizeChange(event) {
    const index = Number(event.detail.value);
    this.setData({ sizeIndex: index, 'form.size': this.data.sizeOptions[index] }, () => this.updateScore());
  },

  onBudgetChange(event) {
    const index = Number(event.detail.value);
    this.setData({ budgetIndex: index, 'form.budget': this.data.budgetOptions[index] }, () => this.updateScore());
  },

  applyChallenge(challenge) {
    const scenarioIndex = Math.max(this.data.scenarioOptions.indexOf(challenge.scenario), 0);
    const styleIndex = Math.max(this.data.styleOptions.indexOf(challenge.style), 0);
    const colorIndex = Math.max(this.data.colorOptions.indexOf(challenge.color), 0);
    this.setData({
      activeChallenge: challenge,
      scenarioIndex,
      styleIndex,
      colorIndex,
      'form.prompt': challenge.prompt,
      'form.scenario': this.data.scenarioOptions[scenarioIndex],
      'form.style': this.data.styleOptions[styleIndex],
      'form.color': this.data.colorOptions[colorIndex]
    }, () => this.updateScore());
    this.setData({ showTaskList: false });
  },

  async selectChallenge(event) {
    const existing = (this.data.quickChallenges || []).find((item) => item.id === event.currentTarget.dataset.id) || {};
    const challenge = Object.assign({}, existing, {
      id: event.currentTarget.dataset.id,
      templateId: event.currentTarget.dataset.templateid,
      campaignId: event.currentTarget.dataset.campaignid,
      title: event.currentTarget.dataset.title,
      prompt: event.currentTarget.dataset.prompt,
      scenario: event.currentTarget.dataset.scenario,
      style: event.currentTarget.dataset.style,
      color: event.currentTarget.dataset.color,
      botLine: event.currentTarget.dataset.botline,
      rewardAmount: Number(event.currentTarget.dataset.reward || 0),
      rewardLabel: event.currentTarget.dataset.rewardlabel || '',
      tags: `${event.currentTarget.dataset.tags || ''}`.split(',').filter(Boolean),
      participantCount: Number(event.currentTarget.dataset.participants || 0),
      rewardStatusText: event.currentTarget.dataset.status || '可参与',
      source: event.currentTarget.dataset.source || 'local'
    });
    if (isBackendTaskId(challenge.id)) {
      try {
        const result = await request(`/design-tasks/${challenge.id}/join`, {
          method: 'POST',
          data: {
            userId: app.globalData.userId
          }
        });
        this.applyChallenge(this.decorateTask(result.task || challenge));
        this.loadTodayTasks();
        return;
      } catch (error) {
        if (promptLoginRequired(error, {
          action: 'task-join',
          url: '/pages/design/design',
          title: '登录后参与任务'
        })) {
          app.globalData.pendingChallenge = challenge;
          return;
        }
        // 任务服务短暂不可用时仍允许用户继续创作，避免创作入口被外部服务波动阻断。
      }
    }
    this.applyChallenge(challenge);
  },

  toggleProp(event) {
    const prop = event.currentTarget.dataset.prop;
    const propOptions = this.data.propOptions.map((item) => {
      if (item.name === prop) {
        return Object.assign({}, item, { active: !item.active });
      }
      return item;
    });
    const selectedProps = propOptions.filter((item) => item.active).map((item) => item.name);
    this.setData({ propOptions, selectedProps }, () => this.updateScore());
  },

  updateScore() {
    const promptScore = Math.min(this.data.form.prompt.trim().length, 40);
    const challengeScore = this.data.activeChallenge && this.data.activeChallenge.title ? 18 : 0;
    const propScore = Math.min(this.data.selectedProps.length * 7, 28);
    const baseScore = 35;
    const score = Math.min(baseScore + promptScore + challengeScore + propScore, 100);
    const badge = score >= 90 ? '接单候选' : score >= 75 ? '爆款潜力' : score >= 60 ? '灵感玩家' : '灵感起步';
    this.setData({ creativityScore: score, creativityBadge: badge });
  },

  buildPrompt() {
    const parts = [];
    const userPrompt = this.data.form.prompt.trim();
    if (userPrompt) {
      parts.push(userPrompt);
    }
    if (this.data.activeChallenge.title) {
      parts.push(`灵感任务：${this.data.activeChallenge.title}`);
      if (isBackendTaskId(this.data.activeChallenge.id)) {
        parts.push(`任务实例编号：${this.data.activeChallenge.id}`);
        if (this.data.activeChallenge.templateId) {
          parts.push(`任务模板：${this.data.activeChallenge.templateId}`);
        }
        parts.push(`任务积分：审核后可获得 ${this.data.activeChallenge.rewardAmount} 点灵感券`);
      } else {
        parts.push('当前为练习模式，不计真实任务奖励。');
      }
    }
    if (this.data.selectedProps.length) {
      parts.push(`装饰元素：${this.data.selectedProps.join('、')}`);
    }
    parts.push(`创作值：${this.data.creativityScore}，目标是可制作、适合社交分享、能吸引蛋糕师报价。`);
    return parts.join('；');
  },

  async generate() {
    if (this.data.loading) return;
    if (!this.data.form.prompt.trim()) {
      wx.showToast({ title: '请先输入想法', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await request('/works/generate', {
        method: 'POST',
        data: Object.assign({}, this.data.form, {
          userId: app.globalData.userId,
          title: `${this.data.form.scenario} · ${this.data.form.style}`,
          prompt: this.buildPrompt()
        })
      });
      app.globalData.currentWork = result.work;
      if (result.wallet) {
        app.globalData.creationCreditBalance = result.wallet.creationCreditBalance || 0;
      }
      if (typeof result.generationCost === 'number') {
        app.globalData.creationGenerationCost = result.generationCost;
      }
      app.globalData.dailyFreeGenerationRemaining = 0;
      app.globalData.currentDesignGame = {
        score: this.data.creativityScore,
        badge: this.data.creativityBadge,
        challenge: this.data.activeChallenge.title || '自由创作',
        props: this.data.selectedProps,
        rewardAmount: this.data.activeChallenge.rewardAmount || 0,
        challengeId: isBackendTaskId(this.data.activeChallenge.id) ? this.data.activeChallenge.id : '',
        challengeTemplateId: isBackendTaskId(this.data.activeChallenge.id) ? (this.data.activeChallenge.templateId || '') : '',
        campaignId: isBackendTaskId(this.data.activeChallenge.id) ? (this.data.activeChallenge.campaignId || '') : '',
        taskSource: this.data.activeChallenge.source || 'local',
        rewardStatus: this.data.activeChallenge.source === 'local-practice'
          ? '练习模式'
          : (this.data.activeChallenge.rewardAmount ? '任务待完成' : '无奖励任务')
      };
      wx.navigateTo({ url: '/pages/result/result' });
    } catch (error) {
      this.promptLoginFromGenerateFailure(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  promptLoginFromGenerateFailure(error) {
    const loginRequired = isLoginRequiredError(error);
    wx.showModal({
      title: 'AI 生成失败',
      content: toUserMessage(error, 'AI 生成失败，请稍后重试，或先去作品广场做同款。'),
      showCancel: loginRequired,
      cancelText: '先看看',
      confirmText: loginRequired ? '去登录' : '确定',
      success: (result) => {
        if (loginRequired && result.confirm) {
          this.goLogin();
        }
      }
    });
  },

  goLogin() {
    this.preserveDesignDraftForAuth('design-generate');
    saveLoginReturn({ action: 'design-generate' });
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  toggleTaskList() {
    this.setData({ showTaskList: !this.data.showTaskList });
  },

  toggleAdvancedRecipe() {
    this.setData({ showAdvancedRecipe: !this.data.showAdvancedRecipe });
  }
});
