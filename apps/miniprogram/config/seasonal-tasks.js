const seasonalTaskCatalog = [
  {
    id: 'world-cup-2026',
    title: '世界杯观赛蛋糕',
    dateRange: ['2026-06-11', '2026-07-19'],
    botLine: '灵感官：世界杯期间适合做观赛派对、球队配色和进球庆祝蛋糕。',
    prompt: '世界杯观赛派对蛋糕，足球元素，适合朋友聚会拍照分享',
    scenario: '聚会',
    style: '运动派对',
    color: '绿色',
    rewardAmount: 96,
    tags: ['世界杯', '观赛', '派对']
  },
  {
    id: 'graduation-season',
    title: '毕业高光款',
    monthDayRange: ['05-20', '07-10'],
    botLine: '灵感官：毕业季需求强，做一款能被朋友圈转发的祝福蛋糕。',
    prompt: '送给毕业朋友，清爽高级，有祝福感，适合拍毕业照',
    scenario: '毕业',
    style: '高级简约',
    color: '蓝色',
    rewardAmount: 88,
    tags: ['毕业季', '祝福', '青春']
  },
  {
    id: 'school-opening',
    title: '开学好运蛋糕',
    monthDayRange: ['08-20', '09-15'],
    botLine: '灵感官：开学季适合做好运、鼓励和新开始主题。',
    prompt: '开学季好运蛋糕，清爽明亮，带一点鼓励和新开始的感觉',
    scenario: '开学',
    style: '清新可爱',
    color: '白绿',
    rewardAmount: 58,
    tags: ['开学季', '好运', '学生']
  },
  {
    id: 'spring-outing',
    title: '踏青野餐蛋糕',
    monthDayRange: ['03-10', '04-20'],
    botLine: '灵感官：春天踏青适合鲜花、水果和轻盈奶油风。',
    prompt: '踏青野餐蛋糕，鲜花水果，轻盈自然，适合户外拍照',
    scenario: '踏青',
    style: '自然花艺',
    color: '白绿',
    rewardAmount: 52,
    tags: ['踏青', '野餐', '春日']
  },
  {
    id: 'qixi-love',
    title: '七夕告白蛋糕',
    monthDayRange: ['08-01', '08-31'],
    botLine: '灵感官：七夕前后适合告白、纪念日和情侣款。',
    prompt: '七夕告白蛋糕，浪漫但不幼稚，适合送给喜欢的人',
    scenario: '情侣',
    style: '韩系奶油风',
    color: '粉色',
    rewardAmount: 77,
    tags: ['七夕', '告白', '情侣']
  },
  {
    id: 'double-eleven',
    title: '双11下单仪式感',
    monthDayRange: ['11-01', '11-12'],
    botLine: '灵感官：双11适合做犒劳自己、闺蜜拼单和庆祝下单主题。',
    prompt: '双11犒劳自己的蛋糕，精致可爱，有下单仪式感',
    scenario: '闺蜜',
    style: '可爱卡通',
    color: '红色',
    rewardAmount: 61,
    tags: ['双11', '犒劳', '闺蜜']
  },
  {
    id: 'christmas',
    title: '圣诞派对蛋糕',
    monthDayRange: ['12-01', '12-26'],
    botLine: '灵感官：圣诞月适合做派对、交换礼物和红绿色氛围。',
    prompt: '圣诞派对蛋糕，红绿配色，适合交换礼物和朋友聚会',
    scenario: '聚会',
    style: '节日派对',
    color: '红色',
    rewardAmount: 68,
    tags: ['圣诞', '派对', '礼物']
  }
].map(withTagText);

const evergreenTasks = [
  {
    id: 'lover-bow',
    title: '告白蝴蝶结',
    botLine: '灵感官：做一款适合发朋友圈的告白蛋糕。',
    prompt: '送给喜欢的人，粉色蝴蝶结，甜但不幼稚',
    scenario: '情侣',
    style: '韩系奶油风',
    color: '粉色',
    rewardAmount: 66,
    tags: ['告白', '蝴蝶结', '送礼']
  },
  {
    id: 'pet-party',
    title: '宠物生日会',
    botLine: '灵感官：宠物主题最近很容易被分享。',
    prompt: '给宠物过生日，可爱卡通头像，适合拍照分享',
    scenario: '宠物',
    style: '可爱卡通',
    color: '白绿',
    rewardAmount: 38,
    tags: ['宠物', '生日', '可爱']
  },
  {
    id: 'fruit-fresh',
    title: '鲜果治愈款',
    botLine: '灵感官：水果蛋糕更容易被蛋糕师还原，也适合长治本地服务场景。',
    prompt: '鲜果奶油蛋糕，水果饱满，干净治愈，适合生日和朋友聚会',
    scenario: '生日',
    style: '清新水果',
    color: '白绿',
    rewardAmount: 42,
    tags: ['鲜果', '生日', '可制作']
  }
].map(withTagText);

