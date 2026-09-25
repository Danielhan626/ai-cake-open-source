const app = getApp();
const config = require('../../config/index');
const { request } = require('../../utils/api');
const { promptLoginRequired } = require('../../utils/auth');
const { getSupportedCities, resolveCityFromLocation, setActiveCity, setOrderCity } = require('../../utils/city');
const { runWithPrivacy } = require('../../utils/privacy');
const { getSeasonalTaskBoard } = require('../../config/seasonal-tasks');
const { decorateDesignTask, isBackendTaskId, toLocalPracticeTask } = require('../../utils/tasks');

function flattenChallengeGroups(groups) {
  return (groups || []).reduce((list, group) => list.concat(group.tasks || []), []);
}

function splitChallengeDisplay(groups) {
  const challengeGroups = (groups || []).filter((group) => group && group.tasks && group.tasks.length);
  const challenges = flattenChallengeGroups(challengeGroups);
  const primaryChallenge = challenges[0] || null;
  const normalizedGroups = challengeGroups.map((group, index) => ({
    ...group,
    tasks: index === 0 ? group.tasks.slice(1) : group.tasks
  })).filter((group) => group.tasks.length);
  return {
    challengeGroups: normalizedGroups,
    challenges,
    primaryChallenge,
    secondaryChallenges: challenges.slice(1, 5)
  };
}

function buildTaskCycleSummary(groups) {
  return (groups || []).filter((group) => group && group.tasks && group.tasks.length).map((group) => ({
    key: group.key,
    title: group.title,
    value: `${group.tasks.length} 题`,
    note: group.note
  })).slice(0, 3);
}

function localPracticeChallengeGroups(date = new Date()) {
  const board = getSeasonalTaskBoard(date);
  return [
    {
      key: 'active',
      title: '正在进行',
      note: '当前营销周期',
      tasks: board.active.map((item) => toLocalPracticeTask(item))
    },
    {
      key: 'upcoming',
      title: '即将开始',
      note: '45天内提前预告',
      tasks: board.upcoming.slice(0, 3).map((item) => toLocalPracticeTask(item))
    },
    {
      key: 'evergreen',
      title: '常驻灵感',
      note: '没有热点时也能练',
      tasks: board.evergreen.slice(0, 2).map((item) => toLocalPracticeTask(item))
    }
  ].filter((group) => group.tasks.length);
}

