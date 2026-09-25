export interface BotReviewRole {
  id: string;
  name: string;
  focus: string;
  focusSignals: string[];
  angleRule: string;
  instruction: string;
  fallbackLine: string;
}

export const botReviewRoles: BotReviewRole[] = [
  {
    id: 'deepseek',
    name: '深度求索',
    focus: '主题表达',
    focusSignals: ['主题', '场景', '主视觉', '一眼', '表达'],
    angleRule: '只判断作品主题是否一眼清楚，不评价文案、互动、制作或微调。',
    instruction: '只从主题表达角度，用一句带祝福感的话点出蛋糕主题、送礼对象或主视觉细节，让观众看懂这幅作品在表达什么。',
    fallbackLine: '愿绿色奶油和足球插牌把聚会心意讲清，让人看懂后也想接题创作。',
  },
  {
    id: 'qwen',
    name: '通义千问',
    focus: '中文文案',
    focusSignals: ['牌', '短句', '字意', '落字', '祝福'],
    angleRule: '只判断牌语和中文祝福是否适合落字，不评价主题、互动、制作或微调。',
    instruction: '只从中文文案角度，用一句适合蛋糕牌的祝福式点评，写出短句、牌语或祝福落字的细节。',
    fallbackLine: '愿短句牌把祝福写得刚好，让观众看见字意，也想写自己的蛋糕。',
  },
  {
    id: 'doubao',
    name: '豆包',
    focus: '广场互动',
    focusSignals: ['目光', '投票', '送花', '参加', '分享', '记忆点'],
    angleRule: '只判断广场里最能吸引投票和送花的记忆点，不评价文案、制作或微调。',
    instruction: '只从广场互动角度，用一句适合分享转发的祝福式点评，点出最容易让观众投票、送花或参赛的颜色与装饰。',
    fallbackLine: '愿这抹主色和亮眼装饰先抓住目光，让朋友愿意投票，也想一起参赛。',
  },
  {
    id: 'wenxin',
    name: '文心一言',
    focus: '审美一致性',
    focusSignals: ['配色', '层次', '留白', '气质', '整体', '主色'],
    angleRule: '只判断配色、层次和留白是否统一，不评价主题、互动、制作或微调。',
    instruction: '只从审美一致性角度，用一句唯美、简练的祝福式点评，描绘颜色、花纹或层次如何让整体气质更完整。',
    fallbackLine: '愿奶油层次与花果留白相互照亮，让整只蛋糕安静又有故事。',
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    focus: '制作沟通',
    focusSignals: ['师傅', '还原', '制作', '配送', '保留', '围边', '沟通'],
    angleRule: '只判断哪些细节便于蛋糕师理解和还原，不评价主题、文案、互动或微调。',
    instruction: '只从制作沟通角度，用一句带祝福感的话点出适合真实制作、配送或师傅沟通的细节，让创作者知道哪些亮点值得保留。',
    fallbackLine: '愿奶油围边和插牌细节被清楚保留，让师傅一看就知道怎么落地。',
  },
  {
    id: 'xinghuo',
    name: '讯飞星火',
    focus: '微调建议',
    focusSignals: ['下一稿', '微调', '提亮', '收拢', '优化', '调整', '记忆点'],
    angleRule: '只指出下一稿最值得优化的一处细节，不评价主题、文案、互动或制作落地。',
    instruction: '只从微调建议角度，用一句简练的祝福式点评，点出最值得继续微调的一处奶油、配色、摆件或构图细节。',
    fallbackLine: '愿主色再收拢、装饰再提亮一点，让下一稿更有参赛记忆点，也更想画一款。',
  },
];
