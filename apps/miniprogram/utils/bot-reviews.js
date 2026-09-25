const botReviewSeats = [
  { id: 'deepseek', name: '深度求索', focus: '主题表达' },
  { id: 'qwen', name: '通义千问', focus: '中文文案' },
  { id: 'doubao', name: '豆包', focus: '广场互动' },
  { id: 'wenxin', name: '文心一言', focus: '审美一致性' },
  { id: 'hunyuan', name: '腾讯混元', focus: '制作沟通' },
  { id: 'xinghuo', name: '讯飞星火', focus: '微调建议' }
];

const detailMatchers = [
  { pattern: /足球|草坪|观赛/, detail: '足球插牌' },
  { pattern: /花束|花艺|花朵|玫瑰/, detail: '花束裱花' },
  { pattern: /蝴蝶结/, detail: '蝴蝶结摆件' },
  { pattern: /皇冠/, detail: '皇冠插牌' },
  { pattern: /珍珠|糖珠/, detail: '糖珠亮点' },
  { pattern: /云朵/, detail: '云朵奶油纹' },
  { pattern: /星星|银河|流星/, detail: '星点糖珠' },
  { pattern: /心形|爱心/, detail: '心形裱花' },
  { pattern: /草莓|蓝莓|芒果|葡萄|鲜果|水果|果香/, detail: '鲜果围边' },
  { pattern: /祝福|牌|字/, detail: '祝福牌' }
];

function readValue(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function reviewContext(work) {
  const title = readValue(work && work.title, '这款蛋糕');
  const prompt = readValue(work && work.prompt, '');
  const scenario = readValue(work && work.scenario, '送礼');
  const style = readValue(work && work.style, '');
  const color = readValue(work && work.color, '主色');
  const text = `${title} ${prompt} ${scenario} ${style}`;
  const detail = detailMatchers.find((item) => item.pattern.test(text));
  const plaque = /祝福|牌|字/.test(text) ? '祝福牌' : '短句牌';
  return {
    title,
    scenario,
    color,
    detail: detail ? detail.detail : '奶油花边',
    plaque,
    structure: /双层|双层蛋糕/.test(text)
      ? '双层结构'
      : /足球|草坪|观赛/.test(text)
        ? '顶部主题构图'
        : /花束|花艺|玫瑰/.test(text)
          ? '上层花束构图'
          : '奶油构图',
    surface: /足球|草坪|观赛/.test(text) ? '草坪面' : /花束|花艺|玫瑰/.test(text) ? '花束面' : '奶油面'
  };
}

function buildLine(botId, ctx) {
  if (botId === 'deepseek') {
    return `愿${ctx.color}奶油托住${ctx.detail}，让${ctx.scenario}主题一眼读懂，也让人想来创作。`;
  }
  if (botId === 'qwen') {
    return `愿${ctx.plaque}和${ctx.detail}把祝福写得刚好，让人看见字意，也想写自己的蛋糕。`;
  }
  if (botId === 'doubao') {
    return `愿${ctx.color}主色和${ctx.detail}先抓住目光，让观众想投票，也想跟着参加一题。`;
  }
  if (botId === 'wenxin') {
    return `愿${ctx.surface}层次映着${ctx.detail}轻轻发亮，让人看懂氛围，也想试着画一款。`;
  }
  if (botId === 'hunyuan') {
    return `愿${ctx.structure}里的${ctx.detail}和奶油围边都被清楚保留，让师傅一看就懂，也让人想试着做一款。`;
  }
  return `愿${ctx.detail}在${ctx.color}主色里再提亮半分，让下一稿更有记忆点，也更想画一款。`;
}

function buildBotReviewPreview(work) {
  const ctx = reviewContext(work);
  const workId = work && work.id ? work.id : 'preview';
  return botReviewSeats.map((bot) => ({
    id: `${workId}-${bot.id}`,
    botId: bot.id,
    name: bot.name,
    focus: bot.focus,
    line: buildLine(bot.id, ctx),
  }));
}

module.exports = {
  botReviewSeats,
  buildBotReviewPreview,
};
