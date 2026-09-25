export interface MarketingCalendarNode {
  id: string;
  title: string;
  dateRange?: [string, string];
  monthDayRange?: [string, string];
  promptHint: string;
  scenario: string;
  style: string;
  color: string;
  tags: string[];
}

export interface MarketingCalendarContext {
  dateKey: string;
  activeNodes: MarketingCalendarNode[];
  evergreenNodes: MarketingCalendarNode[];
  promptSummary: string;
}

export const marketingCalendarNodes: MarketingCalendarNode[] = [
  {
    id: 'world-cup-2026',
    title: '世界杯观赛蛋糕',
    dateRange: ['2026-06-11', '2026-07-19'],
    promptHint: '世界杯观赛、朋友聚会、足球元素、球队配色、进球庆祝，避免真实队徽和商标',
    scenario: '聚会',
    style: '运动派对',
    color: '绿色',
    tags: ['世界杯', '观赛', '派对'],
  },
  {
    id: 'graduation-season',
    title: '毕业高光款',
    monthDayRange: ['05-20', '07-10'],
    promptHint: '毕业季祝福、青春告别、花束、学士帽、短祝福牌，适合拍毕业照',
    scenario: '毕业',
    style: '高级简约',
    color: '蓝色',
    tags: ['毕业季', '祝福', '青春'],
  },
  {
    id: 'school-opening',
    title: '开学好运蛋糕',
    monthDayRange: ['08-20', '09-15'],
    promptHint: '开学季、新开始、好运鼓励、清爽明亮、学生送礼',
    scenario: '开学',
    style: '清新可爱',
    color: '白绿',
    tags: ['开学季', '好运', '学生'],
  },
  {
    id: 'spring-outing',
    title: '踏青野餐蛋糕',
    monthDayRange: ['03-10', '04-20'],
    promptHint: '春天踏青、野餐、鲜花、水果、轻盈奶油、户外拍照',
    scenario: '踏青',
    style: '自然花艺',
    color: '白绿',
    tags: ['踏青', '野餐', '春日'],
  },
  {
    id: 'qixi-love',
    title: '七夕告白蛋糕',
    monthDayRange: ['08-01', '08-31'],
    promptHint: '七夕、告白、纪念日、情侣送礼、浪漫但不幼稚',
    scenario: '情侣',
    style: '韩系奶油风',
    color: '粉色',
    tags: ['七夕', '告白', '情侣'],
  },
  {
    id: 'double-eleven',
    title: '双11下单仪式感',
    monthDayRange: ['11-01', '11-12'],
    promptHint: '双11、犒劳自己、闺蜜拼单、下单仪式感、精致可爱',
    scenario: '闺蜜',
    style: '可爱卡通',
    color: '红色',
    tags: ['双11', '犒劳', '闺蜜'],
  },
  {
    id: 'christmas',
    title: '圣诞派对蛋糕',
    monthDayRange: ['12-01', '12-26'],
    promptHint: '圣诞月、朋友派对、交换礼物、红绿色氛围、节日聚会',
    scenario: '聚会',
    style: '节日派对',
    color: '红色',
    tags: ['圣诞', '派对', '礼物'],
  },
];

export const evergreenMarketingNodes: MarketingCalendarNode[] = [
  {
    id: 'lover-bow',
    title: '告白蝴蝶结',
    promptHint: '告白送礼、粉色蝴蝶结、甜但不幼稚、适合朋友圈分享',
    scenario: '情侣',
    style: '韩系奶油风',
    color: '粉色',
    tags: ['告白', '蝴蝶结', '送礼'],
  },
  {
    id: 'pet-party',
    title: '宠物生日会',
    promptHint: '宠物生日、可爱卡通头像、拍照分享、主人和宠物纪念',
    scenario: '宠物',
    style: '可爱卡通',
    color: '白绿',
    tags: ['宠物', '生日', '可爱'],
  },
  {
    id: 'fruit-fresh',
    title: '鲜果治愈款',
    promptHint: '鲜果奶油、干净治愈、朋友聚会、生日高频、适合本地蛋糕师沟通',
    scenario: '生日',
    style: '清新水果',
    color: '白绿',
    tags: ['鲜果', '生日', '可制作'],
  },
];

export function getMarketingCalendarContext(date = new Date()): MarketingCalendarContext {
  const dateKey = toDateKey(date);
  const activeNodes = marketingCalendarNodes.filter((node) => isNodeActive(node, date));
  const visibleNodes = activeNodes.length ? activeNodes : evergreenMarketingNodes.slice(0, 2);

  return {
    dateKey,
    activeNodes,
    evergreenNodes: evergreenMarketingNodes,
    promptSummary: [
      `今日日期：${dateKey}`,
      '支持的营销日历：世界杯、毕业季、开学季、踏青、七夕、双11、圣诞，以及告白、宠物生日、鲜果生日等常驻主题。',
      `当前营销节点：${visibleNodes.map((node) => `${node.title}(${node.promptHint})`).join('；')}`,
    ].join('\n'),
  };
}

function isNodeActive(node: MarketingCalendarNode, date: Date) {
  if (node.dateRange) {
    const value = toDateKey(date);
    return value >= node.dateRange[0] && value <= node.dateRange[1];
  }
  if (node.monthDayRange) {
    const value = toMonthDay(date);
    return value >= node.monthDayRange[0] && value <= node.monthDayRange[1];
  }
  return false;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${toTwo(date.getMonth() + 1)}-${toTwo(date.getDate())}`;
}

function toMonthDay(date: Date) {
  return `${toTwo(date.getMonth() + 1)}-${toTwo(date.getDate())}`;
}

function toTwo(value: number) {
  return `${value}`.padStart(2, '0');
}