function getSeasonalTaskBoard(date = new Date()) {
  const active = seasonalTaskCatalog
    .filter((task) => isTaskActive(task, date))
    .map((task) => decorateSeasonalTask(task, date, 'active'));
  const upcoming = seasonalTaskCatalog
    .filter((task) => !active.some((item) => item.id === task.id))
    .map((task) => ({
      task,
      daysUntil: daysUntilTaskStart(task, date)
    }))
    .filter((item) => item.daysUntil >= 0 && item.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .map((item) => decorateSeasonalTask(item.task, date, 'upcoming', item.daysUntil));
  const evergreen = evergreenTasks.map((task) => decorateSeasonalTask(task, date, 'evergreen'));

  return {
    active,
    upcoming,
    evergreen
  };
}

function getSeasonalTasks(date = new Date()) {
  const board = getSeasonalTaskBoard(date);
  const tasks = board.active.concat(board.upcoming, board.evergreen);
  return tasks.slice(0, 5);
}

function isTaskActive(task, date) {
  if (task.dateRange) {
    return isWithinDateRange(date, task.dateRange[0], task.dateRange[1]);
  }
  if (task.monthDayRange) {
    return isWithinMonthDayRange(date, task.monthDayRange[0], task.monthDayRange[1]);
  }
  return false;
}

function isWithinDateRange(date, start, end) {
  const value = toDateKey(date);
  return value >= start && value <= end;
}

function isWithinMonthDayRange(date, start, end) {
  const monthDay = toMonthDay(date);
  return monthDay >= start && monthDay <= end;
}

function daysUntilTaskStart(task, date) {
  const startDate = resolveTaskStartDate(task, date);
  if (!startDate) return Number.POSITIVE_INFINITY;
  const start = stripTime(startDate).getTime();
  const now = stripTime(date).getTime();
  return Math.round((start - now) / 86400000);
}

function resolveTaskStartDate(task, date) {
  if (task.dateRange) {
    const start = new Date(`${task.dateRange[0]}T00:00:00`);
    const end = new Date(`${task.dateRange[1]}T23:59:59`);
    if (stripTime(date).getTime() > stripTime(end).getTime()) return null;
    return start;
  }
  if (!task.monthDayRange) return null;
  const [month, day] = task.monthDayRange[0].split('-').map((value) => Number(value));
  const start = new Date(date.getFullYear(), month - 1, day);
  if (stripTime(start).getTime() < stripTime(date).getTime()) {
    return new Date(date.getFullYear() + 1, month - 1, day);
  }
  return start;
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date) {
  const year = date.getFullYear();
  return `${year}-${toTwo(date.getMonth() + 1)}-${toTwo(date.getDate())}`;
}

function toMonthDay(date) {
  return `${toTwo(date.getMonth() + 1)}-${toTwo(date.getDate())}`;
}

function toTwo(value) {
  return `${value}`.padStart(2, '0');
}

function withTagText(task) {
  return Object.assign({}, task, {
    tagText: (task.tags || []).join(',')
  });
}

function decorateSeasonalTask(task, date, phase, daysUntil) {
  const cycleText = task.dateRange
    ? `${task.dateRange[0]} - ${task.dateRange[1]}`
    : task.monthDayRange
      ? `${task.monthDayRange[0]} - ${task.monthDayRange[1]}`
      : '常驻任务';
  const periodLabel =
    phase === 'active'
      ? '正在进行'
      : phase === 'upcoming'
        ? `距开题 ${daysUntil} 天`
        : '常驻灵感';
  const publishHint =
    phase === 'active'
      ? '现在就能参与本周期比赛'
      : phase === 'upcoming'
        ? '提前看题，方便先打草稿和攒灵感'
        : '没有节日节点时也能持续练习';
  return Object.assign({}, task, {
    phase,
    cycleText,
    periodLabel,
    publishHint,
    daysUntil: typeof daysUntil === 'number' ? daysUntil : 0,
    scheduleText: phase === 'active' ? `本轮周期 ${cycleText}` : phase === 'upcoming' ? `将在 ${cycleText.split(' - ')[0]} 左右开题` : '全年都可拿来练习构图和风格'
  });
}

module.exports = {
  seasonalTaskCatalog,
  evergreenTasks,
  getSeasonalTaskBoard,
  getSeasonalTasks
};