function backendChallengeGroups(tasks) {
  const localGroups = localPracticeChallengeGroups();
  const upcoming = localGroups.find((group) => group.key === 'upcoming');
  const evergreen = localGroups.find((group) => group.key === 'evergreen');
  return [
    {
      key: 'active',
      title: '正在进行',
      note: '真实任务周期',
      tasks: tasks.slice(0, 4)
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

const initialChallengeDisplay = splitChallengeDisplay(localPracticeChallengeGroups());
const initialTaskCycleSummary = buildTaskCycleSummary(localPracticeChallengeGroups());

Page({
  data: {
    city: '长治',
    district: '潞州区',
    supportedCities: getSupportedCities(),
    orderCityIndex: 0,
    locationSource: '平台服务城市',
    locationLoading: false,
    starterSteps: [
      { title: '写一句想法', desc: '送给谁、什么风格、想表达什么。' },
      { title: 'AI 生成蛋糕', desc: '先拿到第一版，不满意继续微调。' },
      { title: '满意后下单', desc: '发布制作需求，再去我的订单跟进。' }
    ],
    quickStats: [
      { label: '今日玩法', value: '3 个' },
      { label: '微调入口', value: '已开启' },
      { label: '当前城市', value: '长治' }
    ],
    galleryHighlights: [
      { title: '热门作品', desc: '看大家生成的蛋糕，喜欢就做同款。' },
      { title: '玫瑰投票', desc: '观众每天签到送花，作品自然长热度。' }
    ],
    calendarNotes: [
      { value: '45 天', label: '提前预告' },
      { value: '积分', label: '创作参赛' },
      { value: '审核', label: '入奖励池' }
    ],
    challengeGroups: initialChallengeDisplay.challengeGroups,
    challenges: initialChallengeDisplay.challenges,
    primaryChallenge: initialChallengeDisplay.primaryChallenge,
    secondaryChallenges: initialChallengeDisplay.secondaryChallenges,
    taskCycleSummary: initialTaskCycleSummary,
    taskSummary: {
      completedTaskCount: 0,
      source: 'local-practice'
    },
    showStarterGuide: false
  },

  onShow() {
    this.loadTodayTasks();
    this.refreshLocation();
    this.ensureLocatedOnOpen();
  },

  async loadTodayTasks() {
    try {
      const result = await request(`/design-tasks/today?userId=${app.globalData.userId}`);
      const tasks = (result.tasks || []).map((item) => this.decorateTask(item));
      if (tasks.length) {
        const display = splitChallengeDisplay(backendChallengeGroups(tasks));
        app.globalData.todayDesignTasks = tasks;
        app.globalData.completedTaskCount = result.completedTaskCount || 0;
        this.setData({
          challengeGroups: display.challengeGroups,
          challenges: display.challenges,
          primaryChallenge: display.primaryChallenge,
          secondaryChallenges: display.secondaryChallenges,
          taskCycleSummary: buildTaskCycleSummary(backendChallengeGroups(tasks)),
          taskSummary: {
            completedTaskCount: result.completedTaskCount || 0,
            source: 'backend'
          }
        }, () => this.refreshLocation());
      }
    } catch (error) {
      const display = splitChallengeDisplay(localPracticeChallengeGroups());
      this.setData({
        challengeGroups: display.challengeGroups,
        challenges: display.challenges,
        primaryChallenge: display.primaryChallenge,
        secondaryChallenges: display.secondaryChallenges,
        taskCycleSummary: buildTaskCycleSummary(localPracticeChallengeGroups()),
        taskSummary: { completedTaskCount: app.globalData.completedTaskCount || 0, source: 'local-practice' }
      }, () => this.refreshLocation());
    }
  },

  decorateTask(task) {
    return decorateDesignTask(task);
  },

  refreshLocation() {
    const location = app.globalData.location || {};
    const city = location.city || app.globalData.city;
    const district = location.district || app.globalData.district;
    const cityIndex = Math.max(this.data.supportedCities.indexOf(app.globalData.orderCity || city), 0);
    this.setData({
      city,
      district,
      orderCityIndex: cityIndex,
      locationSource: location.source || '平台服务城市',
      quickStats: [
        { label: '今日玩法', value: `${this.data.challenges.length} 个` },
        { label: '已完成任务', value: `${this.data.taskSummary.completedTaskCount || 0} 个` },
        { label: '当前城市', value: city }
      ]
    });
  },

  ensureLocatedOnOpen() {
    if (!config.enableAutoLocation || app.globalData.autoLocationAttempted) return;
    app.globalData.autoLocationAttempted = true;
    this.locateCurrentCity({ silent: true });
  },

  locateCurrentCity(options = {}) {
    const silent = Boolean(options && options.silent);
    if (!config.enableAutoLocation || typeof wx.getFuzzyLocation !== 'function') {
      if (!silent) {
        wx.showToast({ title: '当前环境不支持定位', icon: 'none' });
      }
      return;
    }

    runWithPrivacy(() => {
      this.setData({ locationLoading: true });
      wx.getFuzzyLocation({
        type: 'wgs84',
        success: (result) => {
          const profile = resolveCityFromLocation(result.latitude, result.longitude);
          setActiveCity(app, profile.city, '模糊定位', {
            latitude: result.latitude,
            longitude: result.longitude
          });
          this.refreshLocation();
          if (!silent) {
            wx.showToast({ title: `定位到${profile.city}` });
          }
        },
        fail: () => {
          if (!silent) {
            wx.showModal({
              title: '定位未开启',
              content: '你可以继续手动选择订单城市；授权定位后，首页会自动匹配最近服务城市。',
              showCancel: false
            });
          }
        },
        complete: () => {
          this.setData({ locationLoading: false });
        }
      });
    }, '请先同意隐私保护指引再使用定位');
  },

  onOrderCityChange(event) {
    const index = Number(event.detail.value);
    const city = this.data.supportedCities[index] || app.globalData.city;
    setOrderCity(app, city);
    this.refreshLocation();
    wx.showToast({ title: `订单城市：${city}` });
  },

  goDesign() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design' });
  },

  goTaskHub() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/design/design?showTasks=1' });
  },

  goWorks() {
    wx.switchTab({ url: '/pages/works/works' });
  },

  goOrders() {
    app.globalData.accountRole = 'player';
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  toggleStarterGuide() {
    this.setData({ showStarterGuide: !this.data.showStarterGuide });
  },

  playPrimaryChallenge() {
    const task = this.data.primaryChallenge || this.data.challenges[0] || null;
    if (!task) {
      this.goDesign();
      return;
    }
    this.joinChallenge(task);
  },

  async playChallenge(event) {
    const id = event.currentTarget.dataset.id;
    const task = this.data.challenges.find((item) => item.id === id) || null;
    this.joinChallenge(task);
  },

  async joinChallenge(task) {
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
        if (promptLoginRequired(error, {
          action: 'task-join',
          url: '/pages/design/design',
          title: '登录后参与任务'
        })) {
          return;
        }
        app.globalData.pendingChallenge = task;
      }
    }
    wx.navigateTo({ url: '/pages/design/design' });
  }
});
